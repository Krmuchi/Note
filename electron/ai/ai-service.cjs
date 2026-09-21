// AI 编排层：读配置 → 构造 messages → 并发闸门 → 缓存 → 重试 → fetch → 推送流事件 → 统一信封。
//
// 这是主进程里唯一发生网络请求的地方（依赖注入 fetchImpl，便于测试替身）。
// 所有对外方法都返回信封（{ ok: true, ... } / { ok: false, error }），不向上抛运行时错误 ——
// ipcMain.handle 抛出的错误经 Electron 序列化后只剩 message 字符串，code/retryable 会全部丢失。

const { createHash } = require('node:crypto');

const {
  AI_ERROR_CODES,
  aiError,
  aiErrorException,
  toAiError,
  classifyHttpStatus,
  classifyException,
  redactSecrets,
} = require('./error-map.cjs');
const { buildMessages, resolveParams, TEMPLATE_VERSION } = require('./prompt-templates.cjs');
const {
  buildChatUrl,
  buildModelsUrl,
  buildHeaders,
  buildModelsHeaders,
  buildChatRequest,
  parseChatCompletion,
  parseModelsResponse,
  normalizeMarkdown,
  extractTitle,
  isStreamOptionsRejection,
  extractErrorDetail,
} = require('./openai-adapter.cjs');
const { createSseParser, decodeChunk, flushDecoder } = require('./sse-parser.cjs');
const { withRetry, parseRetryAfter, MAX_ATTEMPTS } = require('./retry.cjs');
const { createLruCache } = require('./lru-cache.cjs');
const { createGate, DEFAULT_LIMIT } = require('./concurrency.cjs');
const { assertAiConfigPayload } = require('./ai-validate.cjs');

/** 流式增量合流窗口（约 60fps），避免一字一条 IPC */
const STREAM_FLUSH_MS = 16;
/**
 * 连通性测试的输出预算。
 * 不能太小：推理型模型（DeepSeek-R1、小米 MiMo 思考模式等）的 max_tokens 包含思维链，
 * 32 这种量级会被推理过程吃光，导致可见正文为空、误判成连接失败。
 */
const TEST_MAX_TOKENS = 256;
const FIRST_BYTE_TIMEOUT_CAP_MS = 20000;

function makeCacheKey({ capability, model, temperature, maxTokens, maxTokensParam, messages }) {
  const payload = JSON.stringify({
    v: TEMPLATE_VERSION,
    capability,
    model,
    temperature,
    maxTokens,
    maxTokensParam,
    messages,
  });
  return createHash('sha256').update(payload).digest('hex');
}

