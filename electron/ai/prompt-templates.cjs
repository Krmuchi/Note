// AI prompt 模板与参数映射（单一天真源）。
//
// 本模块为纯函数层：不得 require("electron")，以便在 vitest(jsdom) 下直接导入测试。
// 渲染侧 src/services/ai/prompts.ts 的选项常量与此处的 key 集合由单测交叉断言，防止双源漂移。
//
// 修改任何模板文案或映射值后，必须递增 TEMPLATE_VERSION —— 它是缓存 key 的一部分，
// 不递增会导致旧模板产出的缓存结果继续命中。

const TEMPLATE_VERSION = '1.0.0';

const STYLE_KEYS = ['formal', 'casual', 'technical', 'creative', 'academic'];
const LENGTH_KEYS = ['short', 'medium', 'long'];
const ACTION_KEYS = ['polish', 'rewrite', 'expand', 'summarize'];

const STYLE_LABELS = {
  formal: '正式',
  casual: '轻松',
  technical: '技术',
  creative: '创意',
  academic: '学术',
};

const STYLE_SYSTEM = {
  formal:
    '你是一位专业的商务文档撰写者。请使用正式、客观、结构化的书面语，逻辑严谨、层次分明；避免口语表达、感叹号与表情符号。',
  casual:
    '你是一位轻松亲切的博客作者。请使用友好、口语化但通顺自然的表达，像和朋友聊天一样娓娓道来，可以适度使用感叹句。',
  technical:
    '你是一位资深工程师与技术文档作者。请使用精确的技术术语，描述可实现、可执行的步骤；代码必须放在围栏代码块中并标注语言。',
  creative:
    '你是一位富有想象力的创意写作者。请使用生动、富有画面感的语言，善用比喻与意象，营造独特的氛围与节奏。',
  academic:
    '你是一位严谨的学术研究者。请使用客观严谨的学术语体，论证充分、分点清晰；不使用第一人称情绪化表达，不夸大结论。',
};

const STYLE_TEMPERATURE = {
  formal: 0.4,
  casual: 0.8,
  technical: 0.3,
  creative: 0.9,
  academic: 0.3,
};

const LENGTH_MAX_TOKENS = {
  short: 800,
  medium: 1600,
  long: 3200,
};

const LENGTH_GUIDE = {
  short: '约 200-400 字，2-3 个小节',
  medium: '约 500-800 字，4-5 个小节',
  long: '约 1000-1500 字，6-8 个小节',
};

const ACTION_INSTRUCTION = {
  polish:
    '请润色以下文本：不改变原意与信息量，修正语病、统一术语、提升可读性，并保持原有的 Markdown 结构。',
  rewrite:
    '请改写以下文本：保留原意，调整句式与段落组织，替换重复用词；不得新增原文没有的事实。',
  expand:
    '请扩写以下文本：补充细节、例证与过渡句，篇幅约为原文的 1.5-2 倍；不得偏离主题或编造事实。',
  summarize:
    '请总结以下文本：提炼核心结论与要点，输出 3-6 条列表并附一段总结；不得引入原文之外的信息。',
};

const ACTION_TEMPERATURE = {
  polish: 0.3,
  rewrite: 0.7,
  expand: 0.6,
  summarize: 0.2,
};

/** 附加到每条 system 末尾的输出约束，避免模型输出"好的，以下是…"之类的开场白 */
const OUTPUT_CONSTRAINT =
  '直接输出 Markdown 正文，不要输出任何解释性开场白或结束语，不要用三反引号围栏包裹整篇回答。';

const TRANSFORM_SYSTEM_SUFFIX = '你只改变表达风格，不得增删任何事实信息；输出仅为改写后的正文。';

const ABSOLUTE_MAX_TOKENS = 4096;
const MIN_OPTIMIZE_TOKENS = 800;

