import { useEffect, useRef, useCallback } from 'react';
import { useNotesStore } from '../store/notesStore';

export const useAutoSave = (debounceMs: number = 3000) => {
  const { saveNotes } = useNotesStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInProgressRef = useRef(false);
  const retryCountRef = useRef(0);

  const debouncedSave = useCallback(() => {
    if (saveInProgressRef.current) return;
    
    saveInProgressRef.current = true;
    
    const handleSave = async () => {
      try {
        await saveNotes();
        retryCountRef.current = 0;
      } catch (error) {
        console.error('Auto-save failed:', error);
        retryCountRef.current++;
        
        if (retryCountRef.current <= 3) {
          const delay = Math.pow(2, retryCountRef.current) * 1000;
          setTimeout(handleSave, delay);
        }
      } finally {
        saveInProgressRef.current = false;
      }
    };

    if ('requestIdleCallback' in window) {
      requestIdleCallback(handleSave, { timeout: 5000 });
    } else {
      handleSave();
    }
  }, [saveNotes]);

  useEffect(() => {
    useNotesStore.getState();
    
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    
    debounceRef.current = setTimeout(debouncedSave, debounceMs);
    
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [debounceMs, debouncedSave]);

  return { triggerSave: debouncedSave };
};