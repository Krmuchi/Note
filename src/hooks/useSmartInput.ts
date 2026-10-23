/**
 * 编辑器智能输入：行内标记自动补全（` * ~）、回车块续写、Tab / Shift+Tab 缩进。
 * 由快捷键分发器（useEditorKeys）优先调用，返回是否已消费本次按键。
 */

import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import type { NoteDoc } from '@/types';
import { autoPairMarker, changeIndent, continueBlockOnEnter } from '@/utils/editorTextOps';

interface UseSmartInputOptions {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  activeDoc: NoteDoc | null;
  updateDocContent: (changes: Partial<NoteDoc>) => void;
}

export function useSmartInput({ textareaRef, activeDoc, updateDocContent }: UseSmartInputOptions): {
  handleSmartInput: (e: ReactKeyboardEvent<HTMLTextAreaElement>) => boolean;
} {
  /** 返回 true 表示本次按键已处理，调用方应停止后续快捷键分发 */
  const handleSmartInput = (e: ReactKeyboardEvent<HTMLTextAreaElement>): boolean => {
    // 块续写与缩进：不依赖 onFormatShortcut，优先于格式化快捷键处理
    const ta = textareaRef.current;
    if (!(ta && activeDoc && !e.ctrlKey && !e.metaKey && !e.altKey)) return false;

    // 行内标记自动补全：` ` ` * ~
    if (e.key === '`' || e.key === '*' || e.key === '~') {
      if (autoPairMarker(ta, e.key)) {
        e.preventDefault();
        updateDocContent({ content: ta.value });
        return true;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      const next = continueBlockOnEnter(ta);
      if (next !== null) {
        e.preventDefault();
        updateDocContent({ content: next });
        return true;
      }
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const next = changeIndent(ta, !e.shiftKey);
      if (next !== null) updateDocContent({ content: next });
      return true;
    }
    return false;
  };

  return { handleSmartInput };
}

export default useSmartInput;