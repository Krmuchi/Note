# AI 能力集成文档

本文档描述「笔记」桌面应用的 AI 能力集成方案：接口说明、参数配置指南、错误码、测试用例与性能指标。

---

## 1. 概述与设计目标

AI 写作模块（`src/components/ai/AiWriter.tsx`）原先只是本地模板拼接的假数据。本次集成把真实模型接入应用，对外提供统一接口，支撑三类能力：

| 能力 | capability | 场景 |
|---|---|---|
| 文本生成 | `generate` | AI 写作助手：给主题 → 产出完整 Markdown 文档 |
| 内容优化 | `optimize` | 编辑器选区：润色 / 改写 / 扩写 / 总结 |
| 风格转换 | `transform` | 编辑器选区：改写成正式 / 轻松 / 技术 / 创意 / 学术风格 |

四项设计目标（同时也是四条必须守住的约束）：

1. **统一适配**：单一 OpenAI 兼容适配器，通过 `baseUrl + apiKey + model` 覆盖 OpenAI、DeepSeek、Moonshot、通义（兼容模式）、本地 Ollama 等。新增服务商只改配置，不改代码。
2. **主进程代理**：所有出网请求只在 Electron 主进程发生。生产环境 CSP 是 `connect-src 'self' ws:`，渲染进程物理上连不上外部 API —— 本方案**不放宽 CSP**，这是选择主进程代理的核心收益。
3. **零新增运行时依赖**：不使用 openai SDK / lru-cache / p-queue。主进程为纯 CJS，仅用 Node 22 自带的全局 `fetch`、`AbortController` 与 `node:crypto`，避免 ESM/CJS 互操作坑与安装包膨胀。
4. **密钥不出主进程**：API Key 用 Electron `safeStorage`（Windows DPAPI）加密后落盘，永远不写入 `notes-data.json`、localStorage 或导出备份。

---

## 2. 架构与数据流

```
UI        AiWriter.tsx · AiSelectionMenu.tsx · AiSettingsTab.tsx   （只消费 hooks，不碰 IPC）
Hook      useAiWriter / useAiTaskStream / useAiSelectionAction       （状态机 + 生命周期清理）
Client    src/services/ai/aiClient.ts                                （统一签名 + 去重 + 错误归一）
          └ stream.ts（会话注册表 + 帧节流）
Bridge    window.notesApi.*  (preload.cjs：白名单 + 单次事件监听 + requestId 分发)
IPC       invoke('ai:generate' | 'ai:stream:start' | 'ai:cancel' | 'ai:batch' | 'ai:config:*')
          ← on('ai:stream:event', { requestId, ... })   只发给发起请求的那个窗口
Service   electron/ai/ai-service.cjs：校验 → 并发闸门 → 缓存 → 重试 → fetch → 推送事件
          ├ config-store.cjs（safeStorage 解密 key，仅此处可见）
          ├ prompt-templates.cjs（构造 messages）
          ├ openai-adapter.cjs + sse-parser.cjs
          └ lru-cache.cjs / concurrency.cjs / retry.cjs / error-map.cjs
HTTP      fetch(`${baseUrl}/chat/completions`, { Authorization: Bearer <key> })
```

### IPC 通道表

| 通道 | 方向 | 载荷 → 返回 |
|---|---|---|
| `ai:config:get` | invoke | void → `AiConfigView` |
| `ai:config:set` | invoke | `AiConfigPatch` → `AiConfigView` |
| `ai:config:clear` | invoke | void → `AiConfigView` |
| `ai:config:test` | invoke | `AiConfigPatch?` → `AiTestResult` |
| `ai:models:list` | invoke | `AiConfigPatch?` → `AiModelsResult`（`{ ok, models, baseUrl }`） |
| `ai:generate` | invoke | `AiRequestPayload & { bypassCache?: boolean }` → `AiResponse` |
| `ai:stream:start` | invoke | `AiRequestPayload` → `{ ok: true, requestId }`（**立即返回**） |
| `ai:cancel` | invoke | `{ requestId }` → `{ ok: true, cancelled: boolean }` |
| `ai:batch` | invoke | `AiRequestPayload[]`（1-16 条）→ `{ ok: true, results: AiResponse[] }` |
| `ai:stream:event` | main → renderer | `AiStreamEvent` |

### 为什么跨 IPC 一律用「信封」而不是 throw

`ipcMain.handle` 抛出的错误经 Electron 序列化后**只剩 message 字符串**（还带 `Error invoking remote method 'ai:generate':` 前缀），`code` / `retryable` / `httpStatus` 全部丢失。因此：

- 所有运行时错误都以 `{ ok: false, error: AiError }` 返回；
- preload 的 `withErrorHandling` 会把错误重包成 `new Error(err.message)`，**AI 通道刻意不复用它**；
- 渲染侧 `isAiFailure()` 是统一的信封判别函数（`AiConfigView` 没有 `ok` 字段，不会被误判）。

---

## 3. 配置指南

### 3.1 服务商地址与模型示例

| 服务商 | baseUrl 填写 | 归一化结果 | 模型示例 | 获取 Key |
|---|---|---|---|---|
| DeepSeek | `https://api.deepseek.com` | `…/v1` | `deepseek-chat`、`deepseek-reasoner` | platform.deepseek.com |
| OpenAI | `https://api.openai.com/v1` | 原样 | `gpt-4o-mini`、`gpt-4o` | platform.openai.com |
| Moonshot | `https://api.moonshot.cn/v1` | 原样 | `moonshot-v1-8k` | platform.moonshot.cn |
| 通义（兼容模式） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 原样 | `qwen-plus`、`qwen-max` | dashscope.aliyun.com |
| 小米 MiMo（按量付费） | `https://api.xiaomimimo.com/v1` | 原样 | `mimo-v2.5-pro`、`mimo-v2.5` | platform.xiaomimimo.com |
| 小米 MiMo（Token Plan） | `https://token-plan-cn.xiaomimimo.com/v1` | 原样 | `mimo-v2.5-pro`、`mimo-v2.5` | 订阅后在套餐控制台获取 |
| Ollama（本地） | `http://localhost:11434` | `…/v1` | `qwen2.5:7b` | 无需 Key（Ollama 默认不校验；若开了校验则填任意值） |

