import { useState, useEffect, useCallback } from 'react'
import { useNotesStore } from '@/store'
import { loadLatestDraft, clearDrafts, saveDraft } from '@/utils/autoSaveUtils'
import type { AppStore, Notebook, TrashDoc } from '@/types'

interface UseAppInitOptions {
  onError: (message: string) => void
}

interface UseAppInitReturn {
  isLoading: boolean
  showRecoveryDialog: boolean
  recoveryDraftMeta: { timestamp: string; docTitle: string } | null
  handleRecoverDraft: () => void
  handleDiscardDraft: () => void
  /** 仅关闭恢复弹窗（草稿保留，下次启动再次提示），供 Esc/遮罩关闭使用 */
  handleDismissDraft: () => void
}

/**
 * 计算数据指纹：覆盖 id/标题/数量/最新时间戳等关键维度。
 * 相比全量 JSON.stringify（大库时启动明显卡顿），指纹遍历开销可忽略；
 * 指纹相同但内容确有差异的极端场景（如纯顺序调整）对恢复对话框而言可忽略。
 */
function computeDataFingerprint(notebooks: Notebook[], trash: TrashDoc[]): string {
  const nbPart = notebooks.map(nb => {
    const maxUpdated = nb.docs.reduce(
      (max, d) => (d.updatedAt && d.updatedAt > max ? d.updatedAt : max),
      ''
    )
    return `${nb.id}:${nb.title}:${nb.docs.length}:${maxUpdated}`
  }).join('|')
  const trashPart = trash.map(t => `${t.id}:${t.deletedAt ?? ''}`).join('|')
  return `${nbPart}#${trashPart}`
}

export function useAppInit({ onError }: UseAppInitOptions): UseAppInitReturn {
  const [isLoading, setIsLoading] = useState(true)
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false)
  const [recoveryDraftMeta, setRecoveryDraftMeta] = useState<{ timestamp: string; docTitle: string } | null>(null)

  const loadNotes = useNotesStore(s => s.loadNotes)
  const saveNotes = useNotesStore(s => s.saveNotes)
  const setSaveStatus = useNotesStore(s => s.setSaveStatus)

  useEffect(() => {
    const draft = loadLatestDraft()
    const { autoCleanTrash: cleanTrash } = useNotesStore.getState()

    loadNotes().then(() => {
      setIsLoading(false)
      cleanTrash()
      if (draft) {
        const current = useNotesStore.getState()
        const draftFingerprint = computeDataFingerprint(draft.data.notebooks, draft.data.trash)
        const currentFingerprint = computeDataFingerprint(current.notebooks, current.trash)

        if (draftFingerprint !== currentFingerprint) {
          setRecoveryDraftMeta({
            timestamp: draft.meta.timestamp,
            docTitle: draft.meta.docTitle,
          })
          setShowRecoveryDialog(true)
        }
      }
    }).catch((err) => {
      console.error('Failed to load notes:', err)
      setIsLoading(false)
      onError('加载笔记失败，请检查数据文件')
    })
  }, [onError, loadNotes])

  useEffect(() => {
    const handleBeforeUnload = (): void => {
      const state = useNotesStore.getState()
      // 同步兜底：卸载前将当前状态写入 localStorage 草稿。
      // saveNotes 是异步 IPC，页面卸载时 promise 可能被中断；
      // 同步写草稿可保证最新变更在下次启动时通过恢复对话框找回。
      saveDraft(
        {
          notebooks: state.notebooks,
          trash: state.trash,
          tags: state.tags,
          searchHistory: state.searchHistory,
        } as AppStore,
        state.activeDoc?.title
      )
      // 异步保存仍尽力执行；仅当确认保存成功后才清除草稿，
      // 保存被中断时草稿保留，供下次启动恢复
      void saveNotes().then(() => {
        if (useNotesStore.getState().saveStatus !== 'error') {
          clearDrafts()
        }
      })
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [saveNotes])

  const handleRecoverDraft = useCallback(() => {
    const draft = loadLatestDraft()
    if (!draft) return

    const state = useNotesStore.getState()
    state.updateStore(draft.data)

    if (draft.data.notebooks.length > 0) {
      const nb = draft.data.notebooks[0]
      state.setActiveNotebookId(nb.id)
      if (nb.docs.length > 0) {
        state.setActiveDocId(nb.docs[0].id)
      }
    }

    setSaveStatus('saved')
    setShowRecoveryDialog(false)
    clearDrafts()
  }, [setSaveStatus])

  const handleDiscardDraft = useCallback(() => {
    clearDrafts()
    setShowRecoveryDialog(false)
  }, [])

  const handleDismissDraft = useCallback(() => {
    // 仅关闭弹窗：草稿保留在 localStorage，下次启动仍会提示恢复
    setShowRecoveryDialog(false)
  }, [])

  return {
    isLoading,
    showRecoveryDialog,
    recoveryDraftMeta,
    handleRecoverDraft,
    handleDiscardDraft,
    handleDismissDraft,
  }
}