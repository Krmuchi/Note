import { useRef, useCallback, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNotesStore, selectActiveDoc } from '@/store'
import type { NoteDoc } from '@/types'
import type { DocSnapshot } from '@/store/slices/undoRedoSlice'

const historyLimit = 200
const mergeWindow = 1000

export const useUndoRedo = () => {
  const lastHistoryAtRef = useRef<number>(0)

  const { activeNotebookId, activeDocId, updateDoc } = useNotesStore(useShallow((s) => ({
    activeNotebookId: s.activeNotebookId,
    activeDocId: s.activeDocId,
    updateDoc: s.updateDoc,
  })))
  // 使用 coreSlice 中缓存的 activeDoc，避免订阅整个 notebooks 数组
  // （否则每次击键产生的新数组引用都会触发该 hook 所在组件重渲染）
  const activeDoc = useNotesStore(selectActiveDoc) as NoteDoc | null
  // 持有最新 activeDoc 引用，使 undo/redo 回调保持稳定（否则每次击键都会重建，
  // 连带导致订阅这些回调的子组件 memo 失效）
  const activeDocRef = useRef<NoteDoc | null>(activeDoc)
  // 在提交后同步引用，避免渲染期写 ref
  useEffect(() => {
    activeDocRef.current = activeDoc
  }, [activeDoc])

  const docHistory = useNotesStore((s) => (activeDocId ? s.history[activeDocId] : undefined))
  const pushUndoSnapshot = useNotesStore((s) => s.pushUndoSnapshot)
  const popUndoSnapshot = useNotesStore((s) => s.popUndoSnapshot)
  const pushRedoSnapshot = useNotesStore((s) => s.pushRedoSnapshot)
  const popRedoSnapshot = useNotesStore((s) => s.popRedoSnapshot)
  const clearHistory = useNotesStore((s) => s.clearHistory)
  const clearRedoStack = useNotesStore((s) => s.clearRedoStack)

  const canUndo = (docHistory?.past.length ?? 0) > 0
  const canRedo = (docHistory?.future.length ?? 0) > 0

  useEffect(() => {
    lastHistoryAtRef.current = 0
  }, [activeDocId])

  const undo = useCallback(() => {
    const doc = activeDocRef.current
    if (!doc || !activeDocId) return

    const prev = popUndoSnapshot(activeDocId)
    if (!prev) return

    pushRedoSnapshot(activeDocId, { title: doc.title ?? '', content: doc.content ?? '', tags: doc.tags ?? [] })
    updateDoc(activeNotebookId, doc.id, { title: prev.title, content: prev.content, tags: prev.tags })
  }, [activeDocId, activeNotebookId, updateDoc, popUndoSnapshot, pushRedoSnapshot])

  const redo = useCallback(() => {
    const doc = activeDocRef.current
    if (!doc || !activeDocId) return

    const next = popRedoSnapshot(activeDocId)
    if (!next) return

    pushUndoSnapshot(activeDocId, { title: doc.title ?? '', content: doc.content ?? '', tags: doc.tags ?? [] }, historyLimit)
    updateDoc(activeNotebookId, doc.id, { title: next.title, content: next.content, tags: next.tags })
  }, [activeDocId, activeNotebookId, updateDoc, popRedoSnapshot, pushUndoSnapshot])

  const recordSnapshot = useCallback((doc: { title?: string; content?: string; tags?: string[] }) => {
    if (!activeDocId) return
    const now = Date.now()
    const last = lastHistoryAtRef.current

    const snapshot: DocSnapshot = {
      title: doc.title ?? '',
      content: doc.content ?? '',
      tags: doc.tags ?? [],
    }

    if (now - last > mergeWindow) {
      pushUndoSnapshot(activeDocId, snapshot, historyLimit)
      lastHistoryAtRef.current = now
    } else {
      lastHistoryAtRef.current = now
      // 合并窗口内虽不入栈，但"未来"已失效：清空 redo 栈，
      // 避免撤销后立刻输入时 Ctrl+Y 用过期内容覆盖新输入
      clearRedoStack(activeDocId)
    }
  }, [activeDocId, pushUndoSnapshot, clearRedoStack])

  return { undo, redo, canUndo, canRedo, recordSnapshot, clearHistory }
}