**baseUrl 归一化规则**：去尾部斜杠 → 末尾不是版本段（`/v\d+`）时自动补 `/v1` → 请求地址为 `baseUrl + '/chat/completions'`。协议只允许 `http:`/`https:`（`file:`/`javascript:` 一律拒绝），因为 baseUrl 是主进程的出网目标，属 SSRF 面；不禁 `http` 是为了让本地 Ollama 可用。

### 3.1.1 小米 MiMo 接入说明

小米 MiMo API 开放平台（`platform.xiaomimimo.com`）兼容 OpenAI Chat Completions 协议，有两种接入方式，**凭证格式与 baseUrl 都不同，不能混用**：

| 方式 | baseUrl | API Key 格式 |
|---|---|---|
| 按量付费 | `https://api.xiaomimimo.com/v1` | `sk-xxxxx` |
| Token Plan（订阅制） | `https://token-plan-cn.xiaomimimo.com/v1` | `tp-xxxxx` |

设置页的「服务商预设」已内置这两个条目，选择后会自动填入 baseUrl、模型与参数名。

**必须注意的两点**：

1. **输出长度参数名**：官方参数表提供的是 `max_completion_tokens`，**没有 `max_tokens`**。预设已自动把「输出长度参数名」切换为 `max_completion_tokens`；若手工配置而漏改这一项，输出长度设置不会生效。该值也会通过模型默认值兜底（`mimo-v2.5-pro` 默认 131072，`mimo-v2.5` 默认 32768）。
2. **鉴权方式**：官方同时支持 `api-key: <key>` 头与标准 Bearer 鉴权，本应用使用标准 `Authorization: Bearer <key>`，无需额外配置。

**思考模式**：MiMo 在思考模式下会返回 `reasoning_content` 字段。本应用有意忽略该字段，不把思维链写入文档正文。

**token 上限提示**：本应用「单次最大输出 token」配置项上限为 32000，低于 MiMo 支持的 131072。若需要更长的单次输出，需调整 `electron/ai/ai-validate.cjs` 中 `LIMITS.MAX_TOKENS_MAX`。

### 3.2 Ollama 本地部署

```bash
ollama pull qwen2.5:7b
ollama serve            # 默认监听 127.0.0.1:11434
```

设置页填 `http://localhost:11434` + 模型 `qwen2.5:7b` + 任意非空 Key，点「测试连接」。首字延迟通常在 1 秒内。

**注意**：不要把 Ollama 端口暴露到局域网或公网（`OLLAMA_HOST=0.0.0.0`），该端口没有任何鉴权。

### 3.3 模型列表（自动拉取）

设置页的「模型名称」字段支持从服务商实时拉取当前提供的模型列表：

- **触发方式**：点击模型输入框（聚焦即拉取）或点右侧「获取列表」按钮强制刷新
- **数据来源**：`GET {baseUrl}/models`（OpenAI 兼容协议的标准端点），因此拿到的是**当前仍在提供**的模型，而不是会过期的内置清单
- **使用方式**：输入框同时支持下拉选择与手动输入 —— 部分服务商未开放 `/models`，此时直接手填即可
- **缓存**：同一 `baseUrl` 已拉取过就复用结果，不会每次聚焦都发请求；切换服务商（baseUrl 变化）后自动失效
- **鉴权**：会带上当前表单里填的（可能尚未保存的）baseUrl 与 API Key；无 Key 时不发送 `Authorization`，以便本地 Ollama 使用
- **解析兼容**：`{ data: [{ id }] }`（OpenAI 标准）、`{ models: [{ id | name }] }`（Ollama 风格）、裸数组三种形状
- **不做过滤**：返回服务商的全部模型 id（去重排序），不猜测哪些不能用于对话 —— 那会隐藏合法模型

失败时的错误码与含义：

| 错误码 | 含义 | 处置 |
|---|---|---|
| `AI_ERR_NOT_CONFIGURED` | 尚未填写接口地址 | 先填 baseUrl |
| `AI_ERR_AUTH` | Key 无效 | 检查 API Key |
| `AI_ERR_NOT_FOUND` | 该服务商未开放 `/models` | 手动输入模型名称 |
| `AI_ERR_BAD_FORMAT` | 返回结构无法识别 | 手动输入模型名称 |
| `AI_ERR_NETWORK` / `AI_ERR_TIMEOUT` | 网络问题 | 检查网络或地址 |

UI 在失败时会显示「获取模型列表失败：{原因}（可直接手动输入模型名称）」，**不会阻塞保存流程**。

### 3.4 参数含义与推荐值

| 参数 | 范围 | 默认 | 说明 |
|---|---|---|---|
| `temperature` | 0-2 | 0.7 | 全局默认值；实际请求会按能力/风格覆盖（见 §5） |
| `maxTokens` | 1-32000 | 1600 | **上限封顶**：按能力算出的 max_tokens 会与之取小 |
| `timeoutMs` | 1000-300000 | 60000 | 非流式的总超时；流式下同时作为「空闲超时」 |
| `stream` | boolean | true | 是否流式输出 |
| `maxTokensParam` | 枚举 | `max_tokens` | OpenAI o 系列、小米 MiMo 只认 `max_completion_tokens` |
| `disableStreamOptions` | boolean | false | 部分网关不认识 `stream_options` 会直接 400 |
| `concurrency` | 1-8 | 3 | 主进程同时进行中的请求上限（含流式） |
| `maxInputTokens` | 500-128000 | 8000 | 本地输入长度预算，超限直接拦截不发往服务商 |
| `cacheEnabled` | boolean | true | 关闭后立即清空已有缓存 |
| `consent` | boolean | false | 数据外发授权；未勾选则所有 AI 功能关闭 |

