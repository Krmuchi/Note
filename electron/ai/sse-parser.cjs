// SSE（Server-Sent Events）流解析状态机。
// 纯函数层：不得 require("electron")。
//
// 两个必须守住的点：
// 1. 跨 chunk 分片缓冲 —— 一个 data: 行可能被 TCP 从中间切开，最后一段不完整行必须留在 buffer。
// 2. TextDecoder 必须 { stream: true } 且**每个请求新建实例** —— 中文每字符 3 字节，
//    跨 chunk 断裂几乎必然发生；漏掉 stream 选项会产生 U+FFFD 乱码（偶发、难复现）。
//    模块级共享 decoder 会让并发流互相污染内部状态。

/**
 * 解码一个字节块（保留跨块的不完整多字节序列）。
 * @param {TextDecoder} decoder 每请求独立实例
 * @param {Uint8Array} bytes
 */
function decodeChunk(decoder, bytes) {
  return decoder.decode(bytes, { stream: true });
}

/** 流结束时冲刷 decoder 内部残留字节 */
function flushDecoder(decoder) {
  return decoder.decode();
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const promptTokens = Number(usage.prompt_tokens) || 0;
  const completionTokens = Number(usage.completion_tokens) || 0;
  const totalTokens = Number(usage.total_tokens) || promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

/**
 * @param {{warn?: (msg: string) => void}} [options]
 */
function createSseParser(options = {}) {
  const warn = options.warn || (() => {});
  let buffer = '';
  const state = {
    done: false,
    model: null,
    finishReason: null,
    usage: null,
    sawDelta: false,
    text: '',
  };

  function processLine(rawLine) {
    const line = rawLine.replace(/\r$/, '');
    // 空行是事件分隔符；以 ":" 开头的是注释（常见于 keep-alive 心跳）
    if (!line || line.startsWith(':')) return [];
    if (!line.startsWith('data:')) return [];

    const payload = line.slice(5).trim();
    if (!payload) return [];
    if (payload === '[DONE]') {
      state.done = true;
      return [{ type: 'done' }];
    }

    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      // 单行解析失败不应中断整条流（部分网关会插入非 JSON 的心跳行）
      warn('SSE 行 JSON 解析失败，已跳过该行');
      return [];
    }

    const events = [];
    if (typeof json.model === 'string' && json.model) state.model = json.model;

    const usage = normalizeUsage(json.usage);
    if (usage) {
      state.usage = usage;
      events.push({ type: 'usage', usage });
    }

    const choices = Array.isArray(json.choices) ? json.choices : [];
    const choice = choices[0];
    if (choice && typeof choice === 'object') {
      if (typeof choice.finish_reason === 'string') state.finishReason = choice.finish_reason;
      // 流式用 delta，个别网关在最后一块回 message
      const delta = choice.delta && typeof choice.delta === 'object' ? choice.delta : choice.message;
      if (delta && typeof delta === 'object' && typeof delta.content === 'string' && delta.content) {
        // 有意忽略 delta.reasoning_content（DeepSeek-R1 类的思维链），不把它当正文
        state.sawDelta = true;
        state.text += delta.content;
        events.push({ type: 'delta', delta: delta.content });
      }
    }

    return events;
  }

  /**
   * 喂入一段已解码文本，返回本次产出的事件数组。
   * @param {string} text
   * @returns {Array<{type:'delta',delta:string}|{type:'usage',usage:object}|{type:'done'}>}
   */
  function push(text) {
    buffer += text;
    const events = [];
    let index = buffer.indexOf('\n');
    while (index !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      events.push(...processLine(line));
      index = buffer.indexOf('\n');
    }
    return events;
  }

  /** 流结束时处理 buffer 中残留的尾行（上游最后一包可能没有换行） */
  function flush() {
    if (!buffer) return [];
    const line = buffer;
    buffer = '';
    return processLine(line);
  }

  return {
    push,
    flush,
    getState() {
      return { ...state };
    },
    get done() {
      return state.done;
    },
    get text() {
      return state.text;
    },
    get sawDelta() {
      return state.sawDelta;
    },
  };
}

module.exports = { createSseParser, decodeChunk, flushDecoder, normalizeUsage };