import React, { useState, useCallback } from 'react';
import type { Comment } from '@/types';
import { formatDateTime } from '@/utils/formatters';

interface CommentsPanelProps {
  comments: Comment[];
  docId: string;
  onAddComment: (docId: string, content: string) => void;
  onDeleteComment: (docId: string, commentId: string) => void;
  onAddReply?: (docId: string, commentId: string, content: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const CommentsPanel: React.FC<CommentsPanelProps> = ({
  comments,
  docId,
  onAddComment,
  onDeleteComment,
  onAddReply,
  isOpen,
  onClose,
}) => {
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      onAddComment(docId, newComment.trim());
      setNewComment('');
    }
  }, [newComment, docId, onAddComment]);

  const handleReplySubmit = useCallback((commentId: string) => {
    if (replyContent.trim() && onAddReply) {
      onAddReply(docId, commentId, replyContent.trim());
      setReplyContent('');
      setReplyingTo(null);
    }
  }, [replyContent, docId, onAddReply]);

  const formatDate = (dateString: string): string => formatDateTime(dateString);

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
                  {onAddReply && (
                    <button
                      className="comment-action-btn reply-btn"
                      onClick={() => {
                        setReplyingTo(replyingTo === comment.id ? null : comment.id);
                        setReplyContent('');
                      }}
                    >
                      回复
                    </button>
                  )}
                  <button className="comment-action-btn" onClick={() => onDeleteComment(docId, comment.id)}>
                    删除
                  </button>
                </div>

                {/* 显示回复列表 */}
                {comment.replies && comment.replies.length > 0 && (
                  <div className="comment-replies">
                    {comment.replies.map((reply) => (
                      <div key={reply.id} className="reply-item">
                        <div className="reply-header">
                          <span className="reply-author">
                            <span className="author-avatar">👤</span>
                            <span className="author-name">{reply.author}</span>
                          </span>
                          <span className="reply-time">{formatDate(reply.createdAt)}</span>
                        </div>
                        <div className="reply-content">{reply.content}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 回复输入框 */}
                {replyingTo === comment.id && (
                  <div className="reply-form">
                    <textarea
                      className="reply-input"
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="写下你的回复..."
                      rows={2}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          handleReplySubmit(comment.id);
                        }
                        if (e.key === 'Escape') {
                          setReplyingTo(null);
                        }
                      }}
                    />
                    <div className="reply-form-actions">
                      <button className="reply-cancel-btn" onClick={() => setReplyingTo(null)}>
                        取消
                      </button>
                      <button
                        className="reply-submit-btn"
                        onClick={() => handleReplySubmit(comment.id)}
                        disabled={!replyContent.trim()}
                      >
                        回复
                      </button>
                    </div>
                  </div>
                )}
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