/**
 * 编辑器选区 AI 操作：捕获选区快照、定位浮层、回写结果。
 *
 * 与插入链接（handleOpenLinkDialog / handleLinkConfirm）采用同一套选区处理约定：
 * - 打开时快照 {start, end, text}，因为浮层会夺焦、textarea 的实时选区不再可靠；
 * - 回写前校验 `content.substring(start, end) === text`，失配时退化为当前光标处插入
 *   （弹窗期间内容可能被草稿恢复等流程改写）；
 * - textarea 是「挂载即销毁」节点，因此每次操作都即时从 textareaRef.current 读取，
 *   绝不跨操作缓存 DOM 节点引用。
 */

import { useCallback, useState } from 'react'
import type { RefObject } from 'react'

import type { NoteDoc } from '@/types'
import { getCaretPixelPosition } from '@/utils/editorTextOps'
import { toast } from '@/components/common/Toast'

export interface AiSelectionSnapshot {
  start: number
  end: number
  text: string
}

/** 快照附带捕获时的上下文；上下文变了就视为失效，避免把结果写到错误的位置 */
interface CaptureSnapshot extends AiSelectionSnapshot {
  docId?: string
  enabled: boolean
}

export interface AiSelectionAction {
  position: { top: number; left: number } | null
  selection: AiSelectionSnapshot | null
  /** 捕获当前选区并打开浮层；未选中文本时提示并返回 false */
  open: () => boolean
  close: () => void
  /** 用 AI 结果替换选中文本（走 updateDocContent，保留撤销与版本快照） */
  apply: (replacement: string) => void
}

export function useAiSelectionAction(options: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  updateDocContent: (changes: Partial<NoteDoc>) => void
  activeDocId?: string
  /** 编辑器不可见（纯预览/分屏切换到预览）时禁止打开 */
  enabled: boolean
}): AiSelectionAction {
  const { textareaRef, updateDocContent, activeDocId, enabled } = options
  const [snapshot, setSnapshot] = useState<CaptureSnapshot | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  const close = useCallback((): void => {
    setSnapshot(null)
    setAnchor(null)
  }, [])

  const open = useCallback((): boolean => {
    const textarea = textareaRef.current
    if (!textarea) return false
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const raw = textarea.value.substring(start, end)
    if (start === end || !raw.trim()) {
      toast.warning('请先选中要处理的文本')
      return false
    }
    setSnapshot({ start, end, text: raw, docId: activeDocId, enabled })
    setAnchor(getCaretPixelPosition(textarea, end))
    return true
  }, [textareaRef, activeDocId, enabled])

  const apply = useCallback(
    (replacement: string): void => {
      const captured = snapshot
      const content = replacement.trim()
      if (!captured || !content) return

      const textarea = textareaRef.current
      if (!textarea) {
        close()
        return
      }
      const value = textarea.value
      let { start, end } = captured
      if (value.substring(start, end) !== captured.text) {
        // 选区失配：退化为当前光标处插入，避免把内容写到错误位置
        start = textarea.selectionStart
        end = textarea.selectionEnd
      }

      updateDocContent({ content: value.substring(0, start) + content + value.substring(end) })
      close()

      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        el.selectionStart = el.selectionEnd = start + content.length
      })
    },
    [snapshot, textareaRef, updateDocContent, close],
  )

  // 切换文档或编辑器变为不可见时快照失效：渲染期直接判定，不用 effect 同步 state
  const stale = snapshot !== null && (snapshot.docId !== activeDocId || snapshot.enabled !== enabled)

  return {
    position: stale ? null : anchor,
    selection: stale ? null : snapshot,
    open,
    close,
    apply,
  }
}