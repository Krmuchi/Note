import React, { useState, useCallback } from 'react';
import type { Comment } from '@/types';

interface CommentsPanelProps {
  comments: Comment[];
  docId: string;
  onAddComment: (docId: string, content: string) => void;
  onDeleteComment: (docId: string, commentId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const CommentsPanel: React.FC<CommentsPanelProps> = ({
  comments,
  docId,
  onAddComment,
  onDeleteComment,
  isOpen,
  onClose,
}) => {
  const [newComment, setNewComment] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      onAddComment(docId, newComment.trim());
      setNewComment('');
    }
  }, [newComment, docId, onAddComment]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) {
      return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return '昨天';
    } else if (days < 7) {
      return `${days}天前`;
    } else {
      return date.toLocaleDateString('zh-CN');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="comments-panel">
      <div className="comments-header">
        <h3 className="comments-title">💬 评论 ({comments.length})</h3>
        <button className="comments-close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      
      <div className="comments-content">
        {comments.length === 0 ? (
          <div className="empty-comments">
            <span className="empty-icon">💬</span>
            <span className="empty-text">暂无评论</span>
            <span className="empty-hint">发表第一条评论吧</span>
          </div>
        ) : (
          <div className="comments-list">
            {comments.map((comment) => (
              <div key={comment.id} className="comment-item">
                <div className="comment-header">
                  <span className="comment-author">
                    <span className="author-avatar">👤</span>
                    <span className="author-name">{comment.author}</span>
                  </span>
                  <span className="comment-time">{formatDate(comment.createdAt)}</span>
                </div>
                <div className="comment-content">{comment.content}</div>
                <div className="comment-actions">
                  <button className="comment-action-btn" onClick={() => onDeleteComment(docId, comment.id)}>
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <form className="comment-form" onSubmit={handleSubmit}>
        <textarea
          className="comment-input"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="写下你的评论..."
          rows={3}
        />
        <div className="comment-form-actions">
          <button type="submit" className="comment-submit-btn">
            发表评论
          </button>
        </div>
      </form>
    </div>
  );
};