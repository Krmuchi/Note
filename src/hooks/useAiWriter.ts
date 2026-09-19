/**
 * AI 写作助手状态机。
 *
 * 关键约束（踩过才知道）：
 * - AiWriter 由 isOpen 控制显隐、**常驻挂载**，关闭时组件不卸载。因此必须在 isOpen
 *   变化时主动取消在途流，否则弹窗关了后台还在跑、还在 setState。
 * - 流式文本只进本 hook 的局部 state，绝不写进 useNotesStore：updateDoc 每次变更都会写
 *   auto 版本快照（30s 合并、上限 50）并触发全应用重渲染，逐 chunk 落库会瞬间打满版本
 *   上限、冲掉历史并污染撤销栈。回写由调用方在完成后一次性执行。
 * - 用 generation 计数器做身份校验：取消/重新生成后，旧流的回调不得再影响新状态。
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import type { AiError, AiStreamHandle, GenerateInput } from '@/types/ai'
import { aiClient } from '@/services/ai/aiClient'

export type AiWriterStatus = 'idle' | 'streaming' | 'done' | 'error'

export interface UseAiWriterResult {
  status: AiWriterStatus
  /** 流式过程中为增量累积，完成后为归一化全文 */
  text: string
  title: string
  error: AiError | null
  model: string
  cached: boolean
  /** 已耗时（毫秒），流式过程中每 200ms 刷新一次 */
  elapsedMs: number
  isStreaming: boolean
  generate: (input: GenerateInput) => void
  cancel: () => void
  reset: () => void
}

export function useAiWriter(isOpen: boolean): UseAiWriterResult {
  const [status, setStatus] = useState<AiWriterStatus>('idle')
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

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    // 先让 generation 失效，再取消，保证后续回调被忽略
    generationRef.current += 1
    stopTimer()
    const handle = handleRef.current
    handleRef.current = null
    handle?.cancel()
    setStatus((prev) => (prev === 'streaming' ? 'idle' : prev))
  }, [stopTimer])

  const generate = useCallback(
    (input: GenerateInput) => {
      generationRef.current += 1
      const generation = generationRef.current
      const isCurrent = (): boolean => generationRef.current === generation

      stopTimer()
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

      const handle = aiClient.stream(
        { capability: 'generate', ...input },
        {
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
            stopTimer()
            setText(result.text)
            setTitle(result.title ?? '')
            setModel(result.model)
            setCached(result.cached)
            setElapsedMs(result.latencyMs)
            setStatus('done')
          },
          onError: (err) => {
            if (!isCurrent()) return
            stopTimer()
            setError(err)
            setStatus('error')
          },
        },
      )

      handleRef.current = handle
      void handle.done.finally(() => {
        if (generationRef.current === generation) handleRef.current = null
      })
    },
    [stopTimer],
  )

  const reset = useCallback(() => {
    generationRef.current += 1
    stopTimer()
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
  }, [stopTimer])

  // 弹窗关闭时组件并不卸载，必须在这里取消在途流
  useEffect(() => {
    if (isOpen) return
    cancel()
  }, [isOpen, cancel])

  // 真正卸载时兜底清理
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
    generate,
    cancel,
    reset,
  }
}