import { useEffect, useRef } from 'react'
import { useNotesStore } from '@/store'
import { saveDraft } from '@/utils/autoSaveUtils'
import { debounce } from '@/utils/debounce'

const DRAFT_SAVE_DELAY = 800

export function useDraftSync() {
  // 只订阅当前活动文档的 updatedAt 字符串，而非整个 notebooks/trash/tags，
  // 避免任何库数据变化都触发草稿全量写入，降低联动重渲染与触发频率
  const activeDocUpdatedAt = useNotesStore((s) => {
    const nb = s.notebooks.find((n) => n.id === s.activeNotebookId)
    const doc = nb?.docs.find((d) => d.id === s.activeDocId)
    return doc?.updatedAt ?? null
  })

  // 800ms 防抖的草稿保存：连续输入只触发一次全量 JSON.stringify，
  // 避免每次击键都写整个库到 localStorage 造成的卡顿
  const debouncedSaveRef = useRef(
    debounce((title: string) => {
      const state = useNotesStore.getState()
      saveDraft(
        {
          notebooks: state.notebooks,
          trash: state.trash,
          tags: state.tags,
          searchHistory: state.searchHistory,
        },
        title,
      )
    }, DRAFT_SAVE_DELAY),
  )

  useEffect(() => {
    if (!activeDocUpdatedAt) return
    const state = useNotesStore.getState()
    const nb = state.notebooks.find((n) => n.id === state.activeNotebookId)
    const doc = nb?.docs.find((d) => d.id === state.activeDocId)
    if (doc) debouncedSaveRef.current(doc.title)
  }, [activeDocUpdatedAt])

  // 应用关闭/刷新或组件卸载时，将挂起的草稿立即落盘，避免丢失最近编辑
  useEffect(() => {
    const debouncedSave = debouncedSaveRef.current
    const flushDraft = () => debouncedSave.flush()
    window.addEventListener('beforeunload', flushDraft)
    return () => {
      window.removeEventListener('beforeunload', flushDraft)
      debouncedSave.flush()
    }
  }, [])
}
