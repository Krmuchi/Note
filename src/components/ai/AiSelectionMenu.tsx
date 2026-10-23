/**
 * 编辑器选区 AI 浮层：先选动作（润色/改写/扩写/总结/风格转换），再流式预览结果，
 * 用户确认后才替换选中文本。
 *
 * 流式文本只存在于本组件内部 state —— 浮层挂在 Editor 之外，预览过程不会引发编辑器区重渲染。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'

import type { OptimizeAction, WritingStyle } from '@/types/ai'
import { INSTRUCTIONS_MAX_LENGTH, OPTIMIZE_ACTIONS, WRITING_STYLES, shouldOfferRetry } from '@/services/ai'
import { useAiTaskStream } from '@/hooks/useAiTaskStream'
import type { AiTaskSpec } from '@/services/ai/aiClient'
import { IconSparkle } from '@/components/common/Icon'

interface AiSelectionMenuProps {
  selection: { start: number; end: number; text: string }
  position: { top: number; left: number }
  onApply: (replacement: string) => void
  onClose: () => void
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

export default function AiSelectionMenu({ selection, position, onApply, onClose }: AiSelectionMenuProps): JSX.Element {
  const [showStyles, setShowStyles] = useState(false)
  const [lastTask, setLastTask] = useState<AiTaskSpec | null>(null)
  /** 附加要求：折叠态默认收起，避免浮层默认过高遮挡正文 */
  const [showInstructions, setShowInstructions] = useState(false)
  const [instructions, setInstructions] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const instructionsRef = useRef<HTMLTextAreaElement>(null)

  const { status, text, error, model, cached, elapsedMs, isStreaming, run, stop, reset } = useAiTaskStream()

  // 浮层关闭（卸载）即放弃结果，必须中断在途流，避免后台继续消耗配额
  useEffect(() => () => stop(), [stop])

  // 展开后直接聚焦，省去一次点击（用户点开就是为了输入）
  useEffect(() => {
    if (showInstructions) instructionsRef.current?.focus()
  }, [showInstructions])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    const handleMouseDown = (event: MouseEvent): void => {
      const target = event.target as Node | null
      if (panelRef.current && target && panelRef.current.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [onClose])

  const start = useCallback(
    (task: AiTaskSpec): void => {
      setLastTask(task)
      run(task)
    },
    [run],
  )

  const handleRetry = useCallback((): void => {
    if (lastTask) run(lastTask)
  }, [lastTask, run])

  const canRetry = lastTask !== null && (status === 'done' || (status === 'error' && !!error && shouldOfferRetry(error)))
  const showResult = status !== 'idle'
  /** 空串视为未填写：不下发该字段，避免污染请求与去重 key */
  const trimmedInstructions = instructions.trim() || undefined

  return (
    <div
      className="ai-selection-menu"
      style={{ top: position.top, left: position.left }}
      ref={panelRef}
      role="dialog"
      aria-label="AI 文本处理"
    >
      <div className="ai-selection-header">
        <span className="ai-selection-title"><IconSparkle size={15} /> AI 处理选中文本</span>
        <button className="ai-selection-close" onClick={onClose} title="关闭" type="button">
          ✕
        </button>
      </div>

      <div className="ai-selection-origin">已选中 {selection.text.length} 字符</div>

      {!showResult && (
        <div className="ai-selection-instructions">
          <button
            type="button"
            className="ai-selection-instructions-toggle"
            onClick={() => setShowInstructions((prev) => !prev)}
            aria-expanded={showInstructions}
          >
            <span>附加要求</span>
            <span className="ai-selection-instructions-state">
              {trimmedInstructions ? '已填写' : '可选'}
            </span>
            <span className="ai-selection-instructions-arrow" aria-hidden="true">
              {showInstructions ? '▲' : '▼'}
            </span>
          </button>
          {showInstructions && (
            <>
              <textarea
                ref={instructionsRef}
                className="ai-selection-instructions-input"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={'补充要求，例如：\n- 保留专业术语不要替换\n- 控制在 200 字以内'}
                rows={3}
                maxLength={INSTRUCTIONS_MAX_LENGTH}
                aria-label="附加要求"
              />
              <div className="ai-selection-instructions-counter">
                {instructions.length} / {INSTRUCTIONS_MAX_LENGTH}
              </div>
            </>
          )}
        </div>
      )}

      {!showResult && !showStyles && (
        <div className="ai-selection-actions">
          {OPTIMIZE_ACTIONS.map((option) => (
            <button
              key={option.value}
              className="ai-selection-action"
              title={option.description}
              type="button"
              onClick={() =>
                start({
                  capability: 'optimize',
                  action: option.value as OptimizeAction,
                  text: selection.text,
                  instructions: trimmedInstructions,
                })
              }
            >
              <span className="ai-selection-action-icon">{option.icon}</span>
              <span className="ai-selection-action-label">{option.label}</span>
            </button>
          ))}
          <button
            className="ai-selection-action"
            title="把这段文字改写成另一种风格"
            type="button"
            onClick={() => setShowStyles(true)}
          >
            <span className="ai-selection-action-icon"><IconSparkle size={15} /></span>
            <span className="ai-selection-action-label">风格转换</span>
          </button>
        </div>
      )}

      {!showResult && showStyles && (
        <div className="ai-selection-actions">
          {WRITING_STYLES.map((option) => (
            <button
              key={option.value}
              className="ai-selection-action"
              title={option.description}
              type="button"
              onClick={() =>
                start({
                  capability: 'transform',
                  text: selection.text,
                  targetStyle: option.value as WritingStyle,
                  instructions: trimmedInstructions,
                })
              }
            >
              <span className="ai-selection-action-icon">{option.icon}</span>
              <span className="ai-selection-action-label">{option.label}</span>
            </button>
          ))}
          <button className="ai-selection-action" type="button" onClick={() => setShowStyles(false)}>
            <span className="ai-selection-action-icon">←</span>
            <span className="ai-selection-action-label">返回</span>
          </button>
        </div>
      )}

      {showResult && (
        <>
          {status === 'error' && error && (
            <div className="ai-error-bar">
              <span className="ai-error-code">{error.code}</span>
              <span className="ai-error-text">{error.message}</span>
            </div>
          )}

          <div className="ai-selection-preview">
            {text ? (
              <pre className="ai-selection-preview-text">
                {text}
                {isStreaming && <span className="ai-stream-cursor" />}
              </pre>
            ) : (
              <span className="ai-selection-placeholder">
                {isStreaming ? '正在生成…' : '没有生成内容'}
              </span>
            )}
          </div>

          <div className="ai-result-meta">
            {isStreaming && <span className="ai-meta-item">已用时 {formatSeconds(elapsedMs)}</span>}
            {model && <span className="ai-meta-item">模型 {model}</span>}
            {status === 'done' && <span className="ai-meta-item">耗时 {formatSeconds(elapsedMs)}</span>}
            {cached && <span className="ai-meta-item is-cache">来自缓存</span>}
          </div>

          <div className="ai-selection-footer">
            {isStreaming ? (
              <button className="ai-selection-btn secondary" onClick={stop} type="button">
                ⏹ 停止
              </button>
            ) : (
              <>
                <button className="ai-selection-btn secondary" onClick={reset} type="button">
                  返回
                </button>
                {canRetry && (
                  <button className="ai-selection-btn secondary" onClick={handleRetry} type="button">
                    重试
                  </button>
                )}
                {status === 'done' && (
                  <button className="ai-selection-btn primary" onClick={() => onApply(text)} type="button">
                    ✓ 替换选中文本
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}