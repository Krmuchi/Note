import { useState } from 'react';
import { Dialog } from './Dialog';

interface MoveDialogProps {
  isOpen: boolean;
  docTitle: string;
  options: { id: string; label: string; depth: number }[];
  onMove: (targetId: string | null) => void;
  onCancel: () => void;
}

export function MoveDialog({ isOpen, docTitle, options, onMove, onCancel }: MoveDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title="移动文档"
      footer={
        <div className="confirm-actions">
          <button className="confirm-btn cancel" onClick={onCancel}>取消</button>
          <button className="confirm-btn primary" onClick={() => onMove(selectedId)} disabled={selectedId === undefined && selectedId !== null}>确认移动</button>
        </div>
      }
    >
      <p className="move-hint">将「{docTitle}」移动到指定位置：</p>
      <div className="move-tree">
        <button
          className={`move-option ${selectedId === null ? 'selected' : ''}`}
          onClick={() => setSelectedId(null)}
        >
          <span className="move-option-label">根目录</span>
        </button>
        {options.map((opt) => (
          <button
            key={opt.id}
            className={`move-option ${selectedId === opt.id ? 'selected' : ''}`}
            style={{ paddingLeft: `${opt.depth * 16 + 16}px` }}
            onClick={() => setSelectedId(opt.id)}
          >
            <span className="move-option-icon">📄</span>
            <span className="move-option-label">{opt.label}</span>
          </button>
        ))}
      </div>
    </Dialog>
  );
}