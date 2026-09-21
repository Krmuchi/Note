/**
 * 设置面板「AI」页签。
 *
 * 安全约定：API Key 明文只存在于本组件的输入框 state 中，保存后立即清空；
 * 主进程只回传 hasKey 布尔值，不回显密钥。修改其他字段时留空密钥即可保留原值。
 *
 * 配置由父级在切换到本页签时加载并通过 initial 传入 —— 不在 effect 里同步 setState
 * （会触发级联渲染，且被 react-hooks/set-state-in-effect 拒绝）。
 * 表单是「受控草稿」：draft 为 null 时直接从 view 派生，用户一旦编辑才落成草稿。
 */

import { useCallback, useState } from 'react'

import type { AiConfigPatch, AiConfigView, AiError, AiFailure, MaxTokensParam } from '@/types/ai'
import { aiClient, isAiFailure, PROVIDER_PRESETS } from '@/services/ai'

interface AiFormState {
  baseUrl: string
  model: string
  temperature: number
  maxTokens: number
  timeoutMs: number
  stream: boolean
  maxTokensParam: MaxTokensParam
  disableStreamOptions: boolean
  concurrency: number
  maxInputTokens: number
  cacheEnabled: boolean
  consent: boolean
}

const EMPTY_FORM: AiFormState = {
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
  consent: false,
}

interface StatusMessage {
  kind: 'info' | 'success' | 'error'
  text: string
}

interface AiSettingsTabProps {
  /** null 表示父级仍在加载 */
  initial: AiConfigView | AiFailure | null
  onViewChange?: (view: AiConfigView) => void
}

function toForm(view: AiConfigView): AiFormState {
  return {
    baseUrl: view.baseUrl,
    model: view.model,
    temperature: view.temperature,
    maxTokens: view.maxTokens,
    timeoutMs: view.timeoutMs,
    stream: view.stream,
    maxTokensParam: view.maxTokensParam,
    disableStreamOptions: view.disableStreamOptions,
    concurrency: view.concurrency,
    maxInputTokens: view.maxInputTokens,
    cacheEnabled: view.cacheEnabled,
    consent: view.consent,
  }
}

/** 只把已填写的字段放进补丁，避免用空值覆盖主进程里的已有配置 */
function buildOverrides(form: AiFormState, apiKey: string): AiConfigPatch {
  const patch: AiConfigPatch = {
    temperature: form.temperature,
    maxTokens: form.maxTokens,
    timeoutMs: form.timeoutMs,
    stream: form.stream,
    maxTokensParam: form.maxTokensParam,
    disableStreamOptions: form.disableStreamOptions,
    concurrency: form.concurrency,
    maxInputTokens: form.maxInputTokens,
    cacheEnabled: form.cacheEnabled,
    consent: form.consent,
  }
  const baseUrl = form.baseUrl.trim()
  const model = form.model.trim()
  if (baseUrl) patch.baseUrl = baseUrl
  if (model) patch.model = model
  // 只有用户真的输入了新密钥才带上（测试连接时也不落盘）
  if (apiKey) patch.apiKey = apiKey
  return patch
}

/** 模型列表失败时的提示：NOT_FOUND 说明该服务商没实现这个端点，而非配置写错 */
function modelsErrorHint(error: AiError): string {
  if (error.code === 'AI_ERR_NOT_FOUND') return '该服务商未提供 /models 接口'
  return error.message
}

