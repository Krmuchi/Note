import React, { useRef } from 'react';
import type { NoteDoc } from '../types';

interface EditorContentProps {
  activeDoc: NoteDoc | null;
  fontSize: string;
  updateDocContent: (updates: Partial<NoteDoc>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  activeView?: string; // 添加 activeView 属性，用于区分是否在trash视图中
}

export const EditorContent: React.FC<EditorContentProps> = ({
  activeDoc,
  fontSize,
  updateDocContent,
  handlePaste,
  activeView = "notebooks", // 默认值
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  return (
    <div className="editor-content">
      {activeDoc ? (
        <div className="editor-body">
          {activeView === "trash" ? (
            <div className="trash-document-view">
              <div className="trash-doc-title">{activeDoc.title}</div>
              <div className="trash-doc-content">{activeDoc.content || "该文档没有内容"}</div>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              value={activeDoc?.content || ""}
              onChange={(e) => {
                if (activeDoc) {
                  updateDocContent({ content: e.target.value });
                }
              }}
              onPaste={handlePaste}
              placeholder="开始编写你的文章..."
              spellCheck={false}
              style={{ fontSize: fontSize }}
            />
          )}
        </div>
      ) : (
        <div className="empty-editor">
          <div className="empty-icon">📄</div>
          <div className="empty-text">选择文档开始编辑</div>
        </div>
      )}
    </div>
  );
};