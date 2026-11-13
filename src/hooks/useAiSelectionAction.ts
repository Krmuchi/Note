/**
 * 编辑器选区 AI 操作：捕获选区快照、定位浮层、回写结果。
 *
 * 与插入链接（handleOpenLinkDialog / handleLinkConfirm）采用同一套选区处理约定：
 * - 打开时快照 {start, end, text}，因为浮层会夺焦、实时选区不再可靠；
 * - 回写前校验 `content.substring(start, end) === text`，失配时退化为当前选区/光标处插入
 *   （弹窗期间内容可能被草稿恢复等流程改写）；
 * - textarea 是「挂载即销毁」节点，因此每次操作都即时从 ref 读取，绝不跨操作缓存 DOM 引用。
 *
 * 双内核：旧 textarea 内核读 selectionStart/End；富文本内核（默认开启）经
 * richEditorRef 端口读 Markdown 偏移。两个分支都必须存在 —— 只写 textarea 分支时，
 * 默认内核下整个划词 AI 会静默失效（按钮点了没反应，连提示都没有）。
 * 端口用结构化类型声明而不是 import RichEditorHandle：分层契约禁止 hooks 依赖 components。
 */

import { useCallback, useState } from 'react'
import type { RefObject } from 'react'

import type { NoteDoc } from '@/types'
import { getCaretPixelPosition } from '@/utils/editorTextOps'
import { toast } from '@/services/toast'

/** 富文本内核的选区端口（RichEditorHandle 的结构子集，由 Editor 注入） */
export interface RichSelectionPort {
  /** Markdown 源码偏移意义的选区；无选区/不可用时返回 null */
  getSelectionRange: () => { start: number; end: number } | null
  /** 按 Markdown 偏移恢复选区（回写后重建 DOM 再调用） */
  selectRange: (start: number, end: number) => boolean
  focus: () => void
}

export interface AiSelectionSnapshot {
  start: number
  end: number
  text: string
}

/** 快照附带捕获时的上下文；上下文变了就视为失效，避免把结果写到错误的位置 */
interface CaptureSnapshot extends AiSelectionSnapshot {
  docId?: string
  enabled: boolean
  kernel: 'textarea' | 'rich'
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

/** 浮层尺寸（与 ai-writer.css 的 .ai-selection-menu 一致），用于视口收敛 */
const MENU_WIDTH = 320
const MENU_HEIGHT_ESTIMATE = 260

/** 富文本选区的屏幕坐标：取当前 DOM 选区矩形，浮层放在选区下方（溢出时收敛） */
function richSelectionAnchor(): { top: number; left: number } {
  const selection = typeof window !== 'undefined' ? window.getSelection() : null
  if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
    const rect = selection.getRangeAt(0).getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) {
      return {
        top: Math.min(rect.bottom + 8, Math.max(8, window.innerHeight - MENU_HEIGHT_ESTIMATE)),
        left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - MENU_WIDTH - 8)),
      }
    }
  }
  // 拿不到 DOM 矩形（极端时序）：给一个视口内的安全位置，功能不因此失效
  return { top: 96, left: Math.max(8, window.innerWidth - MENU_WIDTH - 24) }
}

export function useAiSelectionAction(options: {
  textareaRef: RefObject<HTMLTextAreaElement | null>
  /** 富文本内核端口；默认内核下 textareaRef 为 null，必须走这里 */
  richEditorRef?: RefObject<RichSelectionPort | null>
  /** 富文本内核的当前文档 Markdown 源码（getter：每次操作即时读取，不缓存） */
  getRichContent?: () => string
  updateDocContent: (changes: Partial<NoteDoc>) => void
  activeDocId?: string
  /** 编辑器不可见（纯预览/分屏切换到预览）时禁止打开 */
  enabled: boolean
}): AiSelectionAction {
  const { textareaRef, richEditorRef, getRichContent, updateDocContent, activeDocId, enabled } = options
  const [snapshot, setSnapshot] = useState<CaptureSnapshot | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null)

  const close = useCallback((): void => {
    setSnapshot(null)
    setAnchor(null)
  }, [])

  const open = useCallback((): boolean => {
    const textarea = textareaRef.current
    if (textarea) {
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const raw = textarea.value.substring(start, end)
      if (start === end || !raw.trim()) {
        toast.warning('请先选中要处理的文本')
        return false
      }
      setSnapshot({ start, end, text: raw, docId: activeDocId, enabled, kernel: 'textarea' })
      setAnchor(getCaretPixelPosition(textarea, end))
      return true
    }

    const rich = richEditorRef?.current
    if (rich) {
      const range = rich.getSelectionRange()
      const content = getRichContent?.() ?? ''
      if (!range || range.start === range.end) {
        toast.warning('请先选中要处理的文本')
        return false
      }
      const raw = content.substring(range.start, range.end)
      if (!raw.trim()) {
        toast.warning('请先选中要处理的文本')
        return false
      }
      setSnapshot({ start: range.start, end: range.end, text: raw, docId: activeDocId, enabled, kernel: 'rich' })
      setAnchor(richSelectionAnchor())
      return true
    }

    // 两个内核都不可用（编辑器未挂载/纯预览）：明确提示而不是静默无反应
    toast.warning('请先选中要处理的文本')
    return false
  }, [textareaRef, richEditorRef, getRichContent, activeDocId, enabled])

  const apply = useCallback(
    (replacement: string): void => {
      const captured = snapshot
      const content = replacement.trim()
      if (!captured || !content) return

      if (captured.kernel === 'rich') {
        const rich = richEditorRef?.current
        if (!rich) {
          close()
          return
        }
        const value = getRichContent?.() ?? ''
        let { start, end } = captured
        if (value.substring(start, end) !== captured.text) {
          // 选区失配：退化为当前选区（可能是光标），避免把内容写到错误位置
          const current = rich.getSelectionRange()
          if (!current) {
            close()
            return
          }
          start = current.start
          end = current.end
        }
        updateDocContent({ content: value.substring(0, start) + content + value.substring(end) })
        close()
        // 回写触发 DOM 重建，等一帧再恢复光标（与插入链接的富文本写法一致）
        requestAnimationFrame(() => {
          const el = richEditorRef?.current
          if (!el) return
          el.focus()
          el.selectRange(start + content.length, start + content.length)
        })
        return
      }

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
    [snapshot, textareaRef, richEditorRef, getRichContent, updateDocContent, close],
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