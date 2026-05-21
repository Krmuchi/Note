import { useCallback } from 'react';
import { useNotesStore } from '../store/notesStore';


export const useDocActions = () => {
  const { notebooks, updateDoc, moveDocToTrash, createDoc, toggleFavorite } = useNotesStore();

  const handleRename = useCallback((docId: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (notebook) {
      updateDoc(notebook.id, docId, { title: newTitle.trim() });
    }
  }, [notebooks, updateDoc]);

  const handleMove = useCallback((docId: string, targetId: string | null) => {
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (notebook) {
      updateDoc(notebook.id, docId, { parentId: targetId });
    }
  }, [notebooks, updateDoc]);

  const handleDelete = useCallback((docId: string) => {
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (notebook) {
      moveDocToTrash(notebook.id, docId);
    }
  }, [notebooks, moveDocToTrash]);

  const handleCopy = useCallback((docId: string) => {
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (!notebook) return;
    
    const doc = notebook.docs.find(d => d.id === docId);
    if (!doc) return;
    
    createDoc(notebook.id, doc.parentId, {
      title: `${doc.title || '未命名文档'} (副本)`,
      content: doc.content,
      tags: doc.tags,
    });
  }, [notebooks, createDoc]);

  const handleCopyLink = useCallback((docId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/doc/${docId}`);
  }, []);

  const handlePin = useCallback((docId: string) => {
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (!notebook) return;
    
    const doc = notebook.docs.find(d => d.id === docId);
    if (!doc) return;
    
    updateDoc(notebook.id, docId, { pinned: !doc.pinned });
  }, [notebooks, updateDoc]);

  const handleExport = useCallback((docId: string) => {
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (!notebook) return;
    
    const doc = notebook.docs.find(d => d.id === docId);
    if (!doc) return;
    
    const content = `# ${doc.title || '未命名文档'}\n\n${doc.content || ''}`;
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${doc.title || '未命名文档'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [notebooks]);

  const handleToggleFavorite = useCallback((docId: string) => {
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (notebook) {
      toggleFavorite(notebook.id, docId);
    }
  }, [notebooks, toggleFavorite]);

  const handleRemoveFromDirectory = useCallback((docId: string) => {
    const notebook = notebooks.find(nb => nb.docs.some(d => d.id === docId));
    if (notebook) {
      updateDoc(notebook.id, docId, { parentId: null });
    }
  }, [notebooks, updateDoc]);

  return {
    handleRename,
    handleMove,
    handleDelete,
    handleCopy,
    handleCopyLink,
    handlePin,
    handleExport,
    handleToggleFavorite,
    handleRemoveFromDirectory,
  };
};