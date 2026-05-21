import { useEffect, useCallback } from 'react';

interface KeyboardHandlers {
  onSearch?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const useKeyboard = (handlers: KeyboardHandlers) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const meta = e.ctrlKey || e.metaKey;
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
    
    if (meta && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      handlers.onSearch?.();
      return;
    }
    
    if (!meta || isInput) return;
    
    const key = e.key.toLowerCase();
    
    if (key === 'z') {
      e.preventDefault();
      handlers.onUndo?.();
    } else if (key === 'y' || (e.shiftKey && key === 'z')) {
      e.preventDefault();
      handlers.onRedo?.();
    }
  }, [handlers]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};