### 3.5 连通性测试步骤

1. 打开「设置 → AI」，选择「服务商预设」——**只会填入接口地址**（以及该服务商需要的兼容参数），模型名刻意留空。
2. 点「模型名称」输入框，从该服务商**当前提供的模型列表**中选择（也可手动输入）。模型名必须显式选择：留空时「测试连接」「保存配置」为禁用状态。
3. 粘贴 API Key，勾选数据外发授权。
4. 点「测试连接」。成功会显示：`连接成功 · 模型 <model> · 耗时 <n>ms · 回复「可用」`。
5. 点「保存配置」，页面顶部徽标变为「已配置」。

**为什么预设不填模型**：模型名会随服务商迭代而过期（改名、下线、分级调整），写死一个默认值会让用户在不知情的情况下用上非预期的模型。因此模型一律从 `/models` 的实时结果中选择。预设里的 `model` 字段仅作为输入框的示例提示（placeholder），不会写入表单。

**「先测后存」**：`ai:config:test` 允许携带临时 `apiKey`，该密钥只用于本次请求，**不落盘、不回显、不记日志**。这是本方案唯一让密钥经过 IPC 的受控例外。

---

## 4. 接口说明

### 4.1 渲染进程统一接口

```ts
import { aiClient } from '@/services/ai'

// 三类能力（非流式，带主进程缓存）
aiClient.generate(input: GenerateInput, options?: CallOptions): Promise<AiResponse>
aiClient.optimize(input: OptimizeInput, options?: CallOptions): Promise<AiResponse>
aiClient.transform(input: TransformInput, options?: CallOptions): Promise<AiResponse>

// 流式（同步返回句柄，错误通过 onError 与 handle.done 反馈）
aiClient.stream(task: AiTaskSpec, handlers: StreamHandlers, options?: CallOptions): AiStreamHandle

// 批量（1-16 项，逐项走并发闸门，单项失败不影响其他项）
aiClient.batch(tasks: AiTaskSpec[], options?: BatchOptions): Promise<AiResponse[]>

// 配置
aiClient.config.get():    Promise<AiConfigView | AiFailure>
aiClient.config.set(patch: AiConfigPatch): Promise<AiConfigView | AiFailure>
aiClient.config.clear():  Promise<AiConfigView | AiFailure>
aiClient.config.test(patch?: AiConfigPatch): Promise<AiTestResult | AiFailure>
aiClient.config.listModels(patch?: AiConfigPatch): Promise<AiModelsResult | AiFailure>
```

### 4.2 入参类型

```ts
interface GenerateInput  { topic: string; style: WritingStyle; length: WritingLength;
                           includeOutline: boolean; includeExamples: boolean }
interface OptimizeInput  { action: 'polish' | 'rewrite' | 'expand' | 'summarize';
                           text: string; instructions?: string }
interface TransformInput { text: string; targetStyle: WritingStyle; instructions?: string }

type AiTaskSpec =
  | ({ capability: 'generate' } & GenerateInput)
  | ({ capability: 'optimize' } & OptimizeInput)
  | ({ capability: 'transform' } & TransformInput)

interface CallOptions  { signal?: AbortSignal; bypassCache?: boolean; timeoutMs?: number }
interface BatchOptions { signal?: AbortSignal; continueOnError?: boolean }
```

### 4.3 返回类型

```ts
type AiResponse = AiSuccess | AiFailure

interface AiSuccess {
  ok: true
  requestId: string
  capability: AiCapability
  text: string          // 已归一化的 Markdown
  title?: string        // 仅 generate 能力
  model: string
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
  cached: boolean
  latencyMs: number
  firstDeltaMs?: number // 仅流式
}

interface AiFailure { ok: false; error: AiError }

interface AiError {
  code: AiErrorCode
  message: string       // 中文用户文案，UI 可直接展示
  retryable: boolean
  httpStatus?: number
  attempts?: number     // 实际尝试次数（含首次）
}

interface AiStreamHandle {
  requestId: string
  cancel: () => void
  done: Promise<AiResponse>
}

interface StreamHandlers {
  onMeta?: (meta: { model: string; cached: boolean; attempt?: number }) => void
  onDelta: (delta: string) => void
  onDone: (result: AiSuccess) => void
  onError: (error: AiError) => void
}
```

### 4.4 流式事件

```ts
type AiStreamEvent =
  | { requestId: string; type: 'meta';  model: string; cached: boolean; attempt?: number }
  | { requestId: string; type: 'chunk'; delta: string }
  | { requestId: string; type: 'done';  text: string; title?: string; usage?: AiUsage;
      model: string; latencyMs: number; firstDeltaMs?: number; cached: boolean }
  | { requestId: string; type: 'error'; error: AiError }
```

### 4.5 requestId 契约（重要）

**requestId 由渲染进程生成**，且**必须先注册回调、再发出 `ai:stream:start`**：

```ts
const requestId = crypto.randomUUID()                 // 满足 ^[A-Za-z0-9_-]{8,64}$
window.notesApi.aiStreamSubscribe(requestId, onEvent) // ① 先注册
window.notesApi.aiStreamStart({ ...payload, requestId }) // ② 再启动
```

