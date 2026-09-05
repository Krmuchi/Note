import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';
import { DocTree } from './DocTree';

interface DocsSidebarProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  onViewDoc: (notebookId: string, docId: string) => void;
  width?: number;
}

export const DocsSidebar: React.FC<DocsSidebarProps> = ({
  searchText,
  onSearchChange,
  onViewDoc,
  width,
}) => {
  const { notebooks, activeNotebookId, createDoc, moveDocToNotebook } = useNotesStore(
    useShallow((s) => ({
      notebooks: s.notebooks,
      activeNotebookId: s.activeNotebookId,
      createDoc: s.createDoc,
      moveDocToNotebook: s.moveDocToNotebook,
    }))
  );

  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveDocId, setMoveDocId] = useState<string | null>(null);
  const [isCompact, setIsCompact] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.offsetWidth;
      setIsCompact(w < 250);
    });
    observer.observe(el);
    setIsCompact(el.offsetWidth < 250);
    return () => observer.disconnect();
  }, []);

  const activeNotebook = useMemo(
    () => notebooks.find((nb) => nb.id === activeNotebookId) ?? null,
    [notebooks, activeNotebookId]
  );

  return (
    <aside
      ref={sidebarRef}
      className={`docs-sidebar ${isCompact ? 'docs-sidebar-compact' : ''}`}
      style={width !== undefined ? { width } : undefined}
    >
      {activeNotebook && (
        <>
          <div className="docs-header">
            <div className="docs-title-row">
              <span className="docs-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </span>
              <span className="docs-title">{activeNotebook.title}</span>
              <span className="docs-count">{activeNotebook.docs.length}</span>
            </div>
            <button
              className="btn-add-doc"
              onClick={() => {
                const docId = createDoc(activeNotebookId, null);
                if (docId) onViewDoc(activeNotebookId, docId);
              }}
              title="新建文档"
              aria-label="新建文档"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>
          <div className="docs-search">
            <input
              className="docs-search-input"
              placeholder="搜索文档..."
              value={searchText}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <DocTree
            activeNotebook={activeNotebook}
            searchText={searchText}
            onViewDoc={onViewDoc}
            onMoveRequest={(docId) => {
              setMoveDocId(docId);
              setShowMoveDialog(true);
            }}
          />
        </>
      )}

      {showMoveDialog && moveDocId && (
        <div className="confirm-dialog-overlay" onClick={() => setShowMoveDialog(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>移动文档</h3>
            <p>选择目标知识库：</p>
            <div className="move-target-list">
              {notebooks
                .filter((nb) => nb.id !== activeNotebookId)
                .map((nb) => (
                  <button
                    key={nb.id}
                    className="move-target-item"
                    onClick={() => {
                      moveDocToNotebook(activeNotebookId, moveDocId, nb.id);
                      setShowMoveDialog(false);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '16px', height: '16px' }}>
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    {nb.title}
                  </button>
                ))}
            </div>
            <div className="confirm-dialog-actions">
              <button onClick={() => setShowMoveDialog(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
