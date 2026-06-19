import { useEffect, useCallback } from 'react';

interface KeyboardHandlers {
  onSearch?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSave?: () => void;
  onNewDoc?: () => void;
  onNewNotebook?: () => void;
  onToggleSidebar?: () => void;
  onToggleFavorite?: () => void;
  onClose?: () => void;
  onEscape?: () => void;
  onBold?: () => void;
  onItalic?: () => void;
  onShortcutHelp?: () => void;
}

export const useKeyboard = (handlers: KeyboardHandlers) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const meta = e.ctrlKey || e.metaKey;
    const target = e.target as HTMLElement;
    const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

    if (e.key === 'Escape') {
      handlers.onEscape?.();
      handlers.onClose?.();
      return;
    }

    if (meta && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      handlers.onSearch?.();
      return;
    }

    if (meta && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handlers.onSave?.();
      return;
    }

    if (meta && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      handlers.onNewDoc?.();
      return;
    }

    if (meta && e.shiftKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      handlers.onNewNotebook?.();
      return;
    }

    if (meta && e.key === '\\') {
      e.preventDefault();
      handlers.onToggleSidebar?.();
      return;
    }

    if (meta && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      handlers.onToggleFavorite?.();
      return;
    }

    if (meta && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      handlers.onBold?.();
      return;
    }

    if (meta && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      handlers.onItalic?.();
      return;
    }

    if (meta && e.key === '/') {
      e.preventDefault();
      handlers.onShortcutHelp?.();
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