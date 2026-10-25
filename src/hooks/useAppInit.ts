import { useState, useEffect, useCallback } from 'react'
import { useNotesStore, selectActiveDoc } from '@/store'
import { loadLatestDraft, clearDrafts, saveDraft } from '@/utils/autoSaveUtils'
import { beginSession, endSession } from '@/utils/sessionGuard'
import { markPerf } from '@/utils/perfMarks'
import type { AppStore, Notebook, TrashDoc } from '@/types'

interface UseAppInitOptions {
  onError: (message: string) => void
  /** 上次未正常退出时回调（若同时存在草稿恢复弹窗，则不再重复打扰） */
  onAbnormalExit?: () => void
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

export function useAppInit({ onError, onAbnormalExit }: UseAppInitOptions): UseAppInitReturn {
  const [isLoading, setIsLoading] = useState(true)
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false)
  const [recoveryDraftMeta, setRecoveryDraftMeta] = useState<{ timestamp: string; docTitle: string } | null>(null)

  const loadNotes = useNotesStore(s => s.loadNotes)
  const saveNotes = useNotesStore(s => s.saveNotes)
  const setSaveStatus = useNotesStore(s => s.setSaveStatus)

  useEffect(() => {
    const draft = loadLatestDraft()
    // 上次会话是否为异常退出（进程被杀/崩溃/断电）——与草稿恢复互为补充：
    // 草稿只在"有未落盘改动"时才有，异常退出本身则是另一个信号
    const wasAbnormalExit = beginSession()
    const { autoCleanTrash: cleanTrash } = useNotesStore.getState()

    loadNotes().then(() => {
      setIsLoading(false)
      // 启动度量（F1）：数据加载完成是"首屏可用"的关键节点
      markPerf('dataLoaded')
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
          // 恢复弹窗已经把"上次没正常收尾"说清楚了，不再叠加一个提示
          return
        }
      }
      if (wasAbnormalExit) onAbnormalExit?.()
    }).catch((err) => {
      console.error('Failed to load notes:', err)
      setIsLoading(false)
      onError('加载笔记失败，请检查数据文件')
    })
  }, [onError, loadNotes, onAbnormalExit])

  useEffect(() => {
    const handleBeforeUnload = (): void => {
      // 标记本次会话正常退出：下次启动若读到"运行中"即说明上次是异常退出
      endSession()
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
        selectActiveDoc(state)?.title
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
    /*
     * 草稿是精简快照（见 autoSaveUtils：为了塞进 localStorage 配额，去掉了版本快照与评论）。
     * 必须在这里把缺省字段补回来 —— updateStore 是整体替换，直接把精简数据灌进 store 会让
     * 文档缺 versions/comments 等数组，后续 updateDoc 的 pushAutoVersion、评论面板都会读到 undefined。
     */
    state.updateStore({
      ...draft.data,
      notebooks: (draft.data.notebooks ?? []).map((notebook) => ({
        ...notebook,
        docs: (notebook.docs ?? []).map((doc) => ({
          ...doc,
          versions: doc.versions ?? [],
          comments: doc.comments ?? [],
          shareLinks: doc.shareLinks ?? [],
          tags: doc.tags ?? [],
          parentId: doc.parentId ?? null,
        })),
      })),
      trash: draft.data.trash ?? [],
      tags: draft.data.tags ?? [],
      searchHistory: draft.data.searchHistory ?? [],
    })

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