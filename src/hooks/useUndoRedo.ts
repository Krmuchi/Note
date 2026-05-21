import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNotesStore } from '../store/notesStore';

interface DocSnapshot {
  title: string;
  content: string;
  tags: string[];
  time?: number;
}

const historyLimit = 200;
const mergeWindow = 1000;

export const useUndoRedo = () => {
  const [pastSnapshots, setPastSnapshots] = useState<DocSnapshot[]>([]);
  const [futureSnapshots, setFutureSnapshots] = useState<DocSnapshot[]>([]);
  
  const pastSnapshotsRef = useRef(pastSnapshots);
  const futureSnapshotsRef = useRef(futureSnapshots);
  const lastHistoryAtRef = useRef<number>(0);
  
  const { activeNotebookId, activeDocId, notebooks, updateDoc } = useNotesStore();
  const activeDoc = useMemo(() => {
    const notebook = notebooks.find(nb => nb.id === activeNotebookId);
    return notebook?.docs.find(doc => doc.id === activeDocId) || null;
  }, [notebooks, activeNotebookId, activeDocId]);
  
  useEffect(() => { pastSnapshotsRef.current = pastSnapshots; }, [pastSnapshots]);
  useEffect(() => { futureSnapshotsRef.current = futureSnapshots; }, [futureSnapshots]);

  const canUndo = pastSnapshotsRef.current.length > 0;
  const canRedo = futureSnapshotsRef.current.length > 0;

  const undo = useCallback(() => {
    const doc = activeDoc;
    if (!doc || !canUndo) return;
    
    const prev = pastSnapshotsRef.current[pastSnapshotsRef.current.length - 1];
    setPastSnapshots((p) => p.slice(0, p.length - 1));
    setFutureSnapshots((f) => [...f, { title: doc.title ?? "", content: doc.content ?? "", tags: doc.tags ?? [] }]);
    updateDoc(activeNotebookId, doc.id, { title: prev.title, content: prev.content, tags: prev.tags });
  }, [activeDoc, activeNotebookId, updateDoc, canUndo]);

  const redo = useCallback(() => {
    const doc = activeDoc;
    if (!doc || !canRedo) return;
    
    const next = futureSnapshotsRef.current[futureSnapshotsRef.current.length - 1];
    setFutureSnapshots((f) => f.slice(0, f.length - 1));
    setPastSnapshots((p) => [...p, { title: doc.title ?? "", content: doc.content ?? "", tags: doc.tags ?? [] }]);
    updateDoc(activeNotebookId, doc.id, { title: next.title, content: next.content, tags: next.tags });
  }, [activeDoc, activeNotebookId, updateDoc, canRedo]);

  const recordSnapshot = useCallback((doc: { title?: string; content?: string; tags?: string[] }) => {
    const now = Date.now();
    const last = lastHistoryAtRef.current;
    
    const snapshot: DocSnapshot = {
      title: doc.title ?? "",
      content: doc.content ?? "",
      tags: doc.tags ?? [],
      time: now,
    };

    if (now - last > mergeWindow) {
      setPastSnapshots((p) => {
        const next = [...p, snapshot];
        if (next.length > historyLimit) return next.slice(next.length - historyLimit);
        return next;
      });
      setFutureSnapshots([]);
      lastHistoryAtRef.current = now;
    } else {
      lastHistoryAtRef.current = now;
    }
  }, []);

  return { undo, redo, canUndo, canRedo, recordSnapshot };
};