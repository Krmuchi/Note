import { toast } from '@/services/toast'

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 回退到兼容方案
  }

  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

/**
 * 复制并按真实结果统一反馈（「复制假成功」修复）。
 *
 * 背景：4 处调用 copyToClipboard 后不判断返回值就无条件 toast.success ——
 * 复制失败时（非安全上下文且 execCommand 不可用）用户收到"已复制"的假成功提示，
 * 剪贴板里其实什么都没有。成功/失败提示统一在这里给出，调用点只提供成功文案：
 * 成功 → success toast（successMsg），失败 → error toast（中文说明）。
 *
 * @param successMsg 成功提示，默认「已复制到剪贴板」
 * @returns 是否复制成功（与 copyToClipboard 一致）
 */
export async function copyWithFeedback(text: string, successMsg = '已复制到剪贴板'): Promise<boolean> {
  const ok = await copyToClipboard(text)
  if (ok) {
    toast.success(successMsg)
  } else {
    toast.error('复制失败，请手动选择内容后复制')
  }
  return ok
}
