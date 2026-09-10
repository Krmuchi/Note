// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFunction = (...args: any[]) => void

export interface DebouncedFunction<T extends AnyFunction> {
  (...args: Parameters<T>): void
  /** 取消尚未执行的调用 */
  cancel: () => void
  /** 立即执行挂起的调用并清空 */
  flush: () => void
}

export function debounce<T extends AnyFunction>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  // 用对象包装挂起调用（thisArg + args），避免 this 别名触发 lint 规则
  const pending: { thisArg: unknown; args: Parameters<T> } = {
    thisArg: undefined,
    args: [] as unknown as Parameters<T>,
  }
  let hasPending = false

  const invoke = (): void => {
    if (hasPending) {
      func.apply(pending.thisArg, pending.args)
      hasPending = false
    }
  }

  const debounced = function (this: unknown, ...args: Parameters<T>): void {
    pending.thisArg = this
    pending.args = args
    hasPending = true
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    timeoutId = setTimeout(() => {
      timeoutId = null
      invoke()
    }, wait)
  } as DebouncedFunction<T>

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    hasPending = false
  }

  debounced.flush = () => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutId = null
    }
    invoke()
  }

  return debounced
}
