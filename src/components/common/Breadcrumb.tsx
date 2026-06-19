import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNotesStore } from '@/store';

export const Breadcrumb: React.FC = () => {
  const { notebooks, activeNotebookId, activeDocId } = useNotesStore(useShallow((s) => ({
    notebooks: s.notebooks,
    activeNotebookId: s.activeNotebookId,
    activeDocId: s.activeDocId,
  })));

  const notebook = notebooks.find(nb => nb.id === activeNotebookId);
  const doc = notebook?.docs.find(d => d.id === activeDocId);

  if (!notebook) return null;

  const buildPath = (): { label: string; docId?: string }[] => {
    const path: { label: string; docId?: string }[] = [
      { label: notebook!.title },
    ];

    if (doc) {
      const chain: { label: string; docId: string }[] = [];
      let current = doc;
      chain.unshift({ label: current.title, docId: current.id });

      while (current.parentId) {
        const parent = notebook!.docs.find(d => d.id === current.parentId);
        if (!parent) break;
        chain.unshift({ label: parent.title, docId: parent.id });
        current = parent;
      }

      path.push(...chain);
    }

    return path;
  };

  const pathItems = buildPath();

  return (
    <nav className="breadcrumb" aria-label="文档路径">
      {pathItems.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="breadcrumb-separator">/</span>}
          <span
            className={`breadcrumb-item ${index === pathItems.length - 1 ? 'active' : ''}`}
            onClick={() => {
              if (item.docId) {
                useNotesStore.getState().setActiveDocId(item.docId);
              }
            }}
            role={item.docId ? 'button' : undefined}
            tabIndex={item.docId ? 0 : undefined}
          >
            {item.label}
          </span>
        </React.Fragment>
      ))}
    </nav>
  );
};