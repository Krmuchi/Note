// AI 配置持久化：safeStorage 加密存储 + 密钥边界控制。
//
// 为什么不放进 notes-data.json / Zustand store：
// notes-data.json 会随 createBackup（保留 10 份）、exportAll、importBackup 全链路复制，
// API Key 一旦进 store 就等于进了所有备份文件。因此 AI 配置独立落 userData/ai-config.json。
//
// safeStorage 必须在 app.whenReady() 之后才可用，因此本模块由 main.cjs 在 whenReady 内实例化，
// 并把 app / safeStorage 作为依赖注入（而不是自己 require("electron")），便于测试替身。

const path = require('node:path');
const fs = require('node:fs/promises');

const CONFIG_FILE_NAME = 'ai-config.json';
const CONFIG_VERSION = 1;

const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  baseUrl: '',
  model: '',
  temperature: 0.7,
  maxTokens: 1600,
  timeoutMs: 60000,
  stream: true,
  maxTokensParam: 'max_tokens',
  disableStreamOptions: false,
  concurrency: 3,
  maxInputTokens: 8000,
  cacheEnabled: true,
  // 数据外发授权：选中文本会发往用户自配的第三方服务，需显式确认后才算「已配置」
  consent: false,
};

/** 只有这些字段允许从磁盘/补丁进入配置，避免脏数据扩散 */
const CONFIG_FIELDS = Object.keys(DEFAULT_CONFIG).filter((key) => key !== 'version');

/**
 * @param {{app: {getPath: (name: string) => string}, safeStorage?: object, logger?: object}} deps
 */
function createConfigStore(deps) {
  const { app, safeStorage, logger = console } = deps;

  /** 内存中的配置（含明文 apiKey，仅主进程内部可见） */
  let config = { ...DEFAULT_CONFIG };
  let apiKey = '';
  /** safeStorage 不可用时的降级：密钥只保留在本进程内存，绝不落盘 */
  let sessionOnlyKey = false;
  let loaded = false;

  function getFilePath() {
    return path.join(app.getPath('userData'), CONFIG_FILE_NAME);
  }

  function isEncryptionAvailable() {
    try {
      return !!(safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable());
    } catch {
      return false;
    }
  }

  function decryptKey(enc) {
    if (!enc || typeof enc !== 'object' || typeof enc.data !== 'string') return '';
    if (!isEncryptionAvailable()) return '';
    try {
      return safeStorage.decryptString(Buffer.from(enc.data, 'base64'));
    } catch (err) {
      // 配置被外部改动或 DPAPI 失效：视为未配置，提示重新填写，不抛异常
      logger.warn('[ai] API Key 解密失败，请重新配置：', err && err.message ? err.message : err);
      return '';
    }
  }

  function encryptKey(value) {
    const buffer = safeStorage.encryptString(value);
    return { v: 1, alg: 'safeStorage', data: Buffer.from(buffer).toString('base64') };
  }

  /** 从磁盘读配置；文件缺失/损坏时回退默认值 */
  async function load() {
    try {
      const raw = await fs.readFile(getFilePath(), 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const next = { ...DEFAULT_CONFIG };
        for (const field of CONFIG_FIELDS) {
          if (parsed[field] !== undefined) next[field] = parsed[field];
        }
        next.version = CONFIG_VERSION;
        config = next;
        apiKey = decryptKey(parsed.apiKeyEnc);
        sessionOnlyKey = !apiKey && !!parsed.apiKeyEnc && !isEncryptionAvailable();
      }
    } catch (err) {
      if (err && err.code !== 'ENOENT') {
        logger.warn('[ai] 读取 AI 配置失败，已回退默认配置：', err && err.message ? err.message : err);
      }
    }
    loaded = true;
    return config;
  }

  /** 写盘；safeStorage 不可用时只保留内存密钥，不落盘明文 */
  async function persist() {
    const payload = { ...config, version: CONFIG_VERSION };
    if (apiKey && isEncryptionAvailable()) {
      payload.apiKeyEnc = encryptKey(apiKey);
      sessionOnlyKey = false;
    } else if (apiKey) {
      sessionOnlyKey = true;
    } else {
      sessionOnlyKey = false;
    }
    const filePath = getFilePath();
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
    // Windows 上 chmod 为 no-op（无害），类 Unix 下收紧权限
    try {
      await fs.chmod(filePath, 0o600);
    } catch {
      /* 平台不支持则忽略 */
    }
  }

  /** 主进程内部使用的完整配置（含明文密钥），绝不可下发给渲染进程 */
  function getConfig() {
    return { ...config, apiKey };
  }

  function readApiKey() {
    return apiKey;
  }

  /**
   * 下发给渲染进程的配置视图：只含布尔 hasKey，不含明文、密文、长度或前缀。
   */
  function getView() {
    return {
      configured: !!(config.baseUrl && config.model && apiKey && config.consent),
      hasKey: !!apiKey,
      encryptionAvailable: isEncryptionAvailable(),
      // safeStorage 不可用时密钥仅本次运行有效，UI 需要提示用户
      sessionOnlyKey,
      baseUrl: config.baseUrl,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      timeoutMs: config.timeoutMs,
      stream: config.stream,
      maxTokensParam: config.maxTokensParam,
      disableStreamOptions: config.disableStreamOptions,
      concurrency: config.concurrency,
      maxInputTokens: config.maxInputTokens,
      cacheEnabled: config.cacheEnabled,
      consent: config.consent,
    };
  }

  /**
   * 应用配置补丁并落盘。
   * apiKey 传空串表示清除密钥；不传表示保留原值（只改 baseUrl/model 无需重输）。
   * @param {object} patch 已通过 assertAiConfigPayload 校验
   */
  async function update(patch) {
    for (const field of CONFIG_FIELDS) {
      if (patch[field] !== undefined) config[field] = patch[field];
    }
    if (patch.apiKey !== undefined) apiKey = patch.apiKey;
    await persist();
    return getView();
  }

  async function clearAll() {
    config = { ...DEFAULT_CONFIG };
    apiKey = '';
    sessionOnlyKey = false;
    await persist();
    return getView();
  }

  return {
    load,
    update,
    clearAll,
    getConfig,
    getView,
    readApiKey,
    isEncryptionAvailable,
    getFilePath,
    get loaded() {
      return loaded;
    },
  };
}

module.exports = { CONFIG_FILE_NAME, CONFIG_VERSION, DEFAULT_CONFIG, CONFIG_FIELDS, createConfigStore };