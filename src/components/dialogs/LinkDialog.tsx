import React, { useEffect, useRef, useState } from 'react';

interface LinkDialogProps {
  /** 打开弹窗时编辑器选中的文本，作为链接文本初始值 */
  initialText: string;
  onConfirm: (text: string, url: string) => void;
  onCancel: () => void;
}

/**
 * 插入链接弹窗（样式复用 index.css 的 .confirm-dialog-*，附加 .link-dialog-*）。
 * Esc 关闭等同取消；URL 为空时禁用"插入"。
 */
export const LinkDialog: React.FC<LinkDialogProps> = ({ initialText, onConfirm, onCancel }) => {
  const [text, setText] = useState(initialText);
  const [url, setUrl] = useState('');
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    urlRef.current?.focus();

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      // capture 阶段拦截并阻断全局 useKeyboard 的 Escape（避免一次 Esc 同时关掉背后的面板）
      e.stopImmediatePropagation();
      e.preventDefault();
      onCancel();
    };
    // capture：先于 window 上的 bubble 监听器（useKeyboard）执行
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [onCancel]);

  const submit = (): void => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;
    onConfirm(text.trim() || trimmedUrl, trimmedUrl);
  };

  return (
    <div
      className="confirm-dialog-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="插入链接"
    >
      <div className="confirm-dialog link-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-dialog-header">
          <h3>插入链接</h3>
        </div>
        <div className="link-dialog-field">
          <label htmlFor="link-dialog-text">文本</label>
          <input
            id="link-dialog-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="链接显示的文本"
          />
        </div>
        <div className="link-dialog-field">
          <label htmlFor="link-dialog-url">地址</label>
          <input
            ref={urlRef}
            id="link-dialog-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="https://example.com"
          />
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="btn-primary" onClick={submit} disabled={!url.trim()}>
            插入
          </button>
        </div>
      </div>
    </div>
  );
};

export default LinkDialog;
