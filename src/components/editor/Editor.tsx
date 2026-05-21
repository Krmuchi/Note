import React, { useRef, useCallback, useEffect } from 'react';
import { useNotesStore } from '../../store/notesStore';
import { useUndoRedo } from '../../hooks/useUndoRedo';
import { EditorHeader } from '../EditorHeader';
import { EditorContent } from '../EditorContent';
import type { NoteDoc } from '../../types';

interface EditorProps {
  activeDoc: NoteDoc | null;
  activeNotebookId: string;
  activeDocId: string;
  fontSize: string;
  onFontSizeChange: (size: string) => void;
}

export const Editor: React.FC<EditorProps> = ({
  activeDoc,
  activeNotebookId,
  activeDocId,
  fontSize,
  onFontSizeChange,
}) => {
  const { updateDoc, toggleFavorite, saveStatus } = useNotesStore();
  const { undo, redo, canUndo, canRedo, recordSnapshot } = useUndoRedo();
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showMoreOptions, setShowMoreOptions] = React.useState(false);
  const [showPresentationMenu, setShowPresentationMenu] = React.useState(false);

  const updateDocContent = useCallback(
    (changes: Partial<NoteDoc>) => {
      if (!activeDoc) return;
      
      if (changes.content || changes.title || changes.tags) {
        recordSnapshot({
          title: activeDoc.title,
          content: activeDoc.content,
          tags: activeDoc.tags,
        });
      }
      
      updateDoc(activeNotebookId, activeDocId, changes);
    },
    [activeDoc, activeNotebookId, activeDocId, updateDoc, recordSnapshot]
  );

  const handlePaste = (ev: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = ev.clipboardData && ev.clipboardData.items;
    if (!items) return;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type && item.type.indexOf('image') === 0) {
        const file = item.getAsFile();
        if (file) {
          ev.preventDefault();
          handleInsertImage(file);
          return;
        }
      }
    }
  };

  const handleInsertImage = async (file: File) => {
    if (!file || !activeDoc) return;
    
    const reader = new FileReader();
    reader.onload = async () => {
      const data = (reader.result as string) || '';
      try {
        const saved = await window.notesApi.saveImage({ name: file.name, data });
        const src = saved || data;
        insertImage(textareaRef.current, src);
        updateDocContent({ content: textareaRef.current?.value || '' });
      } catch {
        insertImage(textareaRef.current, data);
        updateDocContent({ content: textareaRef.current?.value || '' });
      }
    };
    reader.readAsDataURL(file);
  };

  const insertImage = (ta: HTMLTextAreaElement | null, src: string) => {
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selectedText = ta.value.substring(start, end);
    const imageMarkdown = `![${selectedText || 'image'}](${src})`;
    ta.value = ta.value.substring(0, start) + imageMarkdown + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + imageMarkdown.length;
  };

  

  useEffect(() => {
    if (activeDoc) {
      recordSnapshot({
        title: activeDoc.title,
        content: activeDoc.content,
        tags: activeDoc.tags,
      });
    }
  }, [activeDocId, recordSnapshot]);

  if (!activeDoc) {
    return (
      <main className="editor-panel">
        <div className="empty-editor">
          <div className="empty-icon">📄</div>
          <div className="empty-text">选择一个文档开始编辑</div>
        </div>
      </main>
    );
  }

  return (
    <main className="editor-panel">
      <EditorHeader
        activeDoc={activeDoc}
        activeNotebookId={activeNotebookId}
        activeDocId={activeDocId}
        saveStatus={saveStatus}
        fontSize={fontSize}
        showPresentationMenu={showPresentationMenu}
        updateDocContent={updateDocContent}
        toggleFavorite={toggleFavorite}
        handleCopyLink={() => navigator.clipboard.writeText(`${window.location.origin}/doc/${activeDocId}`)}
        handleOpenInNewWindow={() => window.open(`/doc/${activeDocId}`, '_blank')}
        setShowSharePanel={() => {}}
        setShowPresentationMenu={setShowPresentationMenu}
        setFontSize={onFontSizeChange}
        showMoreOptions={showMoreOptions}
        setShowMoreOptions={setShowMoreOptions}
        undo={undo}
        redo={redo}
        canUndo={canUndo}
        canRedo={canRedo}
        />
      <EditorContent
        activeDoc={activeDoc}
        fontSize={fontSize}
        updateDocContent={updateDocContent}
        handlePaste={handlePaste}
      />
    </main>
  );
};