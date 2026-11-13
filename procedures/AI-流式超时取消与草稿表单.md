# AI-流式超时取消与草稿表单

## 触发条件
改 AI 流式/取消/设置表单后出现「推理模型必超时」「取消要等很久才生效」「改一个字段其余配置被重置」。

## 首选姿势
- **流式超时**：「活跃」信号认**任何 SSE data 帧**（含 reasoning_content/usage），不能只认正文 delta——推理模型思考超 20s 首包上限会被误杀。parser onActivity → streamAttempt 透传 → 清首包/重置空闲。emittedChunk 仍只由正文驱动（已发 chunk 不重试不变量不动）。
- **取消**：重试退避 sleep 必须与取消信号 `Promise.race`（否则 Retry-After 30s 窗口内 cancel 不生效，vitest 5s 挂死）。非流式取消要在主进程登记 requestId→controller（activeNonStream Map），渲染侧 aiClient 立即结算 + best-effort aiCancel。
- **受控草稿表单**：`setDraft(prev => …)` 的空基底取「当前展示态」（view 派生），不能取 EMPTY_FORM；回归测试断言保存补丁的**全字段**。
- 假时钟测流式：手动投喂 ReadableStream + `advanceTimersByTimeAsync` 跨越计时段。

## 反面清单
- 只认 delta.content 的超时活跃判定。
- 退避 sleep 不 race 取消信号。
- 缓存键漏 baseUrl（换服务商同名模型命中旧结果）。
- 预设切换不重置 maxTokensParam（MiMo→DeepSeek 残留 max_completion_tokens 致 400）。

## 验证方式
`npx vitest run tests/unit/aiService.test.ts tests/unit/aiSseParser.test.ts tests/unit/aiClient.test.ts tests/unit/aiSettingsTab.test.tsx tests/unit/aiProviderPresets.test.ts`