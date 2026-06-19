import { useState, useCallback } from 'react'
import { useNotesStore } from '@/store'

const DRAFT_KEY = 'notes-autosave-draft'

interface DraftData {
  notebookId: string
  docId: string
  content: string
  savedAt: string
}

function loadDraft(): DraftData | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) {
      return JSON.parse(raw) as DraftData
    }
  } catch {
    // localStorage 不可用或数据已损坏，忽略恢复
  }
  return null
}

export const useDraftRecovery = () => {
  const [draft, setDraft] = useState<DraftData | null>(loadDraft)
  const [showRecovery, setShowRecovery] = useState(() => draft !== null)
  const updateDoc = useNotesStore(state => state.updateDoc)

  const recoverDraft = useCallback(() => {
    if (!draft) return
    updateDoc(draft.notebookId, draft.docId, { content: draft.content })
    localStorage.removeItem(DRAFT_KEY)
    setShowRecovery(false)
    setDraft(null)
  }, [draft, updateDoc])

  const discardDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY)
    setShowRecovery(false)
    setDraft(null)
  }, [])

  return { draft, showRecovery, recoverDraft, discardDraft }
}