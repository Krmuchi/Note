import { useState, useEffect } from 'react';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  isOpen: boolean;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ isOpen, message, confirmText = '确认', cancelText = '取消', danger = false, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog isOpen={isOpen} onClose={onCancel} title="确认操作">
      <p className="confirm-message">{message}</p>
      <div className="confirm-actions">
        <button className="confirm-btn cancel" onClick={onCancel}>{cancelText}</button>
        <button className={`confirm-btn ${danger ? 'danger' : 'primary'}`} onClick={onConfirm}>{confirmText}</button>
      </div>
    </Dialog>
  );
}

interface PromptDialogProps {
  isOpen: boolean;
  title: string;
  defaultValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({ isOpen, title, defaultValue = '', placeholder = '', onConfirm, onCancel }: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) setValue(defaultValue);
  }, [isOpen, defaultValue]);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      footer={
        <div className="confirm-actions">
          <button className="confirm-btn cancel" onClick={onCancel}>取消</button>
          <button className="confirm-btn primary" onClick={() => onConfirm(value)} disabled={!value.trim()}>确认</button>
        </div>
      }
    >
      <input
        type="text"
        className="prompt-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) onConfirm(value);
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
      />
    </Dialog>
  );
}