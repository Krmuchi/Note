import React, { useRef } from 'react';
import type { NoteDoc } from '@/types';

interface EditorContentProps {
  activeDoc: NoteDoc | null;
  fontSize: string;
  updateDocContent: (updates: Partial<NoteDoc>) => void;
  handlePaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  activeView?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}

export const EditorContent: React.FC<EditorContentProps> = ({
  activeDoc,
  fontSize,
  updateDocContent,
  handlePaste,
  activeView = 'notebooks',
  textareaRef: externalRef,
}) => {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const textareaRef = externalRef || internalRef;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (activeDoc) {
      updateDocContent({ content: e.target.value });
    }
  };

  return (
    <div className="editor-content">
      {activeDoc ? (
        <div className="editor-body">
          {activeView === 'trash' ? (
            <div className="trash-document-view">
              <div className="trash-doc-title">{activeDoc.title}</div>
              <div className="trash-doc-content">{activeDoc.content || '该文档没有内容'}</div>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="editor-textarea"
              value={activeDoc?.content || ''}
              onChange={handleChange}
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
          <div className="empty-hint" style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-placeholder)' }}>从左侧选择或新建一个文档</div>
        </div>
      )}
    </div>
  );
};