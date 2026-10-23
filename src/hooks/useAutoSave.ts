import { useRef, useCallback, useEffect } from 'react'
import { useNotesStore } from '@/store'
import { toast } from '@/components/common/Toast'

function scheduleIdleCallback(callback: () => void, timeout: number = 5000): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(callback, { timeout })
  } else {
    setTimeout(callback, 0)
  }
}

const MAX_RETRY = 3

/**
 * 自动保存。
 *
 * 关键点：**不在渲染期订阅 lastMutationAt**。
 * 该值每次击键都会变，用 `useNotesStore(s => s.lastMutationAt)` 订阅会让调用方
 * （App 外壳）在每次输入时重渲染 —— 而保存逻辑本身与渲染完全无关。
 * 改为在 effect 里 `store.subscribe` 只做副作用，输入链路上的组件不再被拖下水。
 */
export const useAutoSave = (debounceMs: number = 3000): { scheduleSave: () => void } => {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveInProgressRef = useRef(false)
  const retryCountRef = useRef(0)
  // 始终持有最新的 scheduleSave，供保存完成后补保存时调用（初始化为字面量，避免 immutability 规则）
  const scheduleSaveRef = useRef<() => void>(() => {})

  // 卸载时清理未执行的防抖定时器，避免组件销毁后仍触发保存
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [])

  const scheduleSave = useCallback(() => {
    if (saveInProgressRef.current) {
      // 保存进行中：本次变更会在保存完成后由下方 finally 检查自动补一次保存，避免丢失
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      // 数据加载失败时 saveNotes 会拒绝落盘（保护磁盘数据），此处直接跳过，避免无谓重试
      if (useNotesStore.getState().loadFailed) return
      saveInProgressRef.current = true
      // 记录开始保存时的变更戳，用于判断保存期间是否产生了新变更
      const startMutationAt = useNotesStore.getState().lastMutationAt

      const handleSave = async (): Promise<void> => {
        // saveNotes 内部会吞掉异常并置 saveStatus（catch 分支不可达），需读取状态判断成败
        let shouldRetry = false
        try {
          await useNotesStore.getState().saveNotes()
          const status = useNotesStore.getState().saveStatus
          if (status === 'error') {
            retryCountRef.current += 1
            if (retryCountRef.current <= MAX_RETRY) {
              shouldRetry = true
            } else {
              // 重试耗尽仍失败：明确告知用户，避免静默丢数据
              toast.error('笔记保存失败，请检查磁盘空间或数据文件是否被占用')
            }
          } else {
            retryCountRef.current = 0
          }
        } finally {
          saveInProgressRef.current = false
          // 保存期间产生的新变更或需要重试：统一走防抖通道补一次保存，
          // 避免裸 setTimeout 重试与补保存两路并发执行
          const current = useNotesStore.getState().lastMutationAt
          if (shouldRetry || current !== startMutationAt) {
            scheduleSaveRef.current()
          }
        }
      }

      scheduleIdleCallback(handleSave, 5000)
    }, debounceMs)
  }, [debounceMs])

  // 同步最新 scheduleSave 到 ref（初始化为字面量，规避 immutability 规则）
  useEffect(() => {
    scheduleSaveRef.current = scheduleSave
  }, [scheduleSave])

  // 变更戳变化时触发保存（已被 debounce 保护）。
  // 走 store.subscribe 而不是 hook 订阅：保存是副作用，不该让外壳组件跟着重渲染。
  useEffect(() => {
    let lastSeen = useNotesStore.getState().lastMutationAt
    const unsubscribe = useNotesStore.subscribe((state) => {
      const next = state.lastMutationAt
      if (next === lastSeen) return
      lastSeen = next
      if (next === 0) return
      scheduleSave()
    })
    return unsubscribe
  }, [scheduleSave])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (saveInProgressRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  return { scheduleSave }
}