export default function AiSettingsTab({ initial, onViewChange }: AiSettingsTabProps) {
  const [override, setOverride] = useState<AiConfigView | null>(null)
  const [draft, setDraft] = useState<AiFormState | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [status, setStatus] = useState<StatusMessage | null>(null)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  /** 已拉取的模型列表；baseUrl 用于判断缓存是否对应当前输入 */
  const [modelsState, setModelsState] = useState<{ baseUrl: string; models: string[] } | null>(null)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<AiError | null>(null)

  const initialView = initial && !isAiFailure(initial) ? initial : null
  const view = override ?? initialView
  const loadError = initial && isAiFailure(initial) ? initial.error : null
  const form = draft ?? (view ? toForm(view) : EMPTY_FORM)

  const applyView = useCallback(
    (next: AiConfigView): void => {
      setOverride(next)
      setDraft(null)
      onViewChange?.(next)
    },
    [onViewChange],
  )

  const patchForm = useCallback((changes: Partial<AiFormState>): void => {
    setDraft((prev) => ({ ...(prev ?? EMPTY_FORM), ...changes }))
    setStatus(null)
  }, [])

  const handleApplyPreset = useCallback(
    (presetId: string): void => {
      const preset = PROVIDER_PRESETS.find((item) => item.id === presetId)
      if (!preset) return
      patchForm({
        baseUrl: preset.baseUrl,
        model: preset.model,
        ...(preset.maxTokensParam ? { maxTokensParam: preset.maxTokensParam } : null),
      })
      // 换了服务商，之前拉取的列表不再对应当前地址
      setModelsState(null)
      setModelsError(null)
    },
    [patchForm],
  )

  /**
   * 拉取服务商当前提供的模型列表（GET {baseUrl}/models）。
   * 非强制时，同一 baseUrl 已有结果就直接复用，避免每次聚焦都打一次请求。
   */
  const loadModels = useCallback(
    async (force: boolean): Promise<void> => {
      const baseUrl = form.baseUrl.trim()
      if (!baseUrl) {
        setModelsError({ code: 'AI_ERR_NOT_CONFIGURED', message: '请先填写接口地址', retryable: false })
        return
      }
      if (!force && modelsState?.baseUrl === baseUrl) return

      setModelsLoading(true)
      setModelsError(null)

      const patch: AiConfigPatch = { baseUrl }
      const key = apiKeyInput.trim()
      // 未填 Key 时也允许尝试：本地服务（Ollama）无需鉴权
      if (key) patch.apiKey = key

      const result = await aiClient.config.listModels(patch)
      if (isAiFailure(result)) {
        setModelsError(result.error)
        setModelsState(null)
      } else {
        setModelsState({ baseUrl: result.baseUrl, models: result.models })
      }
      setModelsLoading(false)
    },
    [form.baseUrl, apiKeyInput, modelsState],
  )

  // 只有与当前地址匹配的列表才作为候选项展示，避免显示上一个服务商的模型
  const modelOptions =
    modelsState && modelsState.baseUrl === form.baseUrl.trim() ? modelsState.models : []

  const handleTest = useCallback(async (): Promise<void> => {
    setTesting(true)
    setStatus({ kind: 'info', text: '正在测试连接…' })
    const result = await aiClient.config.test(buildOverrides(form, apiKeyInput.trim()))
    if (isAiFailure(result)) {
      setStatus({ kind: 'error', text: `[${result.error.code}] ${result.error.message}` })
    } else {
      setStatus({
        kind: 'success',
        text: result.note
          ? `连接成功 · 模型 ${result.model} · 耗时 ${result.latencyMs}ms。${result.note}`
          : `连接成功 · 模型 ${result.model} · 耗时 ${result.latencyMs}ms · 回复「${result.reply}」`,
      })
    }
    setTesting(false)
  }, [form, apiKeyInput])

  const handleSave = useCallback(async (): Promise<void> => {
    setSaving(true)
    const result = await aiClient.config.set(buildOverrides(form, apiKeyInput.trim()))
    if (isAiFailure(result)) {
      setStatus({ kind: 'error', text: result.error.message })
    } else {
      applyView(result)
      // 保存后立刻丢弃输入框里的明文密钥
      setApiKeyInput('')
      setStatus({
        kind: 'success',
        text: result.configured
          ? '配置已保存，AI 能力已可用'
          : '配置已保存，但尚未完成（需填写接口地址、模型并勾选授权）',
      })
    }
    setSaving(false)
  }, [form, apiKeyInput, applyView])

  const handleClearKey = useCallback(async (): Promise<void> => {
    const result = await aiClient.config.set({ apiKey: '' })
    if (isAiFailure(result)) {
      setStatus({ kind: 'error', text: result.error.message })
    } else {
      applyView(result)
      setApiKeyInput('')
      setStatus({ kind: 'success', text: 'API Key 已清除' })
    }
  }, [applyView])

  const handleReset = useCallback(async (): Promise<void> => {
    if (!window.confirm('确定要清空全部 AI 配置吗？此操作不可撤销。')) return
    const result = await aiClient.config.clear()
    if (isAiFailure(result)) {
      setStatus({ kind: 'error', text: result.error.message })
    } else {
      applyView(result)
      setApiKeyInput('')
      setStatus({ kind: 'success', text: 'AI 配置已重置' })
    }
  }, [applyView])

  if (!view) {
    return (
      <div className="settings-section">
        <h3 className="settings-section-title">AI 能力</h3>
        <p className="ai-hint">{loadError ? loadError.message : '正在读取配置…'}</p>
      </div>
    )
  }

  return (
    <div className="settings-section">
      <h3 className="settings-section-title">AI 能力</h3>
      <p className="ai-hint">
        支持任何 OpenAI 兼容接口（DeepSeek、OpenAI、Moonshot、通义兼容模式、本地 Ollama 等）。
        请求由主进程代理发出，API Key 使用系统安全存储加密后保存在本机，不会写入笔记数据与导出备份。
      </p>

      {!view.configured && (
        <div className="ai-warn">
          {view.hasKey ? '配置尚未完成' : '尚未配置 API Key'}：AI 写作与编辑器 AI 操作在完成配置前不可用。
        </div>
      )}

      {view.hasKey && !view.encryptionAvailable && (
        <div className="ai-warn">
          当前系统不支持安全存储（safeStorage 不可用），API Key 仅本次运行有效，重启后需要重新填写。
        </div>
      )}

      <div className="ai-form">
        <div className="ai-field">
          <label className="ai-field-label" htmlFor="ai-provider-preset">
            服务商预设
          </label>
          <select
            id="ai-provider-preset"
            className="ai-select"
            value=""
            onChange={(e) => handleApplyPreset(e.target.value)}
          >
            <option value="">选择后自动填入接口地址</option>
            {PROVIDER_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ai-field">
          <label className="ai-field-label" htmlFor="ai-base-url">
            接口地址（baseUrl）
          </label>
          <input
            id="ai-base-url"
            className="ai-input"
            type="text"
            value={form.baseUrl}
            placeholder="https://api.deepseek.com"
            onChange={(e) => patchForm({ baseUrl: e.target.value })}
          />
          <span className="ai-hint">可省略末尾的 /v1，保存时自动补全；必须是 http:// 或 https:// 开头。</span>
        </div>

        <div className="ai-field">
          <label className="ai-field-label" htmlFor="ai-api-key">
            API Key
          </label>
          <div className="ai-key-row">
            <input
              id="ai-api-key"
              className="ai-input"
              type="password"
              value={apiKeyInput}
              autoComplete="off"
              placeholder={view.hasKey ? '已配置（留空表示不修改）' : '粘贴你的 API Key'}
              onChange={(e) => {
                setApiKeyInput(e.target.value)
                setStatus(null)
              }}
            />
            <button className="ai-btn secondary" onClick={handleClearKey} disabled={!view.hasKey} type="button">
              清除密钥
            </button>
          </div>
          <span className="ai-hint">
            Key 只会在保存/测试时经 IPC 传给主进程，不会回显、不会写入 localStorage 或笔记数据。
          </span>
        </div>

        <div className="ai-field">
          <label className="ai-field-label" htmlFor="ai-model">
            模型名称
          </label>
          <div className="ai-key-row">
            <input
              id="ai-model"
              className="ai-input"
              type="text"
              list="ai-model-options"
              value={form.model}
              placeholder="点击可从服务商拉取，或直接输入，如 deepseek-chat"
              onChange={(e) => patchForm({ model: e.target.value })}
              onFocus={() => void loadModels(false)}
            />
            <button
              className="ai-btn secondary"
              onClick={() => void loadModels(true)}
              disabled={modelsLoading}
              type="button"
            >
              {modelsLoading ? '获取中…' : '获取列表'}
            </button>
          </div>
          <datalist id="ai-model-options">
            {modelOptions.map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
          {modelsError ? (
            <span className="ai-hint is-warn">
              获取模型列表失败 [{modelsError.code}]：{modelsErrorHint(modelsError)}
              {modelsError.httpStatus ? `（HTTP ${modelsError.httpStatus}）` : ''}
              ，可直接手动输入模型名称
            </span>
          ) : modelOptions.length > 0 ? (
            <span className="ai-hint">
              已从该服务商获取 {modelOptions.length} 个当前提供的模型，输入时会自动匹配
            </span>
          ) : (
            <span className="ai-hint">
              点击输入框或「获取列表」可拉取该服务商当前提供的模型；部分服务商未开放此接口，此时手动输入即可
            </span>
          )}
        </div>

        <div className="ai-row">
          <div className="ai-field">
            <label className="ai-field-label" htmlFor="ai-temperature">
              temperature（0-2）
            </label>
            <input
              id="ai-temperature"
              className="ai-input"
              type="number"
              min={0}
              max={2}
              step={0.1}
              value={form.temperature}
              onChange={(e) => patchForm({ temperature: Number(e.target.value) })}
            />
          </div>
          <div className="ai-field">
            <label className="ai-field-label" htmlFor="ai-max-tokens">
              单次最大输出 token
            </label>
            <input
              id="ai-max-tokens"
              className="ai-input"
              type="number"
              min={1}
              max={32000}
              value={form.maxTokens}
              onChange={(e) => patchForm({ maxTokens: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="ai-row">
          <div className="ai-field">
            <label className="ai-field-label" htmlFor="ai-timeout">
              超时时间（毫秒）
            </label>
            <input
              id="ai-timeout"
              className="ai-input"
              type="number"
              min={1000}
              max={300000}
              step={1000}
              value={form.timeoutMs}
              onChange={(e) => patchForm({ timeoutMs: Number(e.target.value) })}
            />
          </div>
          <div className="ai-field">
            <label className="ai-field-label" htmlFor="ai-concurrency">
              同时进行中的请求上限
            </label>
            <input
              id="ai-concurrency"
              className="ai-input"
              type="number"
              min={1}
              max={8}
              value={form.concurrency}
              onChange={(e) => patchForm({ concurrency: Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="ai-field">
          <label className="ai-field-label" htmlFor="ai-max-input-tokens">
            单次输入 token 上限
          </label>
          <input
            id="ai-max-input-tokens"
            className="ai-input"
            type="number"
            min={500}
            max={128000}
            step={500}
            value={form.maxInputTokens}
            onChange={(e) => patchForm({ maxInputTokens: Number(e.target.value) })}
          />
          <span className="ai-hint">超限的请求会被本地拦截，不会发往服务商。</span>
        </div>

        <div className="ai-field">
          <label className="ai-field-label" htmlFor="ai-max-tokens-param">
            输出长度参数名（兼容性）
          </label>
          <select
            id="ai-max-tokens-param"
            className="ai-select"
            value={form.maxTokensParam}
            onChange={(e) => patchForm({ maxTokensParam: e.target.value as MaxTokensParam })}
          >
            <option value="max_tokens">max_tokens（多数服务商）</option>
            <option value="max_completion_tokens">max_completion_tokens（OpenAI o 系列）</option>
          </select>
        </div>

        <label className="ai-toggle-row">
          <input type="checkbox" checked={form.stream} onChange={(e) => patchForm({ stream: e.target.checked })} />
          <span>
            <strong>流式输出</strong>
            <span className="ai-hint">边生成边显示（打字机效果），长文体验更好</span>
          </span>
        </label>

        <label className="ai-toggle-row">
          <input
            type="checkbox"
            checked={form.disableStreamOptions}
            onChange={(e) => patchForm({ disableStreamOptions: e.target.checked })}
          />
          <span>
            <strong>禁用 stream_options</strong>
            <span className="ai-hint">
              部分网关不接受该字段导致 400 时勾选；主进程遇到 400 也会自动降级重试一次
            </span>
          </span>
        </label>

        <label className="ai-toggle-row">
          <input
            type="checkbox"
            checked={form.cacheEnabled}
            onChange={(e) => patchForm({ cacheEnabled: e.target.checked })}
          />
          <span>
            <strong>启用请求缓存</strong>
            <span className="ai-hint">相同内容 10 分钟内命中缓存，直接返回不消耗配额</span>
          </span>
        </label>

        <label className="ai-toggle-row ai-consent">
          <input type="checkbox" checked={form.consent} onChange={(e) => patchForm({ consent: e.target.checked })} />
          <span>
            <strong>我已知悉：选中的笔记内容会发送到我配置的 AI 服务</strong>
            <span className="ai-hint">
              编辑器 AI 操作会把选中的文本发往你填写的第三方接口。未勾选时所有 AI 功能保持关闭。
            </span>
          </span>
        </label>

        <div className="ai-actions">
          <button className="ai-btn secondary" onClick={handleTest} disabled={testing || saving} type="button">
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button className="ai-btn primary" onClick={handleSave} disabled={saving || testing} type="button">
            {saving ? '保存中…' : '保存配置'}
          </button>
          <button className="ai-btn danger" onClick={handleReset} disabled={saving || testing} type="button">
            重置
          </button>
        </div>

        {status && <div className={`ai-status is-${status.kind}`}>{status.text}</div>}

        <div className="ai-meta">
          <span className={`ai-badge ${view.configured ? 'is-ok' : ''}`}>
            {view.configured ? '已配置' : '未完成配置'}
          </span>
          <span className={`ai-badge ${view.encryptionAvailable ? 'is-ok' : 'is-warn'}`}>
            {view.encryptionAvailable ? '安全存储可用' : '安全存储不可用'}
          </span>
          <span className="ai-hint">接口地址与模型保存在本机 ai-config.json，密钥单独加密存储。</span>
        </div>
      </div>
    </div>
  )
}