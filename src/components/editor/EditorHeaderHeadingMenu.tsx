import React from 'react';
import type { FormatType } from '@/hooks/useEditorFormatting';
import { useRichEditorEnabled } from '@/utils/richEditorFlag';

/** EditorHeader 段落样式（标题级别）下拉菜单。从 EditorHeader.tsx 纯拆分，逻辑不变。 */

type HeadingLevel = 'paragraph' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
type HeadingFormat = 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6';

const HEADING_LEVELS = [
  { level: 'h1', format: 'heading1', label: '标题 1' },
  { level: 'h2', format: 'heading2', label: '标题 2' },
  { level: 'h3', format: 'heading3', label: '标题 3' },
  { level: 'h4', format: 'heading4', label: '标题 4' },
  { level: 'h5', format: 'heading5', label: '标题 5' },
  { level: 'h6', format: 'heading6', label: '标题 6' },
] as const;

const HEADING_FORMATS: readonly HeadingFormat[] = [
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'heading6',
];

interface EditorHeaderHeadingMenuProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  activeFormats: Set<string>;
  applyFormat: (type: FormatType) => void;
}

export const EditorHeaderHeadingMenu: React.FC<EditorHeaderHeadingMenuProps> = ({
  open,
  setOpen,
  menuRef,
  activeFormats,
  applyFormat,
}) => {
  /** 两个内核的 applyFormat 语义不同，跨级别切换要区别对待（见 handleHeadingSelect） */
  const richEditorEnabled = useRichEditorEnabled();

  const activeHeading = (): HeadingFormat | null => {
    for (const format of HEADING_FORMATS) {
      if (activeFormats.has(format)) return format;
    }
    return null;
  };

  const currentHeading = (): HeadingLevel => {
    const active = activeHeading();
    return active ? (active.replace('heading', 'h') as HeadingLevel) : 'paragraph';
  };

  /**
   * 选择标题级别。
   *
   * 旧实现是两段式：先 forEach 把所有已激活的标题级别 `applyFormat` 一遍（清除），
   * 再判断目标级别是否已激活 —— 于是踩了两个坑：
   * 1) 点当前已激活的级别时，先清掉标题、又因 `activeFormats.has(target)` 跳过
   *    重新施加，结果从「标题 2」掉成「正文」（缺陷4）；
   * 2) forEach 连调 applyFormat：每次读的都是渲染闭包里的旧 content，
   *    且 updateDocContent 会为每次调用各记一份撤销快照（重复项，缺陷5）。
   *
   * 现在只算**一次**要施加的 FormatType：
   * - 点当前已激活的级别 → 直接关菜单，什么都不改（幂等）；
   * - 点其它级别 → 只调一次 applyFormat(target)。行首标记是替换语义
   *   （markdownFormat 的 toggleLineMark 会先清掉该行已有的块标记），
   *   因此从「标题 2」切到「标题 4」不会被叠加成两个标记；
   * - 正文 → 对**当前**已激活的级别再施加一次（toggle 语义 = 取消标题），
   *   同样只有一次调用，且不会像 clearFormat 那样把行内加粗/斜体一起剥掉。
   *
   * 旧内核（textarea）必须补一次"取消旧级别"：它的 applyFormat 走
   * editorTextOps.insertBlockMark，只在"行首已经是**同一串**标记"时才取消，
   * 从「标题 2」切到「标题 4」会叠成 `#### ## 文字`。旧内核是原地改 ta.value
   * （不是回写 store 再等重渲染），所以连续两次调用读到的是**已更新**的值，
   * 不存在上面说的旧闭包问题 —— 单次调用只用在富文本内核（默认内核）。
   */
  const handleHeadingSelect = (level: HeadingLevel): void => {
    setOpen(false);
    const active = activeHeading();
    if (level === 'paragraph') {
      // 已经是正文：无需任何操作
      if (active) applyFormat(active);
      return;
    }
    const target = `heading${level[1]}` as HeadingFormat;
    if (target === active) return;
    if (!richEditorEnabled && active) {
      // 先取消当前级别（toggle 语义），再施加目标级别
      applyFormat(active);
    }
    applyFormat(target);
  };

  const headingLabel = (): string => {
    const h = currentHeading();
    return h === 'paragraph' ? '正文' : h.toUpperCase();
  };

  return (
    <div className="eh-dropdown" ref={menuRef} role="none">
      <button
        type="button"
        className={`eh-icon-btn eh-btn-text ${currentHeading() !== 'paragraph' ? 'active' : ''}`}
        data-eh-menu-trigger
        onClick={() => setOpen(!open)}
        title="段落样式"
        aria-label="段落样式"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {headingLabel()}
        <svg className="eh-arrow" viewBox="0 0 12 12" fill="currentColor"><path d="M3 5l3 3 3-3" /></svg>
      </button>
      {open && (
        <div className="eh-dropdown-menu eh-heading-menu" role="menu" aria-label="段落样式">
          <button
            type="button"
            role="menuitem"
            className={`eh-menu-item ${currentHeading() === 'paragraph' ? 'active' : ''}`}
            onClick={() => handleHeadingSelect('paragraph')}
          >
            <span className="eh-heading-p">正文</span>
          </button>
          {HEADING_LEVELS.map((h) => (
            <button
              key={h.level}
              type="button"
              role="menuitem"
              className={`eh-menu-item ${currentHeading() === h.level ? 'active' : ''}`}
              onClick={() => handleHeadingSelect(h.level)}
            >
              <span className={`eh-heading-${h.level}`}>{h.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
