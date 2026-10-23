/**
 * 格式刷：未激活时复制当前光标/选区的行内格式；激活后再次触发时把已复制的格式逐项套用到目标选区。
 * 仅处理行内格式，避免把标题/列表等块级标记错误地叠加到目标行。
 */

import { useCallback, useState } from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';

/** 格式刷只复制行内格式：块级标记（标题/列表等）套用会破坏目标行结构 */
const PAINTER_INLINE_FORMATS = new Set(['bold', 'italic', 'underline', 'strike', 'code']);

interface UseFormatPainterOptions {
  /** 当前光标/选区已激活的格式集合（来自 useEditorFormatting） */
  activeFormats: Set<string>;
  applyFormat: (
    type: FormatType,
    options?: { color?: string; size?: string; rows?: number; cols?: number; language?: string },
  ) => void;
}

export function useFormatPainter({ activeFormats, applyFormat }: UseFormatPainterOptions): {
  painterFormats: string[] | null;
  handleFormatPainter: () => void;
  cancelFormatPainter: () => void;
} {
  /** null 未激活；非 null 表示已复制的行内格式类型 */
  const [painterFormats, setPainterFormats] = useState<string[] | null>(null);

  /**
   * 格式刷：未激活时复制当前光标/选区的行内格式；激活后再次点击应用到目标选区。
   * 仅处理行内格式，避免把标题/列表等块级标记错误地叠加到目标行。
   */
  const handleFormatPainter = useCallback(() => {
    if (painterFormats) {
      const formats = painterFormats;
      setPainterFormats(null);
      formats.forEach((format) => applyFormat(format as FormatType));
      return;
    }
    const captured = Array.from(activeFormats).filter((f) => PAINTER_INLINE_FORMATS.has(f));
    setPainterFormats(captured);
  }, [painterFormats, activeFormats, applyFormat]);

  /** 取消待应用的格式刷（Esc 触发） */
  const cancelFormatPainter = useCallback(() => {
    setPainterFormats(null);
  }, []);

  return { painterFormats, handleFormatPainter, cancelFormatPainter };
}

export default useFormatPainter;