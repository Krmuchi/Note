import { useRef, useCallback, useEffect, useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useNotesStore } from '@/store'
import type { DocSnapshot } from '@/store/slices/undoRedoSlice'

const historyLimit = 200
const mergeWindow = 1000

export const useUndoRedo = () => {
  const lastHistoryAtRef = useRef<number>(0)

  const { activeNotebookId, activeDocId, notebooks, updateDoc } = useNotesStore(useShallow((s) => ({
    activeNotebookId: s.activeNotebookId,
    activeDocId: s.activeDocId,
    notebooks: s.notebooks,
    updateDoc: s.updateDoc,
  })))
  const activeDoc = useMemo(() => {
    const notebook = notebooks.find(nb => nb.id === activeNotebookId)
    return notebook?.docs.find(doc => doc.id === activeDocId) || null
  }, [notebooks, activeNotebookId, activeDocId])

  const docHistory = useNotesStore((s) => (activeDocId ? s.history[activeDocId] : undefined))
  const pushUndoSnapshot = useNotesStore((s) => s.pushUndoSnapshot)
  const popUndoSnapshot = useNotesStore((s) => s.popUndoSnapshot)
  const pushRedoSnapshot = useNotesStore((s) => s.pushRedoSnapshot)
  const popRedoSnapshot = useNotesStore((s) => s.popRedoSnapshot)

  const canUndo = (docHistory?.past.length ?? 0) > 0
  const canRedo = (docHistory?.future.length ?? 0) > 0

  useEffect(() => {
    lastHistoryAtRef.current = 0
  }, [activeDocId])

  const undo = useCallback(() => {
    const doc = activeDoc
    if (!doc || !activeDocId) return

    const prev = popUndoSnapshot(activeDocId)
    if (!prev) return

    pushRedoSnapshot(activeDocId, { title: doc.title ?? '', content: doc.content ?? '', tags: doc.tags ?? [] })
    updateDoc(activeNotebookId, doc.id, { title: prev.title, content: prev.content, tags: prev.tags })
  }, [activeDoc, activeDocId, activeNotebookId, updateDoc, popUndoSnapshot, pushRedoSnapshot])

  const redo = useCallback(() => {
    const doc = activeDoc
    if (!doc || !activeDocId) return

    const next = popRedoSnapshot(activeDocId)
    if (!next) return

    pushUndoSnapshot(activeDocId, { title: doc.title ?? '', content: doc.content ?? '', tags: doc.tags ?? [] }, historyLimit)
    updateDoc(activeNotebookId, doc.id, { title: next.title, content: next.content, tags: next.tags })
  }, [activeDoc, activeDocId, activeNotebookId, updateDoc, popRedoSnapshot, pushUndoSnapshot])

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
    }
  }, [activeDocId, pushUndoSnapshot])

  return { undo, redo, canUndo, canRedo, recordSnapshot }
}