若由主进程生成 requestId，首个 chunk 可能在 `invoke` 尚未 resolve、前端还不知道 requestId 时就发出 → **丢首包**。主进程会校验 requestId 格式，并拒绝重复的 requestId（复用会让旧会话的 `done` Promise 永不落定）。

---

## 5. 三大能力与 prompt 设计

**渲染进程只发结构化参数，messages 全部由主进程 `prompt-templates.cjs` 构造。** 好处：payload 白名单简单、缓存键稳定、改模板不动前端，且渲染进程无法注入任意 system prompt（用户文本只进 user message）。

### 5.1 能力 → 模板

| capability | system | user |
|---|---|---|
| `generate` | `STYLE_SYSTEM[style]` + 输出约束 | `主题：{topic}\n风格：{styleLabel}\n篇幅：{lengthGuide}\n要求：{大纲/示例}\n请输出完整的 Markdown 文档，首行为一级标题。` |
| `optimize` | 输出约束 | `{ACTION_INSTRUCTION[action]}\n\n---\n原文：\n{text}` |
| `transform` | `STYLE_SYSTEM[targetStyle]` + `只改变表达风格，不得增删事实信息` | `请将以下文本转换为{styleLabel}风格：\n\n---\n{text}` |

输出约束（附加到 system 末尾）：`直接输出 Markdown 正文，不要输出任何解释性开场白或结束语，不要用三反引号围栏包裹整篇回答。`

### 5.2 style → system 要点 / temperature

| style | 要点 | temperature |
|---|---|---|
| `formal` 正式 | 专业商务文档撰写者；正式客观结构化书面语；避免口语/感叹号/表情 | 0.4 |
| `casual` 轻松 | 轻松亲切的博客作者；友好口语化但通顺自然 | 0.8 |
| `technical` 技术 | 资深工程师/技术文档作者；精确术语；代码必须标语言 | 0.3 |
| `creative` 创意 | 富有想象力的创意写作者；生动比喻与画面感语言 | 0.9 |
| `academic` 学术 | 严谨学术研究者；客观严谨分点；不用第一人称情绪化表达 | 0.3 |

### 5.3 length → max_tokens / 字数指引

| length | max_tokens | 字数指引 | 小节数 |
|---|---|---|---|
| `short` 简短 | 800 | 约 200-400 字 | 2-3 |
| `medium` 中等 | 1600 | 约 500-800 字 | 4-5 |
| `long` 详细 | 3200 | 约 1000-1500 字 | 6-8 |

### 5.4 optimize action → instruction / temperature

| action | 要点 | temperature |
|---|---|---|
| `polish` 润色 | 不改变原意与信息量；修语病、统一术语、提可读性；保持 Markdown 结构 | 0.3 |
| `rewrite` 改写 | 保留原意；调整句式与段落组织；不新增事实 | 0.7 |
| `expand` 扩写 | 补充细节、例证与过渡；篇幅约 1.5-2 倍；不偏离主题 | 0.6 |
| `summarize` 总结 | 提炼核心结论；3-6 条列表 + 1 段总结；不引入原文外信息 | 0.2 |

`optimize`/`transform` 的 max_tokens 按输入换算：`min(4096, max(800, ceil(text.length * 1.8)))`，`expand` 再乘以 2 后 clamp。最终都会与配置里的 `maxTokens` 取小。

### 5.5 输出归一化规则

1. `\r\n` / `\r` → `\n`
2. 整体被三反引号包裹时剥掉外层围栏
3. 折叠 3 个以上连续空行为 2 个
4. `trim()`
5. `generate` 额外抽首个 `# ` 一级标题作为 `title`（无 H1 时回退用 topic）

**刻意不做**「删除开场白」的启发式裁剪 —— 误删正文的风险高于收益，改由 system prompt 约束。

### 5.6 已知局限

- **prompt injection**：用户文本进入 user message，但不能完全消除模型被诱导的可能。**模型输出仅供参考，不可作为可信指令执行。**
- **模板版本机制**：`TEMPLATE_VERSION` 是缓存键的一部分。**修改任何模板文案或映射值后必须递增它**，否则旧模板产出的缓存会继续命中。
- **双源漂移防护**：`electron/ai/prompt-templates.cjs` 的 key 集合与 `src/services/ai/prompts.ts` 由 `tests/unit/aiPromptTemplates.test.ts` 交叉断言。

---

## 6. 错误码表

