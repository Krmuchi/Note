import React, { useMemo, useState } from 'react';
import { useNotesStore } from '../../store/notesStore';
import { useDocActions } from '../../hooks/useDocActions';
import type { NoteDoc, Notebook } from '../../types';

interface RecentView {
  docId: string;
  notebookId: string;
  viewedAt: string;
}

interface DocsSidebarProps {
  searchText: string;
  onSearchChange: (value: string) => void;
  activeView: string;
  onViewChange: (view: string) => void;
  recentViews: RecentView[];
  onViewDoc: (notebookId: string, docId: string) => void;
}

export const DocsSidebar: React.FC<DocsSidebarProps> = ({
  searchText,
  onSearchChange,
  activeView,
  onViewChange,
  onViewDoc,
}) => {
  const { notebooks, activeNotebookId, activeDocId, toggleFavorite } = useNotesStore();
  const { handleRename, handleMove, handleDelete, handleCopy, handleCopyLink, handlePin, handleExport } = useDocActions();
  
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; docId: string } | null>(null);
  const [renameDocId, setRenameDocId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState('');

  const activeNotebook = useMemo(
    () => notebooks.find((nb) => nb.id === activeNotebookId) ?? null,
    [activeNotebookId, notebooks]
  );

  const favoriteDocs = useMemo(() => {
    const favorites: { notebook: Notebook; doc: NoteDoc }[] = [];
    notebooks.forEach((notebook) => {
      notebook.docs.forEach((doc) => {
        if (doc.favorite) {
          favorites.push({ notebook, doc });
        }
      });
    });
    return favorites.sort(
      (a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime()
    );
  }, [notebooks]);

  const docDepthMap = useMemo(() => {
    if (!activeNotebook) return new Map<string, number>();
    const map = new Map<string, number>();
    const lookup = new Map(activeNotebook.docs.map((doc) => [doc.id, doc]));
    const depthFor = (doc: NoteDoc, seen = new Set<string>()): number => {
      if (!doc.parentId || !lookup.get(doc.parentId) || seen.has(doc.parentId)) return 0;
      const parent = lookup.get(doc.parentId);
      if (!parent) return 0;
      seen.add(doc.parentId);
      return 1 + depthFor(parent, seen);
    };
    activeNotebook.docs.forEach((doc) => {
      map.set(doc.id, depthFor(doc));
    });
    return map;
  }, [activeNotebook]);

  const searchResultDocs = useMemo(() => {
    if (!activeNotebook || !searchText.trim()) return activeNotebook?.docs || [];
    const keyword = searchText.trim().toLowerCase();
    return activeNotebook.docs.filter((doc) => {
      const haystack = `${doc.title} ${doc.content} ${doc.tags.join(' ')}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [activeNotebook, searchText]);

  const handleContextMenu = (e: React.MouseEvent, docId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, docId });
  };

  const handleRenameStart = (docId: string, title: string) => {
    setRenameDocId(docId);
    setRenameInput(title);
    setContextMenu(null);
  };

  const handleRenameConfirm = () => {
    if (renameDocId && renameInput.trim()) {
      handleRename(renameDocId, renameInput);
    }
    setRenameDocId(null);
    setRenameInput('');
  };

  const handleRenameCancel = () => {
    setRenameDocId(null);
    setRenameInput('');
  };

  const renderDocItem = (doc: NoteDoc, notebookId: string) => {
    const isRenaming = renameDocId === doc.id;
    const depth = docDepthMap.get(doc.id) ?? 0;

    if (isRenaming) {
      return (
        <div key={doc.id} className="doc-item">
          <input
            type="text"
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameConfirm();
              if (e.key === 'Escape') handleRenameCancel();
            }}
            autoFocus
          />
        </div>
      );
    }

    return (
      <button
        key={doc.id}
        className={`doc-item ${activeDocId === doc.id ? 'active' : ''}`}
        onClick={() => onViewDoc(notebookId, doc.id)}
        onContextMenu={(e) => handleContextMenu(e, doc.id)}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        <span className="doc-icon">📄</span>
        <span className="doc-name">{doc.title}</span>
        {doc.favorite && <span className="doc-favorite">⭐</span>}
        {doc.pinned && <span className="doc-pinned">📌</span>}
      </button>
    );
  };

  return (
    <aside className="docs-sidebar">
      <div className="docs-header">
        <div className="docs-title-row">
          <span className="docs-icon">📁</span>
          <span className="docs-title">{activeNotebook?.title || '知识库'}</span>
          <button
            className="btn-add-doc"
            onClick={() => activeNotebook && useNotesStore.getState().createDoc(activeNotebook.id, null)}
            title="新建文档"
          >
            +
          </button>
        </div>
      </div>

      <div className="docs-search">
        <input
          className="search-input"
          placeholder="搜索文档"
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <div className="docs-nav">
        <button
          className={`docs-nav-item ${activeView === 'notebooks' ? 'active' : ''}`}
          onClick={() => onViewChange('notebooks')}
        >
          <span className="docs-nav-icon">📄</span>
          <span className="docs-nav-text">全部文档</span>
          <span className="docs-nav-count">{activeNotebook?.docs.length || 0}</span>
        </button>
        <button
          className={`docs-nav-item ${activeView === 'favorite' ? 'active' : ''}`}
          onClick={() => onViewChange('favorite')}
        >
          <span className="docs-nav-icon">⭐</span>
          <span className="docs-nav-text">收藏</span>
          <span className="docs-nav-count">{favoriteDocs.length}</span>
        </button>
      </div>

      <div className="docs-list">
        {activeView === 'favorite' ? (
          favoriteDocs.length === 0 ? (
            <div className="empty-favorite">
              <span className="empty-icon">⭐</span>
              <span className="empty-text">暂无收藏</span>
            </div>
          ) : (
            favoriteDocs.map(({ notebook, doc }) => (
              <button
                key={doc.id}
                className={`doc-item ${activeDocId === doc.id ? 'active' : ''}`}
                onClick={() => onViewDoc(notebook.id, doc.id)}
                onContextMenu={(e) => handleContextMenu(e, doc.id)}
              >
                <span className="doc-icon">📄</span>
                <span className="doc-name">{doc.title}</span>
                <span className="doc-favorite">⭐</span>
                <button
                  className="favorite-item-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(notebook.id, doc.id);
                  }}
                >
                  ×
                </button>
              </button>
            ))
          )
        ) : (
          searchResultDocs.map((doc) => renderDocItem(doc, activeNotebookId))
        )}
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={() => setContextMenu(null)}
        >
          <button onClick={() => handleRenameStart(contextMenu.docId, notebooks.find(nb => nb.docs.some(d => d.id === contextMenu.docId))?.docs.find(d => d.id === contextMenu.docId)?.title || '')}>
            重命名
          </button>
          <button onClick={() => handleMove(contextMenu.docId, null)}>
            移动到...
          </button>
          <button onClick={() => handleCopy(contextMenu.docId)}>
            复制
          </button>
          <button onClick={() => handleCopyLink(contextMenu.docId)}>
            复制链接
          </button>
          <button onClick={() => handlePin(contextMenu.docId)}>
            {notebooks.find(nb => nb.docs.some(d => d.id === contextMenu.docId))?.docs.find(d => d.id === contextMenu.docId)?.pinned ? '取消固定' : '固定'}
          </button>
          <button onClick={() => handleExport(contextMenu.docId)}>
            导出
          </button>
          <button onClick={() => handleDelete(contextMenu.docId)} className="danger">
            删除
          </button>
        </div>
      )}
    </aside>
  );
};