/**
 * AI 写作助手状态机（基于通用流式状态机，附加「弹窗关闭即取消」语义）。
 *
 * AiWriter 由 isOpen 控制显隐、**常驻挂载**，关闭时组件并不卸载，
 * 因此必须在 isOpen 变化时主动取消在途流，否则弹窗关了后台还在跑、还在 setState。
 */

import { useCallback, useEffect, useRef } from 'react'
import { notify } from '@/services/storage'

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

  /*
   * P1-9：生成完成 / 失败时发一条系统通知。
   *
   * 面板是浮层，用户常在等待期间切走窗口 —— 没有通知就只能回来干等。
   * 通知是否真的弹出由主进程按「后台通知」设置判定（notifyWhenBackground），
   * 渲染层只负责发起。用 statusRef 只在状态**跃迁**时发一次，
   * 否则流式期间每次 text 变化都会重复触发。
   */
  const lastStatusRef = useRef<AiTaskStatus>('idle')
  useEffect(() => {
    const prev = lastStatusRef.current
    lastStatusRef.current = status
    if (status === prev) return
    if (status === 'done') {
      const preview = text.trim() ? text.trim().replace(/\s+/g, ' ').slice(0, 60) : ''
      void notify({ title: 'AI 生成完成', body: title ? `${title}：${preview}` : preview })
    } else if (status === 'error') {
      void notify({ title: 'AI 生成失败', body: error?.message || '请重试，或检查 AI 设置' })
    }
  }, [status, title, text, error])

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