| code | 触发条件 | 可重试 | 用户文案 |
|---|---|---|---|
| `AI_ERR_NOT_CONFIGURED` | 未配置 baseUrl/model/apiKey，或未勾选数据外发授权 | 否 | 尚未配置 AI 服务，请前往「设置 → AI」填写接口地址与 API Key，并确认内容外发授权 |
| `AI_ERR_NETWORK` | fetch TypeError（DNS / ECONNREFUSED / 证书错误） | 是 | 网络连接失败，请检查网络或接口地址是否正确 |
| `AI_ERR_TIMEOUT` | 超时中止 | 是 | 请求超时（已等待 {n} 秒），请稍后重试 |
| `AI_ERR_ABORTED` | 用户主动取消 | 否 | 已取消生成 |
| `AI_ERR_AUTH` | 401 | 否 | API Key 无效或已过期，请重新配置 |
| `AI_ERR_FORBIDDEN` | 403 | 否 | 无访问权限：可能是 Key 权限不足、模型未开通或账户余额不足 |
| `AI_ERR_NOT_FOUND` | 404 | 否 | 接口地址或模型名称不存在，请检查 baseUrl 与 model |
| `AI_ERR_RATE_LIMIT` | 429 | 是 | 请求过于频繁或已达配额上限，请稍后重试 |
| `AI_ERR_SERVER` | 500/502/503/504 | 是 | AI 服务暂时不可用（HTTP {status}），正在重试 |
| `AI_ERR_BAD_REQUEST` | 400/422 或本地校验失败 | 否 | 请求参数被服务端拒绝：{detail} |
| `AI_ERR_CONTENT_FILTER` | `finish_reason=content_filter`，或 400 且响应体含 `safety`/`content_policy`/`风险` 等 | 否 | 内容被模型安全策略拦截，请调整输入后再试 |
| `AI_ERR_BAD_FORMAT` | JSON 解析失败 / 响应缺 choices / SSE 全程无有效 delta | 是 | 服务返回格式异常，可能不是 OpenAI 兼容接口 |
| `AI_ERR_EMPTY_CONTENT` | HTTP 200 但正文为空 | 是 | 模型没有返回内容，请重试或更换模型 |
| `AI_ERR_REASONING_ONLY` | 正文为空但返回了 `reasoning_content`（推理型模型把 `max_tokens` 用在了思维链上） | 否 | 模型只返回了思维链、没有可见正文：推理过程已消耗完 max_tokens（当前 {n}）。请提高「单次最大输出 token」或更换模型 |
| `AI_ERR_INPUT_TOO_LONG` | 本地长度/字节校验超限 | 否 | 输入内容过长（上限 {n} 字），请缩短后重试 |
| `AI_ERR_ENCRYPTION_UNAVAILABLE` | safeStorage 不可用 | 否 | 当前系统不支持安全存储，无法保存 API Key（仅本次运行有效） |
| `AI_ERR_UNKNOWN` | 兜底 | 否 | 生成失败：{msg} |

### 重试策略

- 可重试集合：`NETWORK` / `TIMEOUT` / `RATE_LIMIT` / `SERVER` / `BAD_FORMAT` / `EMPTY_CONTENT`
- 总尝试次数 `maxAttempts = 3`（首次 + 最多 2 次重试）
- 延迟：`delay = min(500 * 2^(attempt-1), 8000)`，再加 `random() * 0.3 * delay` 抖动。延迟序列上界约 0.5s + 1.0s
- `429` 若带 `Retry-After`（数字秒或 HTTP-date）优先采用，clamp 到 30s
- **流式保护**：一旦已向前端推送过 chunk，禁止重试（否则用户会看到两遍内容）。重试只在首包到达前允许
- 重试过程通过 `meta` 事件回传 `attempt`，UI 可显示「第 2 次重试…」

### 超时与取消

用一个组合 `AbortController` 承载「超时」与「用户取消」两种中止，并记录原因标志：

| 场景 | 超时设置 |
|---|---|
| 非流式 | 单一 `timeoutMs`（默认 60s） |
| 流式 | 三段时间：首包 `min(20s, timeoutMs)`、空闲 `timeoutMs`、总量 `timeoutMs × 5` |

判定时**用户取消优先于超时**（点取消的瞬间恰好到点的情况）。`abort` 事件监听器在 `finally` 中移除，避免跨请求累积。

---

## 7. 性能策略

### 7.1 请求缓存（以主进程为权威）

- **缓存键**：`sha256(JSON.stringify({ v: TEMPLATE_VERSION, capability, model, temperature, maxTokens, maxTokensParam, messages }))`。messages 构造顺序固定，`JSON.stringify` 即稳定。
- **容量**：100 条、TTL 10 分钟、单条 ≤ 256KB（超限不写入），总内存上界约 8MB。
- **LRU 实现**：`Map` 插入顺序即使用顺序，命中时 `delete + set` 移到末尾，超容时删最旧。
- **TTL 惰性判定**：不引入 `setInterval`（主进程里的定时器难以彻底清理，是常见泄漏来源）。
- 命中时返回 `cached: true`，UI 标「来自缓存」。
- **`stream` 请求默认不读写缓存**（流式要逐块推送）。
- **`temperature > 0` 时结果不唯一**：「重新生成」应带 `bypassCache: true`（跳过读缓存，但仍写缓存）。流式路径天然不走缓存，重新生成即直接请求模型。

### 7.2 in-flight 去重

- **主进程**：`Map<cacheKey, Promise>`，同 key 未完成时复用同一 Promise，`finally` 中删除。仅对**非流式**请求生效（流式有两个订阅者时语义复杂，不做去重）。
- **渲染进程**：`aiClient` 内做同 key 去重，防止用户连点「生成」造成重复请求与重复计费。渲染侧**不缓存结果**（双份结果缓存必然不一致）。

### 7.3 并发闸门

- 主进程全局上限 `concurrency`（默认 3，可配 1-8）。超出排队，`release` 时把名额直接转移给队首。
- `ai:batch` 在主进程内逐项 enqueue，返回 `Promise.allSettled` 风格结果，单项失败不影响其他项。
- **流式请求也走闸门** —— 长连接占用上游配额，不限流会在用户连点或批量操作时打满配额并触发 429 风暴。

### 7.4 流式节流

| 层 | 策略 |
|---|---|
| 主进程 | chunk 先累积到 buffer，16ms（约 60fps）合流后再发一次 IPC；`done`/`error` 前强制 flush |
| 渲染进程 | `stream.ts` 把增量写入 buffer，用 `requestAnimationFrame` 节流后一次性回调 |

避免一字一条 IPC + 一字一次 React setState 的双重开销。

---

## 8. 安全说明

### 8.1 safeStorage 加解密流程

落盘位置：`<userData>/ai-config.json`（与 `notes-data.json` 同级、**独立文件**）。

