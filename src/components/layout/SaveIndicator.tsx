import React from 'react';
import { useNotesStore } from '@/store';
import type { SaveStatus } from '@/store';
import { setLoadFailureMinimized } from '@/services/loadFailureUi';

/**
 * 侧栏底部的全局保存状态指示器。
 *
 * 为什么需要它：`saveStatus` 此前只显示在编辑器标题栏。用户停留在「开始 / 标签 / 回收站」
 * 这些没有编辑器的页面时，看不到数据到底有没有落盘 —— 而自动保存是 3 秒防抖，
 * 恰好是最需要一点反馈的时序。这里把它提升到常驻可见的位置。
 *
 * 只订阅 saveStatus / lastSavedAt 两个低频值，不参与击键链路。
 */
const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '',
  saving: '正在保存…',
  saved: '已保存',
  error: '保存失败',
};

function formatSavedAt(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

interface SaveIndicatorProps {
  /** 侧栏折叠时只留一个状态点，靠 title 提供完整信息 */
  collapsed: boolean;
}

export const SaveIndicator: React.FC<SaveIndicatorProps> = ({ collapsed }) => {
  const status = useNotesStore((s) => s.saveStatus);
  const lastSavedAt = useNotesStore((s) => s.lastSavedAt);
  const loadFailed = useNotesStore((s) => s.loadFailed);

  // idle 表示本次启动还没有任何变更，不需要占位
  if (status === 'idle') return null;

  const time = formatSavedAt(lastSavedAt);
  const detail =
    status === 'saved' && time
      ? `上次保存 ${time}`
      : STATUS_TEXT[status];

  // 加载失败是特殊态：saveNotes 被守卫拦截（保护磁盘数据），点「重试」不会有结果。
  // 此时指示器的职责是把用户带回恢复流程（LoadFailureDialog 可能被最小化了）。
  const title =
    status === 'error'
      ? loadFailed
        ? '数据加载失败，自动保存已暂停：点击打开恢复引导'
        : '保存失败：点击重试，或检查磁盘空间'
      : detail;

  const className = `save-indicator save-indicator-${status}${collapsed ? ' save-indicator-collapsed' : ''}`;

  if (status === 'error') {
    // 失败时必须可点击：停留在无编辑器页面时，这是唯一的补救入口
    return (
      <button
        type="button"
        className={className}
        title={title}
        aria-label={title}
        onClick={() => {
          if (loadFailed) {
            setLoadFailureMinimized(false);
            return;
          }
          void useNotesStore.getState().saveNotes();
        }}
      >
        <span className="save-indicator-dot" aria-hidden="true" />
        {!collapsed && (
          <span className="save-indicator-text">
            {loadFailed ? '数据加载失败 · 去处理' : '保存失败 · 重试'}
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={className} title={title} role="status" aria-live="polite">
      <span className="save-indicator-dot" aria-hidden="true" />
      {!collapsed && <span className="save-indicator-text">{detail}</span>}
    </div>
  );
};

export default SaveIndicator;
