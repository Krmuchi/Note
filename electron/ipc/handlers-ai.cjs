// AI 类 IPC handlers：注册 ai:* 通道、推送流式事件、按 WebContents 生命周期清理在途请求。
// 结构对齐 handlers-storage.cjs（工厂函数 + register()）。

const { createConfigStore } = require('../ai/config-store.cjs');
const { createAiService } = require('../ai/ai-service.cjs');
const { assertAiRequestPayload, assertBatchPayload, assertRequestId } = require('../ai/ai-validate.cjs');
const { toAiError, redactSecrets } = require('../ai/error-map.cjs');

const STREAM_EVENT_CHANNEL = 'ai:stream:event';

/**
 * @param {object} deps
 * @param {Electron.App} deps.app
 * @param {Electron.IpcMain} deps.ipcMain
 * @param {object} deps.safeStorage 必须在 app.whenReady() 之后可用
 * @param {object} [deps.logger]
 * @param {Function} [deps.fetchImpl]
 */
function createAiHandlers(deps) {
  const { app, ipcMain, safeStorage, logger = console, fetchImpl } = deps;

  const configStore = createConfigStore({ app, safeStorage, logger });
  const service = createAiService({ configStore, logger, fetchImpl });

  /** requestId → webContents.id，用于窗口销毁时清理其在途流 */
  const streamOwners = new Map();
  /** 已挂过 destroyed 监听的 WebContents，避免每个流都加一个监听器 */
  const hookedSenders = new Set();

  function envelopeError(err) {
    if (!err || !err.aiError) {
      logger.error(
        '[ai] 未预期的错误：',
        redactSecrets(err && err.stack ? err.stack : String(err)),
      );
    }
    return { ok: false, error: toAiError(err) };
  }

  /**
   * 只发给发起请求的那个 WebContents。
   * 绝不能用 BrowserWindow.getAllWindows().forEach(...) 广播 ——
   * app.on('activate') 会再建窗口，多窗口下 B 窗口会渲染 A 窗口的 AI 输出，
   * 既串台又跨窗口泄露笔记内容。
   */
  function sendToSender(sender, payload) {
    // 流式期间关窗口会抛 "Object has been destroyed"，必须先判活
    if (!sender || sender.isDestroyed()) return;
    try {
      sender.send(STREAM_EVENT_CHANNEL, payload);
    } catch (err) {
      logger.warn('[ai] 推送流事件失败：', err && err.message ? err.message : err);
    }
  }

  /** 每个 WebContents 只挂钩一次 destroyed，窗口关闭时中断其所有在途流 */
  function ensureSenderHook(sender) {
    if (!sender || typeof sender.once !== 'function' || hookedSenders.has(sender.id)) return;
    hookedSenders.add(sender.id);
    sender.once('destroyed', () => {
      hookedSenders.delete(sender.id);
      abortStreamsForSender(sender.id);
    });
  }

  function abortStreamsForSender(senderId) {
    for (const [requestId, ownerId] of streamOwners) {
      if (ownerId === senderId) {
        service.cancel(requestId);
        streamOwners.delete(requestId);
      }
    }
  }

  function register() {
    ipcMain.handle('ai:config:get', () => configStore.getView());

    ipcMain.handle('ai:config:set', async (_event, payload) => {
      try {
        return await service.updateConfig(payload);
      } catch (err) {
        return envelopeError(err);
      }
    });

    ipcMain.handle('ai:config:clear', async () => {
      try {
        return await service.clearConfig();
      } catch (err) {
        return envelopeError(err);
      }
    });

    ipcMain.handle('ai:config:test', async (_event, payload) => {
      try {
        return await service.testConnection(payload);
      } catch (err) {
        return envelopeError(err);
      }
    });

    ipcMain.handle('ai:models:list', async (_event, payload) => {
      try {
        return await service.listModels(payload);
      } catch (err) {
        return envelopeError(err);
      }
    });

    ipcMain.handle('ai:generate', async (_event, payload) => {
      try {
        const normalized = assertAiRequestPayload(payload, {
          maxInputTokens: configStore.getConfig().maxInputTokens,
        });
        return await service.runNonStream(normalized, {
          // bypassCache 是「重新生成」用的提示位，不在请求白名单里，从原始载荷读取
          bypassCache: !!(payload && payload.bypassCache === true),
        });
      } catch (err) {
        return envelopeError(err);
      }
    });

    ipcMain.handle('ai:batch', async (_event, payloads) => {
      try {
        const normalized = assertBatchPayload(payloads, {
          maxInputTokens: configStore.getConfig().maxInputTokens,
        });
        const results = await service.runBatch(normalized, { continueOnError: true });
        return { ok: true, results };
      } catch (err) {
        return envelopeError(err);
      }
    });

    ipcMain.handle('ai:stream:start', async (event, payload) => {
      try {
        const normalized = assertAiRequestPayload(payload, {
          maxInputTokens: configStore.getConfig().maxInputTokens,
        });
        const sender = event.sender;
        ensureSenderHook(sender);

        const emit = (streamEvent) => {
          sendToSender(sender, streamEvent);
          if (streamEvent.type === 'done' || streamEvent.type === 'error') {
            streamOwners.delete(streamEvent.requestId);
          }
        };

        const result = service.startStream(normalized, emit);
        if (result.ok && sender && !sender.isDestroyed()) {
          streamOwners.set(normalized.requestId, sender.id);
        }
        return result;
      } catch (err) {
        return envelopeError(err);
      }
    });

    ipcMain.handle('ai:cancel', async (_event, payload) => {
      try {
        const requestId = assertRequestId(payload && payload.requestId);
        const cancelled = service.cancel(requestId);
        streamOwners.delete(requestId);
        return { ok: true, cancelled };
      } catch (err) {
        return envelopeError(err);
      }
    });
  }

  /** 读配置（safeStorage 需在 app.whenReady() 之后调用） */
  async function load() {
    await configStore.load();
    return configStore.getView();
  }

  return {
    load,
    register,
    abortStreamsForSender,
    getView: () => configStore.getView(),
    getService: () => service,
    getConfigStore: () => configStore,
    get activeStreamCount() {
      return streamOwners.size;
    },
  };
}

module.exports = { STREAM_EVENT_CHANNEL, createAiHandlers };