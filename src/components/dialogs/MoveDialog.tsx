import React from 'react';
import { useNotesStore } from '../../store/notesStore';

interface MoveDialogProps {
  docId: string;
  docTitle: string;
  onConfirm: (targetId: string | null) => void;
  onCancel: () => void;
}

export const MoveDialog: React.FC<MoveDialogProps> = ({
  docId,
  docTitle,
  onConfirm,
  onCancel,
}) => {
  const { notebooks, activeNotebookId } = useNotesStore();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const activeNotebook = notebooks.find((nb) => nb.id === activeNotebookId);
  if (!activeNotebook) return null;

  const otherDocs = activeNotebook.docs.filter((d) => d.id !== docId);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content move-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>移动文档</h3>
        </div>
        <div className="modal-body">
          <p>将 "{docTitle}" 移动到：</p>
          <div className="move-options">
            <button
              className={`move-option ${selectedId === null ? 'selected' : ''}`}
              onClick={() => setSelectedId(null)}
            >
              根目录
            </button>
            {otherDocs.map((doc) => (
              <button
                key={doc.id}
                className={`move-option ${selectedId === doc.id ? 'selected' : ''}`}
                onClick={() => setSelectedId(doc.id)}
              >
                {doc.title}
              </button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => onConfirm(selectedId)}>
            确定
          </button>
        </div>
      </div>
    </div>
  );
};