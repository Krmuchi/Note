import { useCallback, useRef, useState } from 'react'
import { hideToast, showToast } from '@/services/toast'

export interface AsyncActionOptions {
  /** 操作进行中的提示（结束时自动消失），用于菜单触发等无固定按钮的长操作 */
  pendingMsg?: string
  successMsg?: string
  errorMsg?: string
}

/**
 * 长操作统一忙碌态：
 * - `loading` 供按钮/触发器渲染忙碌样式（ButtonLoader 等）
 * - `pendingMsg` 弹出"进行中"提示并在结束时关闭，保证操作全程有可见反馈
 * - 结束后的成功/失败提示：调用方自身已带提示的（如 editorHeaderExports）不传 successMsg/errorMsg 即可，避免重复弹
 */
export function useAsyncAction(): {
  run: <T>(fn: () => Promise<T>, options?: AsyncActionOptions) => Promise<T | undefined>
  loading: boolean
} {
  const [loading, setLoading] = useState(false)
  const runningRef = useRef(false)

  const run = useCallback(async <T,>(
    fn: () => Promise<T>,
    options?: AsyncActionOptions,
  ): Promise<T | undefined> => {
    // 同一 hook 实例内不并发执行，避免连点触发重复导入/导出
    if (runningRef.current) return undefined
    runningRef.current = true
    setLoading(true)

    const pendingId = options?.pendingMsg
      ? showToast({ type: 'info', message: options.pendingMsg, duration: 600000 })
      : ''

    try {
      const result = await fn()
      hideToast(pendingId)
      if (options?.successMsg) showToast({ type: 'success', message: options.successMsg })
      return result
    } catch (err) {
      hideToast(pendingId)
      console.error('异步操作失败:', err)
      showToast({
        type: 'error',
        message: options?.errorMsg ?? (err instanceof Error ? err.message : '操作失败'),
      })
      return undefined
    } finally {
      runningRef.current = false
      setLoading(false)
    }
  }, [])

  return { run, loading }
}
