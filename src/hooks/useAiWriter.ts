/**
 * AI 写作助手状态机（基于通用流式状态机，附加「弹窗关闭即取消」语义）。
 *
 * AiWriter 由 isOpen 控制显隐、**常驻挂载**，关闭时组件并不卸载，
 * 因此必须在 isOpen 变化时主动取消在途流，否则弹窗关了后台还在跑、还在 setState。
 */

import { useCallback, useEffect } from 'react'

import type { GenerateInput } from '@/types/ai'
import { useAiTaskStream } from './useAiTaskStream'
import type { AiTaskStatus } from './useAiTaskStream'
import type { AiError } from '@/types/ai'

export interface UseAiWriterResult {
  status: AiTaskStatus
  text: string
  title: string
  error: AiError | null
  model: string
  cached: boolean
  elapsedMs: number
  isStreaming: boolean
  generate: (input: GenerateInput) => void
  cancel: () => void
  reset: () => void
}

export function useAiWriter(isOpen: boolean): UseAiWriterResult {
  const {
    status,
    text,
    title,
    error,
    model,
    cached,
    elapsedMs,
    isStreaming,
    run,
    stop,
    reset,
  } = useAiTaskStream()

  useEffect(() => {
    if (isOpen) return
    stop()
  }, [isOpen, stop])

  const generate = useCallback(
    (input: GenerateInput): void => {
      run({ capability: 'generate', ...input })
    },
    [run],
  )

  return {
    status,
    text,
    title,
    error,
    model,
    cached,
    elapsedMs,
    isStreaming,
    generate,
    cancel: stop,
    reset,
  }
}