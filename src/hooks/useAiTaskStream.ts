/**
 * 通用 AI 任务流式状态机（文本生成 / 内容优化 / 风格转换共用）。
 *
 * 关键约束：
 * - 流式文本只进本 hook 的局部 state，绝不写进 useNotesStore：updateDoc 每次变更都会写
 *   auto 版本快照（30s 合并、上限 50）并触发全应用重渲染，逐 chunk 落库会瞬间打满版本上限、
 *   冲掉历史并污染撤销栈。回写由调用方在完成后一次性执行。
 * - 用 generation 计数器做身份校验：取消/重新发起后，旧流的回调不得再影响新状态。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { AiError, AiStreamHandle } from '@/types/ai'
import { aiClient } from '@/services/ai/aiClient'
import type { AiTaskSpec } from '@/services/ai/aiClient'

export type AiTaskStatus = 'idle' | 'streaming' | 'done' | 'error'

export interface AiTaskStreamResult {
  status: AiTaskStatus
  /** 流式过程中为增量累积，完成后为归一化全文 */
  text: string
  title: string
  error: AiError | null
  model: string
  cached: boolean
  /** 已耗时（毫秒），流式过程中每 200ms 刷新一次 */
  elapsedMs: number
  isStreaming: boolean
  run: (task: AiTaskSpec) => void
  stop: () => void
  reset: () => void
}

export function useAiTaskStream(): AiTaskStreamResult {
  const [status, setStatus] = useState<AiTaskStatus>('idle')
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [error, setError] = useState<AiError | null>(null)
  const [model, setModel] = useState('')
  const [cached, setCached] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)

  const handleRef = useRef<AiStreamHandle | null>(null)
  const generationRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)

  const clearTimer = useCallback((): void => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const stop = useCallback((): void => {
    // 先让 generation 失效，再取消，保证后续回调被忽略
    generationRef.current += 1
    clearTimer()
    const handle = handleRef.current
    handleRef.current = null
    handle?.cancel()
    setStatus((prev) => (prev === 'streaming' ? 'idle' : prev))
  }, [clearTimer])

  const run = useCallback(
    (task: AiTaskSpec): void => {
      generationRef.current += 1
      const generation = generationRef.current
      const isCurrent = (): boolean => generationRef.current === generation

      clearTimer()
      handleRef.current?.cancel()
      handleRef.current = null

      setStatus('streaming')
      setText('')
      setTitle('')
      setError(null)
      setCached(false)
      setElapsedMs(0)
      startedAtRef.current = Date.now()
      timerRef.current = window.setInterval(() => {
        if (isCurrent()) setElapsedMs(Date.now() - startedAtRef.current)
      }, 200)

      const handle = aiClient.stream(task, {
        onMeta: (meta) => {
          if (!isCurrent()) return
          setModel(meta.model)
          setCached(meta.cached)
        },
        onDelta: (delta) => {
          if (!isCurrent()) return
          setText((prev) => prev + delta)
        },
        onDone: (result) => {
          if (!isCurrent()) return
          clearTimer()
          setText(result.text)
          setTitle(result.title ?? '')
          setModel(result.model)
          setCached(result.cached)
          setElapsedMs(result.latencyMs)
          setStatus('done')
        },
        onError: (err) => {
          if (!isCurrent()) return
          clearTimer()
          setError(err)
          setStatus('error')
        },
      })

      handleRef.current = handle
      void handle.done.finally(() => {
        if (generationRef.current === generation) handleRef.current = null
      })
    },
    [clearTimer],
  )

  const reset = useCallback((): void => {
    generationRef.current += 1
    clearTimer()
    const handle = handleRef.current
    handleRef.current = null
    handle?.cancel()
    setStatus('idle')
    setText('')
    setTitle('')
    setError(null)
    setModel('')
    setCached(false)
    setElapsedMs(0)
  }, [clearTimer])

  // 卸载兜底：组件消失后不得再 setState
  useEffect(
    () => () => {
      generationRef.current += 1
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current)
        timerRef.current = null
      }
      const handle = handleRef.current
      handleRef.current = null
      handle?.cancel()
    },
    [],
  )

  return {
    status,
    text,
    title,
    error,
    model,
    cached,
    elapsedMs,
    isStreaming: status === 'streaming',
    run,
    stop,
    reset,
  }
}