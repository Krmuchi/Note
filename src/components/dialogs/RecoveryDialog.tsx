import React from 'react';

interface RecoveryDialogProps {
  timestamp: string;
  docTitle: string;
  onRecover: () => void;
  onDiscard: () => void;
}

export const RecoveryDialog: React.FC<RecoveryDialogProps> = ({
  timestamp,
  docTitle,
  onRecover,
  onDiscard,
}) => {
  return (
    <div className="modal-overlay">
      <div className="modal-content recovery-dialog">
        <div className="modal-header">
          <h3>检测到未保存的更改</h3>
        </div>
        <div className="modal-body">
          <p>我们检测到您有未保存的草稿，是否恢复？</p>
          <div className="recovery-info">
            <div className="recovery-item">
              <span className="recovery-label">文档：</span>
              <span className="recovery-value">{docTitle}</span>
            </div>
            <div className="recovery-item">
              <span className="recovery-label">保存时间：</span>
              <span className="recovery-value">{new Date(timestamp).toLocaleString()}</span>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onDiscard}>
            丢弃草稿
          </button>
          <button className="btn btn-primary" onClick={onRecover}>
            恢复草稿
          </button>
        </div>
      </div>
    </div>
  );
};