```json
{
  "version": 1,
  "baseUrl": "https://api.deepseek.com",
  "model": "deepseek-chat",
  "temperature": 0.7,
  "maxTokens": 1600,
  "timeoutMs": 60000,
  "stream": true,
  "maxTokensParam": "max_tokens",
  "disableStreamOptions": false,
  "concurrency": 3,
  "maxInputTokens": 8000,
  "cacheEnabled": true,
  "consent": true,
  "apiKeyEnc": { "v": 1, "alg": "safeStorage", "data": "<base64 密文>" }
}
```

- **必须在 `app.whenReady()` 之后**调用 safeStorage（时序要求），因此 `handlers-ai.cjs` 的 `load()` 在 `whenReady` 内执行。
- `isEncryptionAvailable()` 为 true → `encryptString` → base64 存入 `apiKeyEnc`；写盘后 `chmod 0600`（Windows 上是 no-op，无害）。
- 为 false（典型：Linux 无 keyring）→ **不落盘**，仅在主进程内存保留本次会话，返回视图里带 `sessionOnlyKey: true`，UI 提示「仅本次运行有效」。**不提供明文落盘开关。**
- `apiKey` 传空串 → 删除密钥；不传 → 保留原值（只改 baseUrl/model 无需重输）。
- 解密失败（配置被外部改动 / DPAPI 失效）→ 捕获后视为无 Key，提示重新配置，不抛异常。

### 8.2 密钥边界

| 渲染进程可拿到 | 拿不到 |
|---|---|
| `configured` / `hasKey` / `encryptionAvailable` / `sessionOnlyKey` | API Key 明文 |
| `baseUrl` / `model` / `temperature` / `maxTokens` / `timeoutMs` / `stream` / 其余配置项 | `apiKeyEnc.data` 密文 |
| 连通性测试的延迟、模型名与回复 | 任何解密派生值、鉴权头、上游原始响应头 |

**唯一例外**：`ai:config:test` 可携带临时 `apiKey`（先测后存必需），仅本次使用、不落盘、不回显、不记日志。

### 8.3 其他安全点

- **CSP 不变**：主进程出网，`connect-src 'self' ws:` 保持原样。放宽 CSP 等于允许被注入的脚本外联，是明确回归。
- **SSRF 收敛**：baseUrl 协议白名单仅 `http`/`https`，并校验 `new URL()` 可解析、hostname 非空。不要用 `file://` 之类的 scheme。
- **日志脱敏**：`redactSecrets()` 把 `sk-***`、`Bearer ***`、`"apiKey":"***"` 替换后再落日志。
- **数据外流告知**：编辑器选区文本会发往用户自配的第三方接口，需在设置页勾选 `consent` 后才启用。未勾选时所有 AI 功能返回 `AI_ERR_NOT_CONFIGURED`。
- **渲染进程无法注入 messages**：AI payload 走白名单校验，只挑已知字段，未知字段（含 `messages`、`model`）一律忽略。

---

## 9. 测试用例与覆盖矩阵

运行：`npm run test:unit`

| 测试文件 | 用例数 | 覆盖要点 |
|---|---|---|
| `tests/unit/aiSseParser.test.ts` | 9 | 单包解析；**一行 JSON 被 TCP 切成两半能拼回**；`: keep-alive` 忽略；`[DONE]`；非法 JSON 行跳过且不中断流；`reasoning_content` 忽略；`usage` 仅末包；尾包无换行时 `flush()`；**中文多字节跨 chunk 解码不产生 U+FFFD** |
| `tests/unit/aiOpenAiAdapter.test.ts` | 38 | `normalizeBaseUrl` 覆盖 5 家服务商 + 拒绝 `file:`/`javascript:`；`buildChatRequest` 的 stream / max_tokens 切换 / stream_options 开关；`isStreamOptionsRejection` 识别；**推理型模型只返回 `reasoning_content` 时抛 `REASONING_ONLY` 且文案带上 max_tokens**；**`allowEmpty` 下结构非法仍抛 `BAD_FORMAT`**；`buildModelsUrl` 拼接不产生重复版本段；`buildModelsHeaders` 无 Key 时不发 Authorization；`parseModelsResponse` 兼容三种响应形状并去重排序；`normalizeMarkdown` 剥围栏 / CRLF 归一 / 空行折叠；`parseChatCompletion` 的 usage / 数组式 content / output_text 兼容 / BAD_FORMAT / CONTENT_FILTER / EMPTY_CONTENT |
| `tests/unit/aiPromptTemplates.test.ts` | 19 | **与渲染端 `prompts.ts` 的 key 集合交叉断言**；5 种 style 的 system 非空且两两不同；用户文本只进 user message；length → 800/1600/3200；4 个 action 均有指令；temperature 落在 0-2；`maxTokensCap` 封顶生效 |
| `tests/unit/aiErrorMap.test.ts` | 18 | 每个错误码文案非空且不残留占位符；可重试集合正确（含 `REASONING_ONLY` 不可重试）；`REASONING_ONLY` 文案带 max_tokens 与调整方向；401/403/404/408/422/429/5xx 状态码映射；400 + 安全关键词 → CONTENT_FILTER；`AbortError` + userCancelled → ABORTED（优先于 timedOut）；TypeError → NETWORK；日志脱敏 |
| `tests/unit/aiRetry.test.ts` | 15 | 退避上界与抖动区间；3 次尝试共调用 3 次；不可重试立即抛；`canRetry` 为 false 时放弃；`Retry-After` 数字秒 / HTTP-date / 非法值 / clamp 30s |
| `tests/unit/aiLruCache.test.ts` | 10 | 命中移末尾；超容淘汰最旧；TTL 过期；单条超限拒绝写入；**同 key 并发共享同一 Promise，loader 只执行一次**；loader 失败不写缓存且清理在途记录 |
| `tests/unit/aiValidate.test.ts` | 27 | 非法 payload/枚举/requestId；topic > 2000、text > 8000 → INPUT_TOO_LONG；`maxInputTokens` 收紧预算；**未知字段被忽略，无法注入 messages**；baseUrl 协议白名单；model 字符集；apiKey 换行/长度；数值范围；batch 1-16 条 |
| `tests/unit/aiService.test.ts` | 47 | 未配置/未授权 → NOT_CONFIGURED；缓存命中与 `bypassCache` 语义；`cacheEnabled=false` 不走缓存；401 不重试；503 重试 3 次；429 用 `Retry-After`；超时 → TIMEOUT；**并发峰值 ≤ concurrency**；批量单项失败不影响其他项；流式增量合流；**已推送 chunk 后失败不重试**；取消 → ABORTED 且不重试；`stream_options` 被拒自动降级；上游返回 JSON 时非流式兜底；取消不存在的 requestId；重复 requestId 被拒；`testConnection` 的成功/临时 Key/缺 Key/鉴权失败/**推理模型空正文仍判连通成功并给说明/输出预算 ≥128**；`listModels` 的 GET /models、临时 patch 不落盘、无 Key 不发 Authorization、404 → NOT_FOUND、形状异常 → BAD_FORMAT |
| `tests/unit/aiClient.test.ts` | 33 | 三种能力的载荷映射（不含 messages）；失败信封透传；IPC 被拒不抛错；缺少 notesApi 的降级；**同 key 去重只发一次 IPC**；流式先注册后启动；帧节流；meta/error/done 结算；取消后忽略迟到事件；已中止 signal；signal 监听器被移除；批量长度一致；配置四个方法；**`config.listModels` 的透传、失败信封、旧 preload 降级** |
| `tests/unit/aiStream.test.ts` | 17 | `createRequestId` 符合主进程正则且不重复；**done/error/cancel/卸载四路径都清空注册表**；同 requestId 重复注册被拒且不覆盖旧会话；同帧多 chunk 只回调一次；跨帧顺序不变；**done 前先冲刷残留增量**；结算后迟到 chunk 被忽略；多会话不串台；fail 幂等 |
| `tests/unit/aiProviderPresets.test.ts` | 13 | **每个服务商预设的 baseUrl / model / maxTokensParam 都用主进程同一套校验函数过一遍**（避免预设非法导致用户点保存才失败）；归一化后请求地址统一落在 `/v1/chat/completions` 且不出现 `/v1/v1`；id 唯一；小米 MiMo 两种接入方式的 baseUrl、模型与 `max_completion_tokens` 断言；**`presetToFormPatch` 对所有预设都不填 model（防止默认模型被重新加回）、只带 baseUrl、maxTokensParam 按需带入、不修改预设本身** |

---

## 10. 性能指标要求

| 指标 | 目标 | 验证方式 |
|---|---|---|
| 首字延迟 TTFT（本地 Ollama，短 prompt） | ≤ 800ms | `done.firstDeltaMs`（主进程实测回传） |
| 首字延迟（云端，网络正常） | ≤ 3s | 同上 |
| 流式增量回调频率 | ≤ 62 次/秒 | `aiService.test.ts`「流式增量按 16ms 合流」 |
| 缓存命中耗时 | ≤ 5ms | `aiService.test.ts` 缓存命中用例 |
| 缓存命中率（同一内容连点两次） | 第二次起 100% | 同上，断言 `cached === true` |
| 上游在途请求峰值 | ≤ `concurrency`（默认 3） | `aiService.test.ts` 并发闸门用例 |
| 重试总等待 | ≤ 约 1.5s（不含上游耗时）；单次 ≤ 8s | `aiRetry.test.ts` 退避上界用例 |
| 缓存内存上界 | ≤ 100 条 / ≤ 8MB / 单条 ≤ 256KB | `aiLruCache.test.ts` 淘汰与拒绝写入用例 |
| 输入上限 | topic ≤ 2000 字 / 选区 ≤ 8000 字 / batch ≤ 16 项 | `aiValidate.test.ts` |
| 生成端到端（medium / 云端） | P50 ≤ 8s | `done.latencyMs` 日志统计 |
| 新增运行时依赖 | 0 | `git diff package.json` 无 `dependencies` 变化 |
| 单测规模 | ≥ 200 个 AI 用例全绿 | `npm run test:unit`（AI 相关 246 例 / 11 个文件） |

---

## 11. 排障 FAQ

**Q：点生成后提示「尚未配置 AI 服务」**
检查三件事：baseUrl 是否填了、模型名是否填了、**数据外发授权是否勾选**。三者的任一项缺失都会让 `configured` 为 false。

**Q：提示「服务返回格式异常，可能不是 OpenAI 兼容接口」**
说明响应不是预期的 `choices[0].message.content` 结构。确认 baseUrl 指向的是 OpenAI **兼容**入口（例如通义要用 `/compatible-mode/v1`，不是原生 DashScope 路径）。

**Q：流式请求 400，错误信息提到 `stream_options`**
在设置页勾选「禁用 stream_options」。主进程其实也会在遇到该 400 时自动去掉字段重试一次，但预先禁用可以省一次往返。

**Q：OpenAI o 系列或小米 MiMo 报参数错误 / 输出长度设置不生效**
把「输出长度参数名」改成 `max_completion_tokens`。用「服务商预设」选择这两家时会自动切换；手工填 baseUrl 时需自己改。

**Q：小米 MiMo 返回 401**
确认 baseUrl 与 Key 格式匹配：按量付费用 `https://api.xiaomimimo.com/v1` + `sk-` 开头的 Key；Token Plan 用 `https://token-plan-cn.xiaomimimo.com/v1` + `tp-` 开头的 Key。两者混用会鉴权失败。

**Q：提示 `AI_ERR_REASONING_ONLY`（模型只返回了思维链）**
说明这是推理型模型（DeepSeek-R1、小米 MiMo 思考模式等），它的 `max_tokens` **包含思维链 token**，预算偏小时推理过程就把额度用完了，可见正文为空。把「单次最大输出 token」调大（建议 ≥ 2000），或改用非推理模型。

**Q：连通性测试的 max_tokens 是多少？会不会被思维链吃光？**
测试请求使用 256 token（`TEST_MAX_TOKENS`）。即使被思维链吃光，**测试仍判定为连接成功** —— 因为连通性测试要验证的是「地址可达 + 密钥有效 + 模型存在」，拿到合法响应即已证明。此时会附加说明文字而不是报失败。

**Q：模型名称输入框点开没有候选项**
两种情况：① 该服务商未开放 `/models` 接口（错误提示会是 `AI_ERR_NOT_FOUND`）→ 直接手动输入模型名；② 还没填 API Key → 先填 Key 再点「获取列表」。

**Q：换了服务商，模型候选还是旧的**
候选列表与 baseUrl 绑定，baseUrl 变化后旧列表立即失效。若已重新拉取仍是旧的，点「获取列表」强制刷新（浏览器/服务商侧可能有缓存）。

**Q：模型列表里有很多非对话模型（embedding、TTS 等）**
这是服务商的真实返回，本应用**不做过滤** —— 按 id 猜测哪些不能用于对话会隐藏合法模型。输入框支持边输入边过滤，直接输入前缀即可缩小范围。

**Q：原文明明没变，为什么点了两次「润色」结果一样？**
第二次命中了主进程缓存（10 分钟内相同输入）。这是预期行为，用于节省配额；需要不同结果时用「重新生成」（流式路径天然绕过缓存，或走非流式时带 `bypassCache: true`）。

**Q：如何验证走了缓存？**
`AiSuccess.cached === true`，UI 会显示「来自缓存」徽标，且 `latencyMs` 通常小于 5ms。

**Q：Linux 下保存 Key 后重启需要重新填写？**
`safeStorage.isEncryptionAvailable()` 在缺少 keyring 的环境为 false，此时**不会把密钥落盘**，只保留在内存中。UI 会显示「安全存储不可用」徽标。安装并解锁 keyring（gnome-keyring / kwallet）后即可持久化。

**Q：怎么确认密钥没有落盘到笔记数据？**
设置完成后搜索这三处都应为空：`<userData>/notes-data.json`、DevTools 的 Application → Local Storage、导出的备份文件。密钥只在 `<userData>/ai-config.json` 的 `apiKeyEnc` 字段（密文）。

**Q：想抓真实请求做调试？**
主进程日志会打印错误与重试，但**不打印请求体与密钥**（`redactSecrets` 会遮蔽 `sk-***` 与 `Bearer ***`）。需要看原始请求时，临时在 `electron/ai/ai-service.cjs` 的 `fetchImpl` 调用前打一行 `logger.warn`。

**Q：编辑器 AI 按钮点了没反应？**
需要**先选中非空白文本**。未选中时会弹 Toast 提示「请先选中要处理的文本」。纯预览模式下该按钮不生效（切回编辑或分屏）。

---

## 12. 变更记录与 TEMPLATE_VERSION 规则

| 版本 | 变更 |
|---|---|
| 1.0.0 | 首次集成：OpenAI 兼容适配层、SSE 流式、三能力统一接口、错误归一与重试、LRU 缓存 + 并发闸门、safeStorage 密钥存储、AI 设置页、编辑器选区 AI 操作、集成文档与 202 个单测 |
| 1.0.1 | 新增小米 MiMo 服务商预设（按量付费 / Token Plan 两种接入方式）；预设结构支持携带 `maxTokensParam`，解决 MiMo 仅接受 `max_completion_tokens` 的问题；新增预设与主进程校验规则的一致性测试 |
| 1.0.2 | 服务商预设下拉只显示服务商名；模型名称改为可从服务商实时拉取（`GET {baseUrl}/models`）并支持下拉选择 + 手动输入；新增 `ai:models:list` 通道与 `aiClient.config.listModels()`；`parseModelsResponse` 兼容三种响应形状 |
| 1.0.3 | 修复推理型模型（小米 MiMo 思考模式、DeepSeek-R1 等）被误判为连接失败：新增 `AI_ERR_REASONING_ONLY` 错误码（与 `EMPTY_CONTENT` 区分）；连通性测试输出预算 32 → 256，且可见正文为空时改为「连通成功 + 说明」而非报错；设置页错误提示统一带上错误码与 HTTP 状态便于排查 |
| 1.0.4 | 应用服务商预设时**不再自动填入默认模型**，模型必须从实时列表显式选择；模型名为空时禁用「测试连接」「保存配置」并给出提示（避免主进程不接受空模型名导致旧模型被静默沿用）；预设的 `model` 改为仅作输入框示例提示；新增 `presetToFormPatch` 纯函数与回归测试 |

### TEMPLATE_VERSION 递增规则

`TEMPLATE_VERSION`（定义在 `electron/ai/prompt-templates.cjs`）参与缓存键计算。

**必须递增**的情况：

- 修改任何 `STYLE_SYSTEM` / `ACTION_INSTRUCTION` / 输出约束文案
- 修改 `STYLE_TEMPERATURE` / `LENGTH_MAX_TOKENS` / `ACTION_TEMPERATURE` 映射值
- 修改 `buildMessages` 的拼接结构（增删字段、调整顺序）
- 修改 `resolveParams` 的换算公式

**无需递增**：纯代码重构、注释调整、日志改动。

递增后旧缓存自然失效（键不同），无需手动清缓存。当前值：`1.0.0`。