import { useState } from 'react';
import { Dialog } from './Dialog';

interface LinkDialogProps {
  isOpen: boolean;
  onConfirm: (url: string, text: string) => void;
  onCancel: () => void;
}

export function LinkDialog({ isOpen, onConfirm, onCancel }: LinkDialogProps) {
  const [url, setUrl] = useState('https://');
  const [text, setText] = useState('');

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onCancel}
      title="插入链接"
      footer={
        <div className="confirm-actions">
          <button className="confirm-btn cancel" onClick={onCancel}>取消</button>
          <button
            className="confirm-btn primary"
            onClick={() => onConfirm(url, text)}
            disabled={!url.trim()}
          >
            确认
          </button>
        </div>
      }
    >
      <div className="link-dialog">
        <div className="form-group">
          <label>URL</label>
          <input
            type="url"
            className="prompt-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label>显示文本</label>
          <input
            type="text"
            className="prompt-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="链接文本"
          />
        </div>
      </div>
    </Dialog>
  );
}