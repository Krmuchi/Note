import { useState, useRef, useCallback } from 'react';
import type { NoteDoc, Notebook } from '@/types';

export type DragPosition = 'before' | 'after' | 'inside';

/** 判断 docId 是否为 ancestorId 的后代（沿 parentId 链向上走，带环防御） */
function isDescendant(docs: NoteDoc[], ancestorId: string, docId: string): boolean {
  let current = docs.find(d => d.id === docId);
  const seen = new Set<string>([docId]);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    if (seen.has(current.parentId)) break;
    seen.add(current.parentId);
    current = docs.find(d => d.id === current!.parentId);
  }
  return false;
}

interface UseDocTreeDragOptions {
  activeNotebook: Notebook | null;
  activeNotebookId: string | null;
  updateDoc: (notebookId: string, docId: string, updates: Partial<NoteDoc>) => void;
  reorderDocs: (notebookId: string, fromIndex: number, toIndex: number, parentId?: string | null) => void;
  onExpandDoc: (docId: string) => void;
}

export function useDocTreeDrag({
  activeNotebook,
  activeNotebookId,
  updateDoc,
  reorderDocs,
  onExpandDoc,
}: UseDocTreeDragOptions): {
  dragOverDocId: string | null
  dragOverPosition: DragPosition | null
  handleDragStart: (e: React.DragEvent, docId: string) => void
  handleDragEnd: (e: React.DragEvent) => void
  handleDragOver: (e: React.DragEvent, docId: string) => void
  handleDragLeave: () => void
  handleDrop: (e: React.DragEvent, targetDocId: string) => void
} {
  const [dragOverDocId, setDragOverDocId] = useState<string | null>(null);
  const [dragOverPosition, setDragOverPosition] = useState<DragPosition | null>(null);
  const draggedDocIdRef = useRef<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, docId: string) => {
    draggedDocIdRef.current = docId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', docId);
    const target = e.currentTarget as HTMLElement;
    target.classList.add('dragging');
  }, []);

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    const target = e.currentTarget as HTMLElement;
    target.classList.remove('dragging');
    draggedDocIdRef.current = null;
    setDragOverDocId(null);
    setDragOverPosition(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, docId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const height = rect.height;

    let position: DragPosition;
    if (y < height * 0.25) {
      position = 'before';
    } else if (y > height * 0.75) {
      position = 'after';
    } else {
      position = 'inside';
    }

    setDragOverDocId(docId);
    setDragOverPosition(position);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDocId(null);
    setDragOverPosition(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetDocId: string) => {
    e.preventDefault();
    const sourceDocId = draggedDocIdRef.current;
    if (!sourceDocId || sourceDocId === targetDocId || !activeNotebook || !activeNotebookId) {
      setDragOverDocId(null);
      setDragOverPosition(null);
      return;
    }

    const sourceDoc = activeNotebook.docs.find(d => d.id === sourceDocId);
    const targetDoc = activeNotebook.docs.find(d => d.id === targetDocId);
    if (!sourceDoc || !targetDoc) return;

    // 祖先环防御：不能把文档拖入自身或其后代（inside 直接成环；
    // before/after 落到后代同级也等于把目标父级设为后代，同样成环）
    if (dragOverPosition === 'inside') {
      if (isDescendant(activeNotebook.docs, sourceDocId, targetDocId)) {
        setDragOverDocId(null);
        setDragOverPosition(null);
        return;
      }
    } else {
      const newParentId = targetDoc.parentId;
      if (newParentId && (newParentId === sourceDocId || isDescendant(activeNotebook.docs, sourceDocId, newParentId))) {
        setDragOverDocId(null);
        setDragOverPosition(null);
        return;
      }
    }

    if (dragOverPosition === 'inside') {
      updateDoc(activeNotebookId, sourceDocId, { parentId: targetDocId });
      onExpandDoc(targetDocId);
    } else {
      const parentId = targetDoc.parentId;
      const siblings = activeNotebook.docs.filter(d => d.parentId === parentId);
      const fromIndex = siblings.findIndex(d => d.id === sourceDocId);
      let toIndex = siblings.findIndex(d => d.id === targetDocId);

      if (fromIndex === -1) {
        // 跨父级拖放：先按"更新后的父子关系"在本地算好目标索引，再更新 parentId + 重排。
        // 直接依赖更新后的 store 状态会读到渲染时的旧 props，导致重排静默失效
        const newSiblings = activeNotebook.docs.filter(d => d.parentId === parentId || d.id === sourceDocId);
        const newFromIndex = newSiblings.findIndex(d => d.id === sourceDocId);
        let newToIndex = newSiblings.findIndex(d => d.id === targetDocId);
        if (dragOverPosition === 'after') newToIndex++;
        if (newFromIndex < newToIndex) newToIndex--;

        updateDoc(activeNotebookId, sourceDocId, { parentId });
        if (newFromIndex !== -1 && newToIndex >= 0) {
          reorderDocs(activeNotebookId, newFromIndex, newToIndex, parentId);
        }
      } else {
        if (dragOverPosition === 'after') toIndex++;
        if (fromIndex < toIndex) toIndex--;
        reorderDocs(activeNotebookId, fromIndex, toIndex, parentId);
      }
    }

    setDragOverDocId(null);
    setDragOverPosition(null);
    draggedDocIdRef.current = null;
  }, [activeNotebook, activeNotebookId, dragOverPosition, updateDoc, reorderDocs, onExpandDoc]);

  return {
    dragOverDocId,
    dragOverPosition,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  };
}

export default useDocTreeDrag;