/**
 * 构造 chat messages。用户文本只进入 user message，绝不拼进 system，降低 prompt 注入影响面。
 * @param {{capability: string, topic?: string, text?: string, action?: string, targetStyle?: string,
 *          style?: string, length?: string, includeOutline?: boolean, includeExamples?: boolean}} payload
 * @returns {{role: 'system'|'user', content: string}[]}
 */
function buildMessages(payload) {
  const capability = payload.capability;

  if (capability === 'generate') {
    const style = payload.style || 'formal';
    const length = payload.length || 'medium';
    const requirements = [];
    requirements.push(payload.includeOutline ? '包含文档大纲' : '不需要文档大纲');
    requirements.push(payload.includeExamples ? '包含示例内容' : '不需要示例内容');
    return [
      { role: 'system', content: `${STYLE_SYSTEM[style]}\n${OUTPUT_CONSTRAINT}` },
      {
        role: 'user',
        content:
          `主题：${payload.topic}\n` +
          `风格：${STYLE_LABELS[style]}\n` +
          `篇幅：${LENGTH_GUIDE[length]}\n` +
          `要求：${requirements.join('；')}\n` +
          '请输出完整的 Markdown 文档，首行为一级标题。',
      },
    ];
  }

  if (capability === 'optimize') {
    const action = payload.action;
    return [
      { role: 'system', content: OUTPUT_CONSTRAINT },
      { role: 'user', content: `${ACTION_INSTRUCTION[action]}\n\n---\n原文：\n${payload.text}` },
    ];
  }

  if (capability === 'transform') {
    const targetStyle = payload.targetStyle;
    return [
      { role: 'system', content: `${STYLE_SYSTEM[targetStyle]}\n${TRANSFORM_SYSTEM_SUFFIX}` },
      {
        role: 'user',
        content: `请将以下文本转换为${STYLE_LABELS[targetStyle]}风格：\n\n---\n${payload.text}`,
      },
    ];
  }

  throw new Error(`未知的 AI 能力类型：${capability}`);
}

/** 按输入文本长度粗估 max_tokens（1 字符 ≈ 1.6 token 的反向换算） */
function deriveMaxTokensFromText(text) {
  const chars = typeof text === 'string' ? text.length : 0;
  return Math.min(ABSOLUTE_MAX_TOKENS, Math.max(MIN_OPTIMIZE_TOKENS, Math.ceil(chars * 1.8)));
}

/**
 * 解析 temperature / maxTokens。
 * @param {object} payload 校验后的请求载荷
 * @param {{maxTokensCap?: number}} [options] 配置里的 maxTokens 作为上限封顶
 */
function resolveParams(payload, options = {}) {
  const cap = typeof options.maxTokensCap === 'number' ? options.maxTokensCap : Number.MAX_SAFE_INTEGER;
  let temperature;
  let maxTokens;

  if (payload.capability === 'generate') {
    temperature = STYLE_TEMPERATURE[payload.style || 'formal'];
    maxTokens = LENGTH_MAX_TOKENS[payload.length || 'medium'];
  } else if (payload.capability === 'optimize') {
    temperature = ACTION_TEMPERATURE[payload.action];
    maxTokens = deriveMaxTokensFromText(payload.text);
    if (payload.action === 'expand') {
      maxTokens = Math.min(ABSOLUTE_MAX_TOKENS, Math.ceil(maxTokens * 2));
    }
  } else {
    temperature = STYLE_TEMPERATURE[payload.targetStyle];
    maxTokens = deriveMaxTokensFromText(payload.text);
  }

  return { temperature, maxTokens: Math.max(1, Math.min(maxTokens, cap)) };
}

module.exports = {
  TEMPLATE_VERSION,
  STYLE_KEYS,
  LENGTH_KEYS,
  ACTION_KEYS,
  STYLE_LABELS,
  STYLE_SYSTEM,
  STYLE_TEMPERATURE,
  LENGTH_MAX_TOKENS,
  LENGTH_GUIDE,
  ACTION_INSTRUCTION,
  ACTION_TEMPERATURE,
  OUTPUT_CONSTRAINT,
  buildMessages,
  resolveParams,
};