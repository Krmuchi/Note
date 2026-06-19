import { useRef, useCallback, useEffect } from 'react'
import { useNotesStore } from '@/store'

export const useAutoSave = (debounceMs: number = 3000) => {
  const saveNotes = useNotesStore(state => state.saveNotes)
  const notebooks = useNotesStore(state => state.notebooks)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveInProgressRef = useRef(false)
  const retryCountRef = useRef(0)
  const saveNotesRef = useRef(saveNotes)
  const lastTriggerRef = useRef(0)

  useEffect(() => {
    saveNotesRef.current = saveNotes
  }, [saveNotes])

  const scheduleSave = useCallback(() => {
    if (saveInProgressRef.current) return

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      saveInProgressRef.current = true

      const handleSave = async () => {
        try {
          await saveNotesRef.current()
          retryCountRef.current = 0
        } catch (error) {
          console.error('Auto-save failed:', error)
          retryCountRef.current++

          if (retryCountRef.current <= 3) {
            const delay = Math.pow(2, retryCountRef.current) * 1000
            setTimeout(handleSave, delay)
          }
        } finally {
          saveInProgressRef.current = false
        }
      }

      if ('requestIdleCallback' in window) {
        (window as unknown as { requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => void })
          .requestIdleCallback(handleSave, { timeout: 5000 })
      } else {
        handleSave()
      }
    }, debounceMs)
  }, [debounceMs])

  useEffect(() => {
    const now = Date.now()
    if (now - lastTriggerRef.current < 500) return
    lastTriggerRef.current = now
    scheduleSave()
  }, [notebooks, scheduleSave])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveInProgressRef.current) {
        e.preventDefault()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  return { scheduleSave }
}