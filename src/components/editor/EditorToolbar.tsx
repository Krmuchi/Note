import React from 'react';

interface EditorToolbarProps {
  onInsertWrap: (prefix: string, suffix?: string) => void;
  onInsertHeading: (level: number) => void;
  onInsertList: (ordered: boolean) => void;
  onInsertQuote: () => void;
  onInsertCodeBlock: () => void;
  onInsertLink: () => void;
  onInsertImage: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  onInsertWrap,
  onInsertHeading,
  onInsertList,
  onInsertQuote,
  onInsertCodeBlock,
  onInsertLink,
  onInsertImage,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) => {
  return (
    <div className="editor-toolbar">
      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => onUndo()}
          disabled={!canUndo}
          title="撤销 (Ctrl+Z)"
        >
          ↩️
        </button>
        <button
          className="toolbar-btn"
          onClick={() => onRedo()}
          disabled={!canRedo}
          title="重做 (Ctrl+Y)"
        >
          ↪️
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => onInsertHeading(1)}
          title="一级标题"
        >
          H1
        </button>
        <button
          className="toolbar-btn"
          onClick={() => onInsertHeading(2)}
          title="二级标题"
        >
          H2
        </button>
        <button
          className="toolbar-btn"
          onClick={() => onInsertHeading(3)}
          title="三级标题"
        >
          H3
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => onInsertWrap('**', '**')}
          title="粗体 (Ctrl+B)"
        >
          B
        </button>
        <button
          className="toolbar-btn"
          onClick={() => onInsertWrap('*', '*')}
          title="斜体 (Ctrl+I)"
        >
          I
        </button>
        <button
          className="toolbar-btn"
          onClick={() => onInsertWrap('~~', '~~')}
          title="删除线"
        >
          S
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => onInsertList(false)}
          title="无序列表"
        >
          • List
        </button>
        <button
          className="toolbar-btn"
          onClick={() => onInsertList(true)}
          title="有序列表"
        >
          1. List
        </button>
        <button
          className="toolbar-btn"
          onClick={() => onInsertQuote()}
          title="引用"
        >
          "
        </button>
        <button
          className="toolbar-btn"
          onClick={() => onInsertCodeBlock()}
          title="代码块"
        >
          &lt;/&gt;
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-group">
        <button
          className="toolbar-btn"
          onClick={() => onInsertLink()}
          title="插入链接"
        >
          🔗
        </button>
        <button
          className="toolbar-btn"
          onClick={() => onInsertImage()}
          title="插入图片"
        >
          🖼️
        </button>
      </div>
    </div>
  );
};