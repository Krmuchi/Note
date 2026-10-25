import { useRef, useCallback, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNotesStore, selectActiveDoc } from '@/store'
import type { NoteDoc } from '@/types'
import type { DocSnapshot } from '@/store/slices/undoRedoSlice'
import { extractInsertedText, shouldStartNewHistory } from '@/utils/undoHistory'

const historyLimit = 200
const mergeWindow = 1000

export const useUndoRedo = (): {
  /** 返回是否实际执行了撤销（空栈时 false，调用侧据此决定是否提示） */
  undo: () => boolean
  /** 返回是否实际执行了重做（空栈时 false，调用侧据此决定是否提示） */
  redo: () => boolean
  canUndo: boolean
  canRedo: boolean
  recordSnapshot: (doc: { title?: string; content?: string; tags?: string[] }) => void
  clearHistory: (docId: string) => void
} => {
  const lastHistoryAtRef = useRef<number>(0)
  /**
   * 上一次记录历史时的正文。
   * 与当前正文做 diff 即可知道"这次新增了什么字符"，
   * 从而在句号/空格/换行处切分撤销历史（见 utils/undoHistory）。
   */
  const lastContentRef = useRef<string>('')

  const { activeNotebookId, activeDocId, updateDoc } = useNotesStore(useShallow((s) => ({
    activeNotebookId: s.activeNotebookId,
    activeDocId: s.activeDocId,
    updateDoc: s.updateDoc,
  })))
  /*
   * 不再订阅 activeDoc。
   *
   * 旧实现用 `useNotesStore(selectActiveDoc)` 订阅了缓存引用 —— 而 activeDoc 在
   * 每次击键时都会被 updateDoc 换成新的 immer 对象，于是这个 hook（被 Editor 与
   * App 同时调用，App 用它拿 undo/redo 接全局快捷键）会在每次输入时重渲染，
   * 连带把整个应用外壳拉进重渲染。撤销/重做只需要"调用那一刻"的最新内容，
   * 直接 getState 读取即可，无需参与订阅。
   */
  const readActiveDoc = useCallback((): NoteDoc | null => selectActiveDoc(useNotesStore.getState()), [])

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
    // 切换文档后必须清掉上一份正文，否则首帧 diff 会把"另一篇文档的全文"当成新增内容
    lastContentRef.current = ''
  }, [activeDocId])

  const undo = useCallback((): boolean => {
    const doc = readActiveDoc()
    if (!doc || !activeDocId) return false

    const prev = popUndoSnapshot(activeDocId)
    if (!prev) return false

    pushRedoSnapshot(activeDocId, { title: doc.title ?? '', content: doc.content ?? '', tags: doc.tags ?? [] })
    updateDoc(activeNotebookId, doc.id, { title: prev.title, content: prev.content, tags: prev.tags })
    // 撤销改写了正文：同步基准并断开合并窗口，
    // 否则紧接着的输入会被并进"撤销之后"的同一段历史，导致一次 Ctrl+Z 又跳回去
    lastContentRef.current = prev.content
    lastHistoryAtRef.current = 0
    return true
  }, [activeDocId, activeNotebookId, updateDoc, popUndoSnapshot, pushRedoSnapshot, readActiveDoc])

  const redo = useCallback((): boolean => {
    const doc = readActiveDoc()
    if (!doc || !activeDocId) return false

    const next = popRedoSnapshot(activeDocId)
    if (!next) return false

    pushUndoSnapshot(activeDocId, { title: doc.title ?? '', content: doc.content ?? '', tags: doc.tags ?? [] }, historyLimit)
    updateDoc(activeNotebookId, doc.id, { title: next.title, content: next.content, tags: next.tags })
    lastContentRef.current = next.content
    lastHistoryAtRef.current = 0
    return true
  }, [activeDocId, activeNotebookId, updateDoc, popRedoSnapshot, pushUndoSnapshot, readActiveDoc])

  const recordSnapshot = useCallback((doc: { title?: string; content?: string; tags?: string[] }) => {
    if (!activeDocId) return
    const now = Date.now()
    const last = lastHistoryAtRef.current

    const snapshot: DocSnapshot = {
      title: doc.title ?? '',
      content: doc.content ?? '',
      tags: doc.tags ?? [],
    }

    // 与上一次内容对比，取出本次新增的片段：用它判断"刚输入的是不是句子边界"
    const inserted = extractInsertedText(lastContentRef.current ?? '', doc.content ?? '')

    const startNew = shouldStartNewHistory({
      lastHistoryAt: last,
      now,
      mergeWindow,
      insertedText: inserted,
    })

    lastContentRef.current = doc.content ?? ''

    if (startNew) {
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