async function safeReadText(response) {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function readHeader(response, name) {
  try {
    if (response && response.headers && typeof response.headers.get === 'function') {
      return response.headers.get(name);
    }
  } catch {
    /* 响应对象异常时按无该头处理 */
  }
  return null;
}

/** 组合超时与用户取消，用一个 controller 承载并记录中止原因 */
function createAttemptSignal({ timeoutMs, userSignal }) {
  const controller = new AbortController();
  const flags = { timedOut: false, userCancelled: false };
  const timer = setTimeout(() => {
    flags.timedOut = true;
    controller.abort();
  }, timeoutMs);

  let listening = false;
  const onUserAbort = () => {
    flags.userCancelled = true;
    controller.abort();
  };
  if (userSignal) {
    if (userSignal.aborted) {
      flags.userCancelled = true;
      controller.abort();
    } else {
      userSignal.addEventListener('abort', onUserAbort, { once: true });
      listening = true;
    }
  }

  return {
    controller,
    flags,
    dispose() {
      clearTimeout(timer);
      // 必须移除，否则跨请求累积监听器（长会话下的泄漏来源）
      if (listening) userSignal.removeEventListener('abort', onUserAbort);
    },
  };
}

/**
 * @param {object} deps
 * @param {object} deps.configStore createConfigStore 实例
 * @param {Function} [deps.fetchImpl]
 * @param {() => number} [deps.now]
 * @param {Function} [deps.sleep]
 * @param {object} [deps.logger]
 * @param {object} [deps.cache]
 * @param {object} [deps.gate]
 */
function createAiService(deps) {
  const {
    configStore,
    fetchImpl = globalThis.fetch,
    now = Date.now,
    sleep,
    logger = console,
    cache = createLruCache(),
    gate = createGate({ limit: DEFAULT_LIMIT }),
  } = deps;

  /** @type {Map<string, {userCancelled: boolean, abortCurrent: (() => void) | null}>} */
  const activeStreams = new Map();

  const retryOptions = {
    maxAttempts: MAX_ATTEMPTS,
    classify: (err) => ({ retryable: !!(err && err.aiError && err.aiError.retryable) }),
    retryAfterMs: (err) => (err && Number.isFinite(err.retryAfterMs) ? err.retryAfterMs : null),
    ...(sleep ? { sleep } : {}),
  };

  function toWrappedError(err, flags, timeoutMs) {
    if (err && err.aiError) return err;
    const code = classifyException(err, flags);
    return aiErrorException(code, { n: Math.round(timeoutMs / 1000) });
  }

  /** 取配置并构造请求上下文；未配置/未授权时抛 NOT_CONFIGURED */
  function resolveContext(normalized) {
    const config = configStore.getConfig();
    const apiKey = configStore.readApiKey();
    if (!config.baseUrl || !config.model || !apiKey || !config.consent) {
      throw aiErrorException(AI_ERROR_CODES.NOT_CONFIGURED);
    }
    const messages = buildMessages(normalized);
    const { temperature, maxTokens } = resolveParams(normalized, { maxTokensCap: config.maxTokens });
    return {
      config,
      apiKey,
      messages,
      temperature,
      maxTokens,
      url: buildChatUrl(config.baseUrl),
      capability: normalized.capability,
      topic: normalized.topic,
    };
  }

  function applyRuntimeConfig(config) {
    gate.setLimit(config.concurrency);
  }

  /** 单次非流式请求（不含重试与超时，由调用方组装） */
  async function requestOnce(ctx, { signal, flags, timeoutMs }) {
    let response;
    try {
      response = await fetchImpl(ctx.url, {
        method: 'POST',
        headers: buildHeaders(ctx.apiKey, false),
        body: JSON.stringify(
          buildChatRequest({
            model: ctx.config.model,
            messages: ctx.messages,
            temperature: ctx.temperature,
            maxTokens: ctx.maxTokens,
            stream: false,
            maxTokensParam: ctx.config.maxTokensParam,
          }),
        ),
        signal,
      });
    } catch (err) {
      throw toWrappedError(err, flags, timeoutMs);
    }

    if (!response.ok) {
      const text = await safeReadText(response);
      const code = classifyHttpStatus(response.status, text);
      const err = aiErrorException(code, {
        httpStatus: response.status,
        detail: extractErrorDetail(text),
      });
      err.retryAfterMs = parseRetryAfter(readHeader(response, 'retry-after'), now);
      throw err;
    }

    let json;
    try {
      json = await response.json();
    } catch {
      throw aiErrorException(AI_ERROR_CODES.BAD_FORMAT);
    }
    return parseChatCompletion(json, {
      capability: ctx.capability,
      topic: ctx.topic,
      fallbackModel: ctx.config.model,
      maxTokens: ctx.maxTokens,
    });
  }

  /**
   * 非流式请求（带缓存 + 并发闸门 + 重试），始终返回信封。
   * @param {object} normalized 已通过 assertAiRequestPayload 校验
   * @param {{bypassCache?: boolean, userSignal?: AbortSignal}} [options]
   */
  async function runNonStream(normalized, options = {}) {
    const start = now();
    let attemptsUsed = 0;

    try {
      const ctx = resolveContext(normalized);
      const config = ctx.config;
      applyRuntimeConfig(config);

      const cacheKey = makeCacheKey({
        capability: normalized.capability,
        model: config.model,
        temperature: ctx.temperature,
        maxTokens: ctx.maxTokens,
        maxTokensParam: config.maxTokensParam,
        messages: ctx.messages,
      });

      const load = async () => {
        attemptsUsed += 1;
        const attempt = createAttemptSignal({ timeoutMs: config.timeoutMs, userSignal: options.userSignal });
        try {
          return await requestOnce(ctx, {
            signal: attempt.controller.signal,
            flags: attempt.flags,
            timeoutMs: config.timeoutMs,
          });
        } finally {
          attempt.dispose();
        }
      };

      const run = () => withRetry(load, retryOptions);

      let value;
      let cached = false;
      if (config.cacheEnabled) {
        // 「重新生成」带 bypassCache：跳过读缓存但仍写缓存
        if (options.bypassCache) {
          value = await gate.run(run);
        } else {
          const loaded = await cache.getOrLoad(cacheKey, () => gate.run(run));
          value = loaded.value;
          cached = loaded.cached;
        }
      } else {
        value = await gate.run(run);
      }

      const response = {
        ok: true,
        requestId: normalized.requestId,
        capability: normalized.capability,
        text: value.text,
        model: value.model || config.model,
        cached,
        latencyMs: Math.max(0, now() - start),
      };
      if (value.title) response.title = value.title;
      if (value.usage) response.usage = value.usage;
      return response;
    } catch (err) {
      return { ok: false, error: toAiError(err, { attempts: attemptsUsed }) };
    }
  }

  /** 把 SSE 事件流里的 delta 事件喂给 pushDelta */
  function consumeEvents(events, pushDelta) {
    for (const event of events) {
      if (event.type === 'delta') pushDelta(event.delta);
    }
  }

  /** 单次流式请求：返回归一化后的完整结果 */
  async function streamAttempt({ ctx, disableStreamOptions, signal, flags, timeoutMs, pushDelta }) {
    let response;
    try {
      response = await fetchImpl(ctx.url, {
        method: 'POST',
        headers: buildHeaders(ctx.apiKey, true),
        body: JSON.stringify(
          buildChatRequest({
            model: ctx.config.model,
            messages: ctx.messages,
            temperature: ctx.temperature,
            maxTokens: ctx.maxTokens,
            stream: true,
            maxTokensParam: ctx.config.maxTokensParam,
            disableStreamOptions,
          }),
        ),
        signal,
      });
    } catch (err) {
      throw toWrappedError(err, flags, timeoutMs);
    }

    if (!response.ok) {
      const text = await safeReadText(response);
      // 部分网关不认识 stream_options 会直接 400，去掉该字段自动重试一次
      if (isStreamOptionsRejection(response.status, text)) {
        const downgradeError = aiErrorException(AI_ERROR_CODES.BAD_REQUEST, {
          detail: '上游不支持 stream_options',
        });
        downgradeError.streamOptionsDowngrade = true;
        throw downgradeError;
      }
      const code = classifyHttpStatus(response.status, text);
      const err = aiErrorException(code, {
        httpStatus: response.status,
        detail: extractErrorDetail(text),
      });
      err.retryAfterMs = parseRetryAfter(readHeader(response, 'retry-after'), now);
      throw err;
    }

    // 上游忽略 stream 参数时按非流式解析，补发单个 chunk + done
    const contentType = String(readHeader(response, 'content-type') || '');
    if (contentType.includes('application/json')) {
      let json;
      try {
        json = await response.json();
      } catch {
        throw aiErrorException(AI_ERROR_CODES.BAD_FORMAT);
      }
      const parsed = parseChatCompletion(json, {
        capability: ctx.capability,
        topic: ctx.topic,
        fallbackModel: ctx.config.model,
        maxTokens: ctx.maxTokens,
      });
      pushDelta(parsed.text);
      return parsed;
    }

    if (!response.body || typeof response.body.getReader !== 'function') {
      throw aiErrorException(AI_ERROR_CODES.BAD_FORMAT);
    }

    // TextDecoder 必须每请求新建实例 + stream: true：
    // 中文每字符 3 字节几乎必然跨 TCP chunk 断裂，漏掉会产生 U+FFFD 乱码且偶发难复现；
    // 模块级共享实例会让并发流互相污染内部状态。
    const decoder = new TextDecoder('utf-8');
    const parser = createSseParser({ warn: (message) => logger.warn('[ai]', message) });
    const reader = response.body.getReader();

    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decodeChunk(decoder, value);
        if (text) consumeEvents(parser.push(text), pushDelta);
        if (parser.done) break;
      }
      const tail = flushDecoder(decoder);
      if (tail) consumeEvents(parser.push(tail), pushDelta);
      consumeEvents(parser.flush(), pushDelta);
    } catch (err) {
      throw toWrappedError(err, flags, timeoutMs);
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* 已释放或流已关闭 */
      }
    }

    const state = parser.getState();
    if (state.finishReason === 'content_filter') {
      throw aiErrorException(AI_ERROR_CODES.CONTENT_FILTER);
    }
    if (!state.sawDelta) {
      // 全程没有有效 delta：区分"服务端返回了结束标记但内容为空"与"根本不是 SSE 协议"
      throw aiErrorException(state.done ? AI_ERROR_CODES.EMPTY_CONTENT : AI_ERROR_CODES.BAD_FORMAT);
    }

    const text = normalizeMarkdown(state.text);
    if (!text) throw aiErrorException(AI_ERROR_CODES.EMPTY_CONTENT);

    const result = { text, model: state.model || ctx.config.model, finishReason: state.finishReason };
    if (state.usage) result.usage = state.usage;
    if (ctx.capability === 'generate') result.title = extractTitle(text, ctx.topic || '');
    return result;
  }

  /** 流式任务主体（detached 执行，不阻塞 invoke 返回） */
  async function runStream(normalized, emit, entry) {
    const requestId = normalized.requestId;
    const start = now();

    let ctx;
    try {
      ctx = resolveContext(normalized);
    } catch (err) {
      emit({ requestId, type: 'error', error: toAiError(err) });
      return;
    }

    const config = ctx.config;
    applyRuntimeConfig(config);

    let buffered = '';
    let flushTimer = null;
    let emittedChunk = false;
    let firstDeltaMs;
    let timers = null;
    let attemptsUsed = 0;
    let disableStreamOptions = config.disableStreamOptions;

    function flush() {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (!buffered) return;
      const delta = buffered;
      buffered = '';
      emit({ requestId, type: 'chunk', delta });
    }

    function pushDelta(delta) {
      if (!emittedChunk) {
        emittedChunk = true;
        firstDeltaMs = Math.max(0, now() - start);
        if (timers) timers.onFirstDelta();
      } else if (timers) {
        timers.resetIdle();
      }
      buffered += delta;
      if (!flushTimer) {
        flushTimer = setTimeout(() => {
          flushTimer = null;
          flush();
        }, STREAM_FLUSH_MS);
      }
    }

    const firstByteTimeoutMs = Math.min(FIRST_BYTE_TIMEOUT_CAP_MS, config.timeoutMs);
    const idleTimeoutMs = config.timeoutMs;
    const totalTimeoutMs = Math.max(config.timeoutMs, config.timeoutMs * 5);

    const streamOnce = () =>
      withRetry(
        async () => {
          attemptsUsed += 1;
          const controller = new AbortController();
          const flags = { timedOut: false, userCancelled: false };
          entry.abortCurrent = () => {
            flags.userCancelled = true;
            controller.abort();
          };
          if (entry.userCancelled) {
            flags.userCancelled = true;
            controller.abort();
          }

          let firstTimer = setTimeout(() => {
            flags.timedOut = true;
            controller.abort();
          }, firstByteTimeoutMs);
          let idleTimer = null;
          const totalTimer = setTimeout(() => {
            flags.timedOut = true;
            controller.abort();
          }, totalTimeoutMs);

          const resetIdle = () => {
            if (idleTimer) clearTimeout(idleTimer);
            idleTimer = setTimeout(() => {
              flags.timedOut = true;
              controller.abort();
            }, idleTimeoutMs);
          };
          timers = {
            onFirstDelta() {
              if (firstTimer) {
                clearTimeout(firstTimer);
                firstTimer = null;
              }
              resetIdle();
            },
            resetIdle,
          };

          try {
            return await streamAttempt({
              ctx,
              disableStreamOptions,
              signal: controller.signal,
              flags,
              timeoutMs: config.timeoutMs,
              pushDelta,
            });
          } finally {
            if (firstTimer) clearTimeout(firstTimer);
            if (idleTimer) clearTimeout(idleTimer);
            clearTimeout(totalTimer);
            timers = null;
            entry.abortCurrent = null;
          }
        },
        {
          ...retryOptions,
          // 已向前端推送过 chunk 后禁止重试，否则用户会看到两遍内容
          canRetry: () => !emittedChunk,
          onRetry: (nextAttempt) => {
            emit({ requestId, type: 'meta', model: config.model, cached: false, attempt: nextAttempt });
          },
        },
      );

    try {
      emit({ requestId, type: 'meta', model: config.model, cached: false });

      let result;
      try {
        result = await gate.run(streamOnce);
      } catch (err) {
        if (err && err.streamOptionsDowngrade) {
          disableStreamOptions = true;
          result = await gate.run(streamOnce);
        } else {
          throw err;
        }
      }

      flush();
      const doneEvent = {
        requestId,
        type: 'done',
        text: result.text,
        model: result.model || config.model,
        latencyMs: Math.max(0, now() - start),
        cached: false,
      };
      if (result.title) doneEvent.title = result.title;
      if (result.usage) doneEvent.usage = result.usage;
      if (firstDeltaMs !== undefined) doneEvent.firstDeltaMs = firstDeltaMs;
      emit(doneEvent);
    } catch (err) {
      flush();
      emit({ requestId, type: 'error', error: toAiError(err, { attempts: attemptsUsed }) });
    } finally {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      entry.abortCurrent = null;
    }
  }

  /**
   * 启动流式生成。立即返回，不等待流结束 ——
   * 若 handler await 整个流，invoke 会挂几分钟不 resolve，前端无法区分"卡住"和"在跑"。
   * @returns {{ok: boolean, requestId?: string}}
   */
  function startStream(normalized, emit) {
    const requestId = normalized.requestId;
    if (activeStreams.has(requestId)) {
      emit({
        requestId,
        type: 'error',
        error: aiError(AI_ERROR_CODES.BAD_REQUEST, { detail: 'requestId 已在进行中' }),
      });
      return { ok: false, requestId };
    }

    const entry = { userCancelled: false, abortCurrent: null };
    activeStreams.set(requestId, entry);

    runStream(normalized, emit, entry)
      .catch((err) => {
        logger.error('[ai] 流式任务异常终止：', redactSecrets(err && err.message ? err.message : String(err)));
        try {
          emit({ requestId, type: 'error', error: toAiError(err) });
        } catch {
          /* emit 目标已失效（窗口销毁）时忽略 */
        }
      })
      .finally(() => {
        activeStreams.delete(requestId);
      });

    return { ok: true, requestId };
  }

  /** @returns {boolean} 是否有在途流被取消 */
  function cancel(requestId) {
    const entry = activeStreams.get(requestId);
    if (!entry) return false;
    entry.userCancelled = true;
    if (typeof entry.abortCurrent === 'function') entry.abortCurrent();
    return true;
  }

  /** 批量：逐项走并发闸门，单项失败不影响其他项 */
  async function runBatch(normalizedList, options = {}) {
    const continueOnError = options.continueOnError !== false;
    const settled = await Promise.allSettled(
      normalizedList.map((item) => runNonStream(item, { bypassCache: options.bypassCache })),
    );
    const results = [];
    for (const item of settled) {
      if (item.status === 'fulfilled') {
        results.push(item.value);
      } else if (continueOnError) {
        results.push({ ok: false, error: toAiError(item.reason) });
      } else {
        throw item.reason;
      }
    }
    return results;
  }

  /**
   * 连通性测试。可携带临时 apiKey（「先测后存」场景），该密钥仅用于本次请求：
   * 不落盘、不回显、不记日志。这是本模块唯一让密钥经过 IPC 的受控例外。
   */
  async function testConnection(rawPatch) {
    const config = configStore.getConfig();
    const overrides =
      rawPatch === undefined || rawPatch === null ? {} : assertAiConfigPayload(rawPatch);
    const merged = { ...config, ...overrides };
    const apiKey = overrides.apiKey !== undefined ? overrides.apiKey : config.apiKey;

    if (!merged.baseUrl || !merged.model || !apiKey) {
      throw aiErrorException(AI_ERROR_CODES.NOT_CONFIGURED);
    }

    const start = now();
    const attempt = createAttemptSignal({ timeoutMs: merged.timeoutMs, userSignal: null });
    try {
      const response = await fetchImpl(buildChatUrl(merged.baseUrl), {
        method: 'POST',
        headers: buildHeaders(apiKey, false),
        body: JSON.stringify(
          buildChatRequest({
            model: merged.model,
            messages: [
              { role: 'system', content: '你是连通性测试助手。' },
              { role: 'user', content: '请只回复两个字：可用' },
            ],
            temperature: 0,
            maxTokens: TEST_MAX_TOKENS,
            stream: false,
            maxTokensParam: merged.maxTokensParam,
          }),
        ),
        signal: attempt.controller.signal,
      });

      if (!response.ok) {
        const text = await safeReadText(response);
        throw aiErrorException(classifyHttpStatus(response.status, text), {
          httpStatus: response.status,
          detail: extractErrorDetail(text),
        });
      }

      let json;
      try {
        json = await response.json();
      } catch {
        throw aiErrorException(AI_ERROR_CODES.BAD_FORMAT);
      }
      const parsed = parseChatCompletion(json, {
        fallbackModel: merged.model,
        maxTokens: TEST_MAX_TOKENS,
        // 连通性测试的目标是验证「地址可达 + 密钥有效 + 模型存在」，
        // 拿到合法响应即已证明；可见正文为空（推理模型吃光预算）不该报连接失败。
        allowEmpty: true,
      });

      const reply = parsed.text.slice(0, 200);
      const result = {
        ok: true,
        latencyMs: Math.max(0, now() - start),
        model: parsed.model || merged.model,
        reply,
        encryptionAvailable: configStore.isEncryptionAvailable(),
      };
      if (!reply) {
        result.note = parsed.reasoningOnly
          ? '接口连通正常，但该模型把 token 预算全用在了思维链上、没有可见正文。生成正文时请提高「单次最大输出 token」'
          : '接口连通正常，但模型未返回可见文本';
      }
      return result;
    } catch (err) {
      throw toWrappedError(err, attempt.flags, merged.timeoutMs);
    } finally {
      attempt.dispose();
    }
  }

  /**
   * 拉取服务商当前提供的模型列表（GET {baseUrl}/models）。
   *
   * 与 testConnection 同样支持携带临时 patch（未保存的 baseUrl / apiKey），
   * 这样用户在设置页填完就能直接拉列表，不必先保存。
   * 本地服务（Ollama）不需要 Key，因此这里只要求 baseUrl，Key 可以为空。
   */
  async function listModels(rawPatch) {
    const config = configStore.getConfig();
    const overrides =
      rawPatch === undefined || rawPatch === null ? {} : assertAiConfigPayload(rawPatch);
    const baseUrl = overrides.baseUrl !== undefined ? overrides.baseUrl : config.baseUrl;
    const apiKey = overrides.apiKey !== undefined ? overrides.apiKey : config.apiKey;

    if (!baseUrl) throw aiErrorException(AI_ERROR_CODES.NOT_CONFIGURED);

    const timeoutMs = config.timeoutMs;
    const attempt = createAttemptSignal({ timeoutMs, userSignal: null });
    try {
      const response = await fetchImpl(buildModelsUrl(baseUrl), {
        method: 'GET',
        headers: buildModelsHeaders(apiKey),
        signal: attempt.controller.signal,
      });

      if (!response.ok) {
        const text = await safeReadText(response);
        throw aiErrorException(classifyHttpStatus(response.status, text), {
          httpStatus: response.status,
          detail: extractErrorDetail(text),
        });
      }

      let json;
      try {
        json = await response.json();
      } catch {
        throw aiErrorException(AI_ERROR_CODES.BAD_FORMAT);
      }

      return { ok: true, models: parseModelsResponse(json), baseUrl };
    } catch (err) {
      throw toWrappedError(err, attempt.flags, timeoutMs);
    } finally {
      attempt.dispose();
    }
  }

  async function updateConfig(rawPatch) {
    const patch = assertAiConfigPayload(rawPatch);
    const view = await configStore.update(patch);
    gate.setLimit(view.concurrency);
    if (!view.cacheEnabled) cache.clear();
    return view;
  }

  async function clearConfig() {
    const view = await configStore.clearAll();
    cache.clear();
    return view;
  }

  return {
    runNonStream,
    runBatch,
    startStream,
    cancel,
    testConnection,
    listModels,
    updateConfig,
    clearConfig,
    getView: () => configStore.getView(),
    clearCache: () => cache.clear(),
    get activeStreamCount() {
      return activeStreams.size;
    },
    get gate() {
      return gate;
    },
    get cache() {
      return cache;
    },
  };
}

module.exports = {
  STREAM_FLUSH_MS,
  TEST_MAX_TOKENS,
  makeCacheKey,
  createAiService,
};