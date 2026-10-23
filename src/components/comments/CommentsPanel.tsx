import React, { useState, useCallback } from 'react';
import type { Comment, CommentAnchor } from '@/types';
import { formatDateTime } from '@/utils/formatters';
import { EmptyState } from '@/components/common/EmptyState';
import { resolveAnchor } from '@/utils/commentAnchor';
import { IconComment, IconUser } from '@/components/common/Icon';

interface CommentsPanelProps {
  comments: Comment[];
  docId: string;
  /** 新评论；anchor 存在表示这是一条划词评论 */
  onAddComment: (docId: string, content: string, anchor?: CommentAnchor) => void;
  onDeleteComment: (docId: string, commentId: string) => void;
  onAddReply?: (docId: string, commentId: string, content: string) => void;
  isOpen: boolean;
  onClose: () => void;
  /**
   * 待评论的选区（划词评论）。设置后面板顶部显示引用片段，
   * 提交时随评论一起保存为锚点。
   */
  pendingAnchor?: CommentAnchor | null;
  /** 取消待评论选区 */
  onCancelPendingAnchor?: () => void;
  /** 正文当前内容：用于校验锚点是否仍然有效（编辑后区间会漂移） */
  docContent?: string;
  /** 点击评论引用片段时跳到对应正文位置 */
  onJumpToAnchor?: (start: number, end: number) => void;
}

export const CommentsPanel: React.FC<CommentsPanelProps> = ({
  comments,
  docId,
  onAddComment,
  onDeleteComment,
  onAddReply,
  isOpen,
  onClose,
  pendingAnchor = null,
  onCancelPendingAnchor,
  docContent = '',
  onJumpToAnchor,
}) => {
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      // 没有锚点时只传两个参数：保持与旧调用方/既有测试的签名兼容
      if (pendingAnchor) onAddComment(docId, newComment.trim(), pendingAnchor);
      else onAddComment(docId, newComment.trim());
      setNewComment('');
      // 提交后清掉待评论选区，避免下一条评论被同一个锚点"粘住"
      onCancelPendingAnchor?.();
    }
  }, [newComment, docId, onAddComment, pendingAnchor, onCancelPendingAnchor]);

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
        <h3 className="comments-title"><IconComment size={16} /> 评论 ({comments.length})</h3>
        <button className="comments-close-btn" onClick={onClose}>
          ✕
        </button>
      </div>
      
      <div className="comments-content">
        {comments.length === 0 ? (
          /* 用统一空态组件：图标/标题/说明/操作的结构在各面板保持一致（V1） */
          <EmptyState
            icon={<IconComment size={32} />}
            title="暂无评论"
            description="选中正文中的文字可以就某段内容评论，也可以直接写第一条"
          />
        ) : (
          <div className="comments-list">
            {comments.map((comment) => (
              <div key={comment.id} className="comment-item">
                <div className="comment-header">
                  <span className="comment-author">
                    <span className="author-avatar"><IconUser size={14} /></span>
                    <span className="author-name">{comment.author}</span>
                  </span>
                  <span className="comment-time">{formatDate(comment.createdAt)}</span>
                </div>
                {/*
                  划词评论显示被选中的原文。锚点可能因后续编辑漂移，
                  这里用 resolveAnchor 重新定位：能找到就显示引用片段并可点击跳转，
                  找不到就不显示引用（退化成文档级评论），避免指向错误位置。
                */}
                {comment.anchor && (() => {
                  const resolved = resolveAnchor(docContent, comment.anchor)
                  if (!resolved) return null
                  return (
                    <button
                      type="button"
                      className={`comment-quote ${resolved.exact ? '' : 'comment-quote-moved'}`}
                      title={
                        resolved.exact
                          ? '点击跳转到原文位置'
                          : '原文已移动，锚点已自动重新定位'
                      }
                      onClick={() => onJumpToAnchor?.(resolved.start, resolved.end)}
                    >
                      {resolved.quote}
                    </button>
                  )
                })()}
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
                            <span className="author-avatar"><IconUser size={14} /></span>
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
        {/* 待评论选区：让用户明确知道这条评论将挂在哪段文字上 */}
        {pendingAnchor && (
          <div className="comment-pending-quote">
            <span className="comment-pending-label">评论选中内容</span>
            <span className="comment-pending-text">{pendingAnchor.quote}</span>
            <button
              type="button"
              className="comment-pending-cancel"
              onClick={onCancelPendingAnchor}
              aria-label="取消选中内容"
              title="改为文档级评论"
            >
              ×
            </button>
          </div>
        )}
        <textarea
          className="comment-input"
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder={pendingAnchor ? '针对选中内容写评论…' : '写下你的评论...'}
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