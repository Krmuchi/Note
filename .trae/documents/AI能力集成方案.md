# AI 能力集成方案（实施计划）

## Context

当前应用的「AI 写作助手」是**假的**：[AiWriter.tsx](file:///d:/00_临时与交换区/桌面/笔记/src/components/ai/AiWriter.tsx) 中 `generateContent()`（L38-L336）纯靠本地模板字符串拼接，`handleGenerate`（L361-L373）用 `setTimeout(1500)` 模拟延迟。没有任何真实模型调用、接口适配层、请求校验、错误处理或缓存。

本次要把它变成真实可用的 AI 能力：把模型接入 AI 写作模块，补齐 **API 适配层 / 请求响应处理 / 错误处理 / 性能优化** 四个组件，对外提供统一接口，支撑 **文本生成、内容优化、风格转换** 三大能力，并交付集成文档与测试。

### 已确认的用户决策

1. **适配层**：单一 **OpenAI 兼容通用适配器**（`/v1/chat/completions` + 可配置 baseUrl/apiKey/model），覆盖 OpenAI、DeepSeek、Moonshot、通义、Ollama。
2. **需要 SSE 流式输出**（打字机效果 + 中途取消）。
3. **落地范围（全选）**：① AI 服务层 + 集成文档 + 测试 ② 改造 AiWriter 接入真实接口 ③ SettingsPanel 新增「AI」配置页 ④ 编辑器选中文本 AI 快捷操作（润色/改写/扩写/总结）。
4. **API Key** 用 Electron `safeStorage`（Windows DPAPI）加密后存主进程，密钥不下发渲染进程。

---

## 一、四条全局架构约束（所有设计由此推导）

1. **所有出网请求只在主进程发生。** 生产 CSP 为 `connect-src 'self' ws:`（[main.cjs#L151-L152](file:///d:/00_临时与交换区/桌面/笔记/electron/main.cjs#L151-L152)），渲染进程物理上连不上外部 API。本方案**不放宽 CSP** —— 这是选主进程代理的核心收益，必须守住。（开发模式 L140-L145 会删 CSP 头，会掩盖问题，验收必须用打包版复验。）
2. **零新增运行时依赖。** 不用 openai SDK / lru-cache / p-queue。主进程纯 CJS，用 `node:crypto` + 全局 `fetch` + 手写 LRU/闸门，避免 ESM/CJS 互操作坑与安装包膨胀。
3. **纯函数层与 IO 层隔离。** `require("electron")` 的模块无法在 vitest(jsdom) 下导入，因此所有解析/构造/映射/校验代码**不得 import electron**；fetch 与 safeStorage 收敛到 `ai-service.cjs` / `config-store.cjs` 两个薄层，用工厂函数 + 依赖注入（对齐现有 `createStorageHandlers({deps})` 范式）。
4. **AI 配置不进 Zustand store、不进 localStorage。** `notes-data.json` 会随 `createBackup`（保留 10 份）/ `exportAll` / `importBackup` 全链路复制，Key 进 store 等于进所有备份文件。AI 配置独立落 `userData/ai-config.json`。

---

## 二、文件清单

### 新增 · 主进程（11）

| 路径 | 职责 |
|---|---|
| `electron/ai/prompt-templates.cjs` | 三能力 system/user 模板 + style/length/action → temperature/max_tokens 映射 + `TEMPLATE_VERSION`。**纯函数** |
| `electron/ai/openai-adapter.cjs` | baseUrl 归一化、请求体构造、非流式响应解析、`normalizeMarkdown`。**纯函数** |
| `electron/ai/sse-parser.cjs` | SSE 状态机（跨 chunk 行缓冲 / `data:` / `[DONE]` / 注释行）+ `TextDecoder` 封装。**纯函数** |
| `electron/ai/error-map.cjs` | 上游异常 → 统一错误码 + 中文文案 + `retryable`。**纯函数** |
| `electron/ai/retry.cjs` | 指数退避 + 抖动、`Retry-After` 解析、"已发 chunk 不重试" 谓词。**纯函数** |
| `electron/ai/lru-cache.cjs` | LRU + TTL + in-flight Promise 去重（注入 `now()`）。**纯函数** |
| `electron/ai/concurrency.cjs` | 全局并发闸门 `acquire()/release()`。**纯函数** |
| `electron/ai/ai-validate.cjs` | AI IPC payload 白名单校验与归一化。**纯函数** |
| `electron/ai/config-store.cjs` | safeStorage 加解密的配置持久化；密钥只进不出 |
| `electron/ai/ai-service.cjs` | 编排：读配置 → 构造 messages → 闸门 → 缓存 → 重试 → fetch → 推送流事件 → 统一信封（工厂 + DI） |
| `electron/ipc/handlers-ai.cjs` | 注册 `ai:*` 通道 + 流事件发送 + 按 webContents 生命周期清理（工厂 + `register()`） |

### 新增 · 渲染进程（10）

| 路径 | 职责 |
|---|---|
| `src/types/ai.ts` | AI 领域类型（请求/响应/错误码/流事件/配置视图），纯类型 |
| `src/services/ai/prompts.ts` | UI 选项常量与文案（与 `prompt-templates.cjs` 交叉断言，防双源漂移） |
| `src/services/ai/errors.ts` | 错误码 → 中文文案 / 是否展示重试按钮（渲染侧兜底） |
| `src/services/ai/stream.ts` | 流式会话注册表：requestId 生成、Map 分发、rAF 节流、四路径清理 |
| `src/services/ai/aiClient.ts` | **统一对外接口**：generate / optimize / transform / stream / batch / config，含去重 |
| `src/services/ai/index.ts` | 汇总导出 |
| `src/hooks/useAiWriter.ts` | AiWriter 状态机（配置 → 流式生成 → 取消 → 错误 → 插入） |
| `src/hooks/useAiSelectionAction.ts` | 编辑器选区 AI 操作状态机（选区快照 + 失配退化） |
| `src/components/ai/AiSelectionMenu.tsx` | 选区浮层菜单（润色/改写/扩写/总结 + 风格转换） |
| `src/components/settings/AiSettingsTab.tsx` | 设置面板「AI」页签内容 |

> 刻意**不建**渲染侧 `cache.ts` / `concurrency.ts` / `hash.ts`：缓存与并发以主进程为权威（跨窗口共享、messages 在主进程构造天然稳定），渲染侧只需在 `aiClient.ts` 内做同 key in-flight 去重，避免双份结果缓存不一致。也**不建** `aiSlice.ts`：配置属敏感数据（见约束 4），流式中间态属高频局部状态，进 store 会引发全应用重渲染并污染撤销栈。

### 新增 · 测试与文档（10）

`tests/unit/`：`aiSseParser.test.ts`、`aiOpenAiAdapter.test.ts`、`aiPromptTemplates.test.ts`、`aiErrorMap.test.ts`、`aiRetry.test.ts`、`aiLruCache.test.ts`、`aiValidate.test.ts`、`aiService.test.ts`、`aiClient.test.ts`、`aiStream.test.ts`；文档 `docs/AI-集成文档.md`。

### 修改（10）

| 路径 | 改动 |
|---|---|
| [electron/main.cjs](file:///d:/00_临时与交换区/桌面/笔记/electron/main.cjs) | require `handlers-ai`；L218-L222 处实例化并 `register()`；`web-contents-created` 挂 `destroyed` → 清理该窗口在途请求 |
| [electron/preload.cjs](file:///d:/00_临时与交换区/桌面/笔记/electron/preload.cjs) | 暴露 AI 方法；**单次**注册 `ai:stream:event` 监听 + requestId 分发 Map |
| [src/types/electron.d.ts](file:///d:/00_临时与交换区/桌面/笔记/src/types/electron.d.ts) | 补 AI 方法签名 |
| [SettingsPanel.tsx](file:///d:/00_临时与交换区/桌面/笔记/src/components/settings/SettingsPanel.tsx) | `activeTab` union（L27）加 `'ai'`，tabs 数组加项，body 加渲染分支 |
| [AiWriter.tsx](file:///d:/00_临时与交换区/桌面/笔记/src/components/ai/AiWriter.tsx) | **整体删除 L38-L336 本地模板生成与 L361-L373 的 setTimeout 模拟**，接 `useAiWriter`；结果区改流式预览 + 取消/重试 + 错误态。保留 `STYLE_OPTIONS`/`LENGTH_OPTIONS`（UI 仍在用） |
| [Editor.tsx](file:///d:/00_临时与交换区/桌面/笔记/src/components/editor/Editor.tsx) | 选区捕获 + AI 调用 + 完成后一次性 `updateDocContent` 回写 |
| [EditorHeader.tsx](file:///d:/00_临时与交换区/桌面/笔记/src/components/editor/EditorHeader.tsx) | 工具栏新增「AI」按钮 |
| `src/styles/ai-writer.css` | 流式光标、取消/重试、错误条、缓存标记 |
| `src/styles/settings.css` | AI 页签表单、校验态、连通性测试状态 |
| `CLAUDE.md` | 补一段 AI 分层说明与 `TEMPLATE_VERSION` 递增规则 |

---

## 三、分层与数据流

```
UI        AiWriter.tsx · AiSelectionMenu.tsx · AiSettingsTab.tsx   （只消费 hooks）
Hook      useAiWriter / useAiSelectionAction                        （状态机 + 生命周期清理）
Client    src/services/ai/aiClient.ts                               （统一签名 + 去重 + 错误归一）
          └ stream.ts（会话注册表 + rAF 节流）
Bridge    window.notesApi.*  (preload：白名单 + 单次事件监听 + Map 分发)
IPC       invoke('ai:generate' | 'ai:stream:start' | 'ai:cancel' | 'ai:batch' | 'ai:config:*')
          ← on('ai:stream:event', { requestId, ... })   仅发给 invoke 的发送方
Service   electron/ai/ai-service.cjs：校验 → 闸门 → 缓存 → 重试 → fetch → 推送事件
          ├ config-store.cjs（safeStorage 解密 key，仅此处可见）
          ├ prompt-templates.cjs（构造 messages）
          └ openai-adapter.cjs + sse-parser.cjs
HTTP      fetch(`${baseUrl}/chat/completions`, { Authorization: Bearer })
```

**核心契约：跨 IPC 一律用信封（envelope），不 throw。**
`ipcMain.handle` 抛出的错误经 Electron 序列化后只剩 message 字符串（带前缀 `Error invoking remote method '...'`），`code`/`retryable`/`httpStatus` 全丢。因此**只有 payload 校验失败才 throw**（视为编程错误），所有运行时错误返回 `{ ok: false, error }`。
配套：[preload.cjs](file:///d:/00_临时与交换区/桌面/笔记/electron/preload.cjs#L3-L13) 的 `withErrorHandling` 会把任何错误重包为 `new Error(err.message)`，**AI 通道绝不复用它**。

---

## 四、SSE 流式的 IPC 设计

### 通道清单

| 通道 | 方向 | 载荷 → 返回 |
|---|---|---|
| `ai:config:get/set/clear` | invoke | void / patch → `AiConfigView` |
| `ai:config:test` | invoke | `AiConfigPatch?` → `{ ok, latencyMs, model, reply }` |
| `ai:generate` | invoke | `AiRequestPayload` → `AiResponse` |
| `ai:stream:start` | invoke | `AiRequestPayload` → `{ ok: true, requestId }`（**立即返回**） |
| `ai:cancel` | invoke | `{ requestId }` → `{ ok: boolean }` |
| `ai:batch` | invoke | `AiRequestPayload[]` → `{ results: AiResponse[] }` |
| `ai:stream:event` | main → renderer | `AiStreamEvent` |

### 关键点

- **requestId 由渲染进程生成**（`crypto.randomUUID()`），**先注册回调到 Map，再 invoke**。若由主进程生成，首包可能在 invoke 未 resolve、前端还不知道 requestId 时就发出 → 丢首包。主进程校验格式 `^[A-Za-z0-9_-]{8,64}$` 且未在途。
- **不用广播。** `app.on('activate')` 会再建窗口，若用 `getAllWindows().forEach(w => w.webContents.send(...))`，B 窗口会渲染 A 窗口的 AI 输出 —— 既串台又跨窗口泄露笔记内容。正确做法：handler 内用 `event.sender.send(...)`，只发给发起方（`event.reply` 已废弃，不用）。
- **发送前判活**：`if (!sender.isDestroyed()) sender.send(...)`，否则流式期间关窗口会抛 `Object has been destroyed`。
- **单通道 + requestId 多路复用**（动态通道名无法在 preload 做白名单，且会不断加监听器）。
- **监听器三层防护**：① preload 只注册一次 `ipcRenderer.on`，禁止每次调用 `on`+`removeListener`（并发 10 个流即触发 `MaxListenersExceededWarning`）；② 渲染侧 `done`/`error`/`cancel`/`unmount` 四条路径都必须 `Map.delete`；③ 主进程 `Map<requestId,{controller,senderId}>`，`web-contents-created` 里挂 `wc.once('destroyed', abortAllForWebContents(wc.id))`。
- **handler 立即返回**，后台 detached async 跑流并用 try/catch 包住（否则触发 `unhandledRejection`，流静默中断）。若 handler `await` 整个流，`invoke` 会挂几分钟不 resolve，前端无法区分"卡住"和"在跑"。
- **主进程对 `chunk` 做 16ms 合流**（`done`/`error` 前强制 flush），避免一字一条 IPC。

### 事件载荷

```ts
type AiStreamEvent =
  | { requestId: string; type: 'meta';  model: string; cached: boolean; attempt?: number }
  | { requestId: string; type: 'chunk'; delta: string }
  | { requestId: string; type: 'done';  text: string; usage?: AiUsage; latencyMs: number; firstDeltaMs?: number }
  | { requestId: string; type: 'error'; error: AiError }
```

### preload 暴露签名

```js
aiConfigGet/Set/Clear/Test, aiGenerate, aiBatch,
aiStreamStart(payload), aiCancel(requestId),
aiStreamSubscribe(requestId, handlers) -> unsubscribe, aiStreamUnsubscribe(requestId)
```

---

## 五、统一接口设计

```ts
export interface AiClient {
  generate(input: GenerateInput, opts?: CallOptions): Promise<AiResponse>;
  optimize(input: OptimizeInput, opts?: CallOptions): Promise<AiResponse>;
  transform(input: TransformInput, opts?: CallOptions): Promise<AiResponse>;
  stream(input: AiRequest, handlers: StreamHandlers, opts?: CallOptions): AiStreamHandle;
  batch(inputs: AiRequest[], opts?: BatchOptions): Promise<AiBatchResult>;
  config: { get(); set(patch); clear(); test(patch?); };
}

interface GenerateInput  { topic; style; length; includeOutline; includeExamples }
interface OptimizeInput  { action: 'polish'|'rewrite'|'expand'|'summarize'; text; instructions? }
interface TransformInput { text; targetStyle; instructions? }

type AiResponse = { ok:true; capability; text; title?; model; usage?; cached; latencyMs }
                | { ok:false; error: AiError }
interface AiError { code: AiErrorCode; message: string; retryable: boolean; httpStatus?; attempts? }
interface AiStreamHandle { requestId: string; cancel(): void; done: Promise<AiResponse> }
```

**渲染进程只发结构化参数，不拼 messages** —— messages 由主进程 `prompt-templates.cjs` 构造。好处：payload 白名单简单、缓存 key 稳定、改模板不动前端。

### 能力 → 模板

| capability | system | user |
|---|---|---|
| `generate` | `STYLE_SYSTEM[style]` + 通用输出约束 | `主题：{topic}\n风格：{styleLabel}\n长度：{lengthGuide}\n要求：{大纲/示例}\n请输出完整 Markdown，首行为一级标题。` |
| `optimize` | 通用输出约束 | `{OPTIMIZE_INSTRUCTION[action]}\n\n---\n原文：\n{text}` |
| `transform` | `STYLE_SYSTEM[targetStyle]` + `只改变表达风格，不得增删事实信息` | `请将以下文本转换为{styleLabel}风格：\n\n---\n{text}` |

通用输出约束（附加到 system 末尾）：`直接输出 Markdown 正文，不要解释性开场白或结束语，不要用 ``` 围栏包裹整篇回答。`

### 映射表

**style → system 要点 / temperature**

| style | 要点 | temp |
|---|---|---|
| `formal` | 专业商务文档撰写者；正式客观结构化书面语；避免口语/感叹号/表情 | 0.4 |
| `casual` | 轻松亲切的博客作者；友好口语化但通顺 | 0.8 |
| `technical` | 资深工程师/技术文档作者；精确术语；代码围栏必须带语言标注 | 0.3 |
| `creative` | 富有想象力的创意写作者；生动比喻与画面感 | 0.9 |
| `academic` | 严谨学术研究者；客观严谨；不用第一人称情绪化表达 | 0.3 |

**length → max_tokens / 字数指引**

| length | max_tokens | 字数 | 小节数 |
|---|---|---|---|
| `short` | 800 | 约 200-400 | 2-3 |
| `medium` | 1600 | 约 500-800 | 4-5 |
| `long` | 3200 | 约 1000-1500 | 6-8 |

**optimize action → instruction / temperature**

| action | 要点 | temp |
|---|---|---|
| `polish` | 不改原意与信息量；修语病、统一术语、提可读性；保持 Markdown 结构 | 0.3 |
| `rewrite` | 保留原意；调整句式与段落组织；不新增事实 | 0.7 |
| `expand` | 补充细节、例证与过渡；篇幅约 1.5-2 倍；不偏离主题 | 0.6 |
| `summarize` | 提炼核心结论；3-6 条列表 + 1 段总结；不引入原文外信息 | 0.2 |

`optimize`/`transform` 的 `max_tokens` 按输入换算：`min(4096, max(800, ceil(text.length * 1.8)))`。`generate` 的缓存语义：`temperature > 0` 时结果不唯一，**「重新生成」必须带 `bypassCache: true`**（跳过读缓存但仍写缓存）。

---

## 六、适配层与校验

### baseUrl 归一化

去尾 `/`；末尾非版本段（`/v\d+`）则补 `/v1`；请求地址 = `baseUrl + '/chat/completions'`。

| provider | 用户填写 | 请求 |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | `.../v1/chat/completions` |
| DeepSeek | `https://api.deepseek.com` | 归一为 `.../v1/chat/completions` |
| Moonshot | `https://api.moonshot.cn/v1` | 同 |
| 通义兼容模式 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | 同 |
| Ollama | `http://localhost:11434` | 归一为 `...:11434/v1/...` |

协议只允许 `http:`/`https:`（显式拒绝 `file:`/`javascript:` —— 用户可控的 baseUrl 是主进程出网目标，属 SSRF 面）。不禁 `http`，否则本地 Ollama 不可用。

### 请求体

```js
{ model, messages, temperature, max_tokens, stream,
  ...(stream && !disableStreamOptions ? { stream_options: { include_usage: true } } : {}) }
```

高级覆盖项（存配置）：`maxTokensParam: 'max_tokens' | 'max_completion_tokens'`（OpenAI o 系列只认后者）、`disableStreamOptions`（部分国产网关不接受）。
**自动降级**：带 `stream_options` 收到 400 且 message 含 `stream_options`/`unknown parameter` 时，去掉该字段重试一次。

### SSE 解析

- 内部 `buffer` 按 `\n` 切分，**最后一段不完整行留在 buffer**（跨 chunk 分片）；`flush()` 处理残留尾行。
- 行首 `:` → 注释（keep-alive）跳过；`data:`/`data: ` 前缀剥离；`[DONE]` → 结束；JSON 解析失败 → `console.warn` 跳过该行**不中断流**。
- 取 `choices[0].delta.content`；`reasoning_content`（DeepSeek-R1 类）默认忽略；`usage` 仅在 `include_usage` 末包出现。
- **`TextDecoder` 必须 `{ stream: true }` 且每请求新建实例**（模块级共享会让并发流互相污染）。中文 3 字节/字符，跨 TCP chunk 断裂几乎必然，漏掉会产生 `\uFFFD` 乱码且偶发难复现。流结束补 `decoder.decode()` flush。
- **上游不支持流式兜底**：响应 `Content-Type` 是 `application/json` 时按非流式解析，emit 单个 `chunk` + `done`。

### 响应归一化 `normalizeMarkdown`

`\r\n|\r` → `\n` → 剥离整体代码围栏 `^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$` → 折叠 3+ 连续空行为 2 → `trim()` → `generate` 额外抽首个 `^# (.+)$` 作 `title`（无 H1 回退用 topic）。
**不做**"删除开场白"启发式裁剪（误删正文风险 > 收益），改由 system prompt 约束。
缺 `choices`/`message` → `AI_ERR_BAD_FORMAT`；`finish_reason==='content_filter'` → `AI_ERR_CONTENT_FILTER`；内容空 → `AI_ERR_EMPTY_CONTENT`。

### payload 白名单校验 `ai-validate.cjs`

| 字段 | 规则 | 上限 |
|---|---|---|
| `requestId` | `^[A-Za-z0-9_-]{8,64}$` | 必填 |
| `capability` | 枚举 | generate/optimize/transform |
| `topic` | trim 非空（仅 generate） | ≤ 2000 字 |
| `text` | trim 非空（optimize/transform） | ≤ 8000 字 |
| `action` | 枚举（仅 optimize） | 4 值 |
| `targetStyle` | 枚举（仅 transform） | 5 值 |
| `style` / `length` | 枚举（仅 generate） | — |
| `includeOutline`/`includeExamples` | boolean，默认 false | — |
| 未知字段 | **忽略**（只白名单挑字段，不报错） | — |

整体序列化 ≤ 64KB；估算输入 token（`chars/1.6`）超 `maxInputTokens`（默认 8000）→ `AI_ERR_INPUT_TOO_LONG`。

`assertAiConfigPayload`：`baseUrl` 8..2048 且 `^https?://` 且 `new URL()` 可解析；`apiKey` 可选 0..512 且不含换行（空串=清除，未提供=保留原值）；`model` 1..128 且 `^[A-Za-z0-9._:\/-]+$`；`temperature` 0..2；`maxTokens` 1..32000；`timeoutMs` 1000..300000。
`assertBatchPayload`：数组长度 1..16。

---

## 七、错误处理

| code | 触发 | retryable | 中文文案 |
|---|---|---|---|
| `AI_ERR_NOT_CONFIGURED` | 未配置 | 否 | 尚未配置 AI 服务，请前往「设置 → AI」填写接口地址与 API Key |
| `AI_ERR_NETWORK` | fetch TypeError（DNS/ECONNREFUSED/证书） | 是 | 网络连接失败，请检查网络或接口地址 |
| `AI_ERR_TIMEOUT` | 超时中止 | 是 | 请求超时（已等待 {n} 秒），请稍后重试 |
| `AI_ERR_ABORTED` | 用户取消 | 否 | 已取消生成 |
| `AI_ERR_AUTH` | 401 | 否 | API Key 无效或已过期，请重新配置 |
| `AI_ERR_FORBIDDEN` | 403 | 否 | 无访问权限：Key 权限不足、模型未开通或余额不足 |
| `AI_ERR_NOT_FOUND` | 404 | 否 | 接口地址或模型名称不存在，请检查 baseUrl 与 model |
| `AI_ERR_RATE_LIMIT` | 429 | 是 | 请求过于频繁或已达配额，请稍后重试 |
| `AI_ERR_SERVER` | 500/502/503/504 | 是 | AI 服务暂时不可用（HTTP {status}），正在重试 |
| `AI_ERR_BAD_REQUEST` | 400/422 或本地校验 | 否 | 请求参数被服务端拒绝：{detail} |
| `AI_ERR_CONTENT_FILTER` | `content_filter` 或 400 匹配 `safety\|content_policy\|风险` | 否 | 内容被安全策略拦截，请调整输入 |
| `AI_ERR_BAD_FORMAT` | JSON 失败 / 缺 choices / 无有效 delta | 限 1 次 | 服务返回格式异常，可能不是 OpenAI 兼容接口 |
| `AI_ERR_EMPTY_CONTENT` | 200 但正文空 | 限 1 次 | 模型没有返回内容，请重试或更换模型 |
| `AI_ERR_INPUT_TOO_LONG` | 本地长度校验 | 否 | 输入内容过长（上限 {n} 字），请缩短 |
| `AI_ERR_ENCRYPTION_UNAVAILABLE` | safeStorage 不可用 | 否 | 系统不支持安全存储，API Key 仅本次运行有效 |
| `AI_ERR_UNKNOWN` | 兜底 | 否 | 生成失败：{msg} |

### 重试

- 可重试集合：NETWORK / TIMEOUT / RATE_LIMIT / SERVER / BAD_FORMAT / EMPTY_CONTENT。
- `maxAttempts = 3`；`delay = min(500 * 2^(attempt-1), 8000)` + 抖动 `random()*0.3*delay`。
- 429 带 `Retry-After`（数字秒或 HTTP-date）优先采用，clamp 30s。
- **流式保护**：`hasEmittedChunk` 为 true 后禁止重试（否则用户看到两遍内容）；重试只在首包到达前允许，用注入的 `canRetry()` 谓词表达。
- 重试中通过 `meta` 事件回传 `attempt`，UI 可显示"第 2 次重试…"。

### 超时与取消（AbortController）

```js
const ctrl = new AbortController();
let timedOut = false, userCancelled = false;   // 判定时 userCancelled 优先
const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs);
userCtrl.signal.addEventListener('abort', onUserAbort, { once: true });
try { /* fetch(url, { signal: ctrl.signal }) */ }
finally { clearTimeout(timer); userCtrl.signal.removeEventListener('abort', onUserAbort); }
```

- 非流式：单一 `timeoutMs`（默认 60000）。
- 流式三段超时：`firstByteTimeoutMs`(20s) / `idleTimeoutMs`(60s) / `totalTimeoutMs`(300s 硬上限)。
- 不依赖 `AbortSignal.any`/`AbortSignal.timeout` —— 手写组合更易测且能携带取消原因标志。
- abort 后 `reader.read()` 会 reject，catch 中先判标志位再落 `AI_ERR_UNKNOWN`。

---

## 八、性能优化

### 缓存（以主进程为权威）

- **key**：`sha256(JSON.stringify({ v: TEMPLATE_VERSION, capability, model, temperature, maxTokens, messages }))`，用 `node:crypto`。messages 构造顺序固定 → `JSON.stringify` 即稳定。`TEMPLATE_VERSION` 随模板改动递增，防旧缓存污染。
- **参数**：容量 100 条、TTL 10 分钟、单条 ≤ 256KB（超限不缓存），总内存上界约 8MB。
- **实现**：`Map` 插入顺序即 LRU（`get` 命中时 `delete`+`set` 移到末尾；`set` 超容删 `keys().next().value`）。TTL 用条目 `expiresAt` 惰性判定 + 写入时顺带清理，**不引入 `setInterval`**（主进程定时器难清理，是泄漏来源）。
- 命中返回 `cached: true`，UI 标「来自缓存」。`stream` 默认不读写缓存。
- **in-flight 去重**：`Map<cacheKey, Promise>`，同 key 未完成时复用同一 Promise，`finally` 中 delete。**仅非流式**（流式两个订阅者语义复杂，不做并在文档说明）。

### 并发闸门

- 主进程全局 `MAX_CONCURRENT = 3`（可配 1..8）：`acquire()` 满则入队，`release()` 出队。
- `ai:batch` 在主进程内逐项 enqueue，单项失败不整体失败（`continueOnError` 默认 true）。
- **流式也走闸门**（长连接占资源，不限流会被打满上游配额触发 429 风暴）。

### 流式节流

主进程 16ms 合流（约 60fps）；渲染侧 `stream.ts` 把累积文本写 `useRef`，用 `requestAnimationFrame` 同步到 state，避免每 chunk 触发 React 重渲染。

### 量化指标（写入文档并可验证）

| 指标 | 目标 |
|---|---|
| 首字延迟 TTFT（本地 Ollama） | ≤ 800ms |
| 首字延迟（云端） | ≤ 3s |
| 流式 IPC 事件频率 | ≤ 62 条/秒 |
| 缓存命中耗时 | ≤ 5ms |
| 缓存命中率（同文档连点「润色」） | 第二次起 100% |
| 上游在途请求峰值 | ≤ 3 |
| 重试总等待 | ≤ 约 1.5s；单次 delay ≤ 8s |
| 缓存内存上界 | ≤ 100 条 / ≤ 8MB |
| 生成端到端（medium/云端） | P50 ≤ 8s |
| 新增运行时依赖 | 0 |

---

## 九、安全

### safeStorage 流程

落盘：`path.join(app.getPath('userData'), 'ai-config.json')`（与 `notes-data.json` 同级、独立文件）。

```json
{ "version": 1, "baseUrl": "...", "model": "...", "temperature": 0.7, "maxTokens": 1600,
  "timeoutMs": 60000, "stream": true, "maxTokensParam": "max_tokens", "disableStreamOptions": false,
  "apiKeyEnc": { "v": 1, "alg": "safeStorage", "data": "<base64>" } }
```

- **必须在 `app.whenReady()` 之后调用**（时序要求）。
- `isEncryptionAvailable()` 为 true → `encryptString` → base64 存 `apiKeyEnc`；写后 `fs.chmod(file, 0o600)`（Windows no-op 无害）。
- 为 false（如 Linux 无 keyring）→ **不落盘**，仅主进程内存保留本次会话，返回 `{ saved:false, encryptionAvailable:false }`，UI 提示"仅本次运行有效"。**绝不提供明文落盘开关**。
- `apiKey` 空串 → 删除 `apiKeyEnc`；未提供 → 保留原值（只改 baseUrl/model 无需重输）。
- 解密失败（配置被改/DPAPI 失效）→ 捕获后视为无 key，提示重新配置，不抛异常。

### 密钥边界

| 渲染进程可拿到 | 拿不到 |
|---|---|
| `configured` / `hasKey` / `encryptionAvailable` | API Key 明文 |
| `baseUrl`/`model`/`temperature`/`maxTokens`/`timeoutMs`/`stream` 等 | `apiKeyEnc.data` 密文 |
| 连通性测试的延迟与模型回显 | 任何解密派生值、鉴权头、上游原始响应头 |

- **唯一例外**：`ai:config:test` 允许可选携带 `apiKey`（"先测后存"必需），仅本次使用、不落盘、不回显、不记日志。需在文档显式标注为受控例外。
- **日志脱敏**：`redactSecrets(msg)` 正则把 `sk-[A-Za-z0-9_-]{8,}` / `Bearer\s+\S+` 替换为 `***`，所有错误落日志前过一遍。
- **CSP 不动**；SSRF 靠协议白名单；**数据外流告知**：选区文本会发往用户自配的第三方 API，首次使用需在 AI 设置页勾选确认后才启用。
- Prompt injection：用户文本只进 user message；文档声明"模型输出仅供参考，不可作为可信指令"。

---

## 十、测试与文档

### 单元测试（10 个文件）

导入方式：纯函数 `.cjs` 用 `import { x } from '../../electron/ai/xxx.cjs'`（同 [tests/unit/markdownToSimpleHtml.test.ts](file:///d:/00_临时与交换区/桌面/笔记/tests/unit/markdownToSimpleHtml.test.ts#L3) 范式）。`require('electron')` 的模块不写单测，改用 DI 替身。

| 文件 | 覆盖要点 |
|---|---|
| `aiSseParser` | 完整包解析；一行 JSON 被切成两 chunk 能拼回；`: keep-alive` 忽略；`[DONE]`；非法 JSON 跳过不抛；`reasoning_content` 忽略；`usage` 仅末包；尾包无换行时 `flush()`；**中文多字节跨 chunk**（`TextEncoder` 切 3 段喂 `decodeChunk`，断言无 `\uFFFD`） |
| `aiOpenAiAdapter` | `normalizeBaseUrl` 5 个 provider（含尾 `/`、已含 `/v1`、`/compatible-mode/v1`）；`buildChatRequest` 的 stream/max_tokens 切换/stream_options 开关；`normalizeMarkdown` 剥围栏、`\r\n` 归一、空行折叠、抽 H1；空 choices → BAD_FORMAT；`content_filter` |
| `aiPromptTemplates` | 5 style 的 system 非空且两两不同；3 length → 800/1600/3200；temp 均在 0..2；4 action 均有 instruction；user prompt 含 topic/style/length；**与 `src/services/ai/prompts.ts` key 集合交叉断言** |
| `aiErrorMap` | 401→AUTH 不可重试；429→RATE_LIMIT 可重试；503→SERVER；AbortError+userCancelled→ABORTED；AbortError+timedOut→TIMEOUT；`TypeError('fetch failed')`→NETWORK；400+`safety`→CONTENT_FILTER；每个 code 文案非空且无未替换 `{...}` 占位；未知→UNKNOWN |
| `aiRetry` | `computeDelay` 上界与抖动区间；注入 mock `sleep`+假时钟断言 3 次失败共调用 4 次；`retryable=false` 不重试；`canRetry()` false 不重试；`Retry-After` 三种解析 + clamp |
| `aiLruCache` | 命中移末尾；超容淘汰最旧；TTL 过期（注入 `now()`）；超 `maxEntryBytes` 不写入；同 key in-flight loader 只执行一次且完成后 map 清空 |
| `aiValidate` | 非对象/数组抛；`file://`/`javascript:`/非 URL 抛；model 含空格/换行抛；requestId 非法抛；topic>2000、text>8000 → INPUT_TOO_LONG；optimize 缺 action 抛；未知字段被忽略 |
| `aiService` | DI `{ fetchImpl, now, sleep, getConfig, cache, gate }`；`vi.stubGlobal('fetch')` 返回 `new Response(ReadableStream)`（Node 22 有全局）；假时钟断言超时；断言取消后 signal aborted；`bypassCache` 跳过读缓存；并发峰值 ≤ limit；**流式已发 chunk 后不重试** |
| `aiClient` | `Object.defineProperty(window,'notesApi',{value:fakeApi})`；成功/失败信封；`stream()` onDelta 累积；`cancel()` 后不再回调；同 key 第二次不进 IPC（断言调用次数）；`batch()` 峰值并发 |
| `aiStream` | `vi.useFakeTimers()` 验证节流 flush 次数；`unsubscribe` 后 Map 空；同 requestId 重复注册被拒；done/error/cancel/unmount 四路径均清空 Map |

**Mock 策略**：把不可测 IO 挤到两个薄层后，8 个纯函数模块完全不碰 fetch，其测试零 mock。

### 文档 `docs/AI-集成文档.md` 章节

1. 概述与设计目标（统一适配 / 主进程代理 / CSP 零变更 / 零新增依赖）
2. 架构与数据流（分层图 + IPC 通道表）
3. 配置指南（5 个 provider 的 baseUrl/apiKey/model 示例表；Ollama 本地部署；参数含义与推荐值；连通性测试步骤）
4. 接口说明（`aiClient` 签名、`AiRequestPayload`/`AiResponse`/`AiStreamEvent` 定义、信封约定、requestId 契约）
5. 三大能力与 prompt 设计（完整映射表、输出归一化规则、已知局限）
6. 错误码表
7. 性能策略（缓存 key 构造、in-flight 去重、并发闸门、流式节流）
8. 安全说明（safeStorage 流程与降级、密钥边界表、日志脱敏、SSRF、数据外流告知）
9. 测试用例与覆盖矩阵
10. 性能指标要求（含每项验证命令）
11. 排障 FAQ（常见错误对照、看主进程日志、验证走了缓存）
12. 变更记录与 `TEMPLATE_VERSION` 递增规则

---

## 十一、实施顺序

| 阶段 | 内容 | 结束时可验证状态 |
|---|---|---|
| **0. 契约** | `src/types/ai.ts`、`prompt-templates.cjs` 骨架 | `npm run typecheck` 通过，`lint` 无新增 error |
| **1. 纯函数层** | 8 个纯函数模块 + 7 个单测 | `npm run test:unit` 全绿；人工确认这 8 个文件内无 `require("electron")` |
| **2. 主进程 + IPC** | `config-store` / `ai-service` / `handlers-ai`、`main.cjs` 接线、`preload.cjs` 白名单与事件分发、`electron.d.ts` | `typecheck`+`lint` 绿；`aiService.test.ts` 绿；`npm run dev` 后 DevTools 执行 `await window.notesApi.aiConfigGet()` 返回 `{configured:false}` 不抛异常 |
| **3. 渲染客户端** | `services/ai/*` 6 文件 + `useAiWriter.ts` | `aiClient.test.ts`、`aiStream.test.ts` 绿；`typecheck`+`lint` 绿 |
| **4. 设置页** | `AiSettingsTab.tsx` + `SettingsPanel` 加 `'ai'` 页签 + `settings.css` | 手工：填 DeepSeek baseUrl+key → 测试连接成功；**重启后仍显示"已配置"且 key 不回显**；DevTools `localStorage` 与 `notes-data.json` 均无 key |
| **5. AiWriter 接入** | 删除本地模板与 setTimeout，接 `useAiWriter`；流式预览 + 取消/重试 + 错误态；`ai-writer.css` | 手工：打字机效果、可中途取消、失败有中文提示；**`npm run build && npm run start` 用打包版（严格 CSP）复验** |
| **6. 编辑器选区操作** | `AiSelectionMenu.tsx`、`useAiSelectionAction.ts`、`Editor.tsx`、`EditorHeader.tsx` | 手工：选中 → 点「润色」→ 流式预览 → 完成后一次性插入 → **Ctrl+Z 可撤销** |
| **7. 收尾** | `docs/AI-集成文档.md`；`CLAUDE.md` 补 AI 分层说明 | `npm run test:unit && npm run lint && npm run typecheck && npm run build` 全绿 |

---

## 十二、验收方式

```bash
npm run typecheck      # 0 error
npm run lint           # 无新增 error（warn 数量不上升）
npm run test:unit      # 原 66 个 + 新增 AI 用例全绿
npm run build          # 构建通过
npm run start          # 打包版（严格 CSP）手工验收 4 项范围
```

手工验收清单：
1. 设置 → AI：填 `https://api.deepseek.com` + key + `deepseek-chat` → 「测试连接」返回延迟与模型名。
2. 重启应用 → 仍显示已配置，key 不回显；`notes-data.json`、`localStorage`、导出备份中均搜不到 key。
3. AI 写作：输入主题 → 流式打字机输出 → 中途「取消」立即停止 → 「重新生成」绕过缓存产出不同内容。
4. 编辑器：选中一段文字 → AI 浮层「润色」→ 流式预览 → 插入 → Ctrl+Z 一次性撤销。
5. 断网后点生成 → 中文错误提示 `AI_ERR_NETWORK`，不出现英文堆栈。
6. 故意填错 key → 提示 `AI_ERR_AUTH`，不重试。

---

## 十三、关键风险（按踩坑概率）

1. **preload `withErrorHandling` 会吞掉结构化错误** —— AI 通道不复用它，且一律返回信封而非 throw。不认识这条会推翻整个错误处理设计。
2. **`TextDecoder` 必须 `{stream:true}` 且每请求新建** —— 中文跨 TCP chunk 断裂几乎必然，漏掉产生偶发 `\uFFFD` 乱码。
3. **`AiWriter` 由 `isOpen` 控制显隐、常驻挂载**（[StartPage.tsx#L379-L383](file:///d:/00_临时与交换区/桌面/笔记/src/components/start/StartPage.tsx#L379-L383)），关闭时组件**不卸载**。现有空依赖 effect 清理定时器实际不生效。必须在 `useEffect(() => { if (!isOpen) cancelAll(); }, [isOpen])` 取消在途流。
4. **`react-hooks/exhaustive-deps` 是 error 级** —— 回调依赖里禁止每次渲染新建的对象（无限循环）；依赖只放 setter、稳定 ref、模块级单例 `aiClient` 方法；跨回调同步用 ref 桥接，不要用 `useMemo` 硬凑。
5. **绝不把流式文本写进 `useNotesStore`** —— `updateDoc` 每次变更都写 auto 版本快照（30s 合并、上限 50）并触发全应用重渲染。逐 chunk 落库会瞬间打满版本上限、冲掉历史、污染撤销栈。**只在浮层局部 state 更新，完成后一次性 `updateDocContent` 回写。**
6. **`noUnusedLocals` + `no-unused-vars:error`** —— 改造 AiWriter 必须整体删净 L38-L336（约 300 行），留一个即编译失败；`STYLE_OPTIONS`/`LENGTH_OPTIONS` 仍被 UI 使用须保留。
7. **监听器泄漏 / `MaxListenersExceededWarning`** —— preload 单次注册 + Map 分发；渲染侧四路径 delete。
8. **流式重试产生重复文本** —— `hasEmittedChunk` 后禁止重试，属"看起来能跑但用户看到两遍"的隐性 bug。
9. **配置绝不能进 store / localStorage** —— 会随备份链路复制；必须独立落 `ai-config.json`。
10. **`event.sender` 判活** —— 每次 send 前 `isDestroyed()`，否则流式期间关窗口抛 `Object has been destroyed`。
11. **dev 模式无 CSP 会掩盖问题** —— 阶段 5 必须用打包版复验。
12. **编辑器是受控 textarea** —— `editorTextOps.ts` 的 `wrapSelection` 等直改 `ta.value`，在此链路不适用；AI 回写必须走 [Editor.tsx#L143-L159](file:///d:/00_临时与交换区/桌面/笔记/src/components/editor/Editor.tsx#L143-L159) `updateDocContent`（保撤销/版本）。选区快照沿用 `handleOpenLinkDialog`（L162-L168）的 `{start,end,text}` 模式，回写前按 `substring(start,end) !== text` 做失配退化。
13. **`textareaNode` 会重建**（预览/空态切换）—— AI 操作前即时从 `textareaRef.current` 读选区，不跨操作缓存 DOM 节点引用。
14. **上游兼容性** —— 部分国产模型对 `temperature` 范围与 `stream_options` 敏感直接 400；需 `maxTokensParam` 切换 + `disableStreamOptions` + 400 自动降级一次，并写进文档。
15. **`verbatimModuleSyntax`** —— `src/types/ai.ts` 全为类型，使用方必须 `import type`。
16. **`no-console` 只允许 warn/error** —— cjs 不在 lint 范围（覆盖 `**/*.{ts,tsx}`），但新增 AI 的 ts 代码统一 warn/error。