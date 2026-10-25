import '@/styles/quick-note.css';
import { useState, useCallback, useEffect } from 'react';
import type { JSX } from 'react';
import { useNotesStore } from '@/store';
import { modKey } from '@/utils/platform';
import { formatDateTime } from '@/utils/formatters';
import { EmptyState } from '@/components/common/EmptyState';
import { IconLightbulb } from '@/components/common/Icon';

export default function QuickNotePanel(): JSX.Element {
  const tags = useNotesStore(s => s.tags);
  const quickNotes = useNotesStore(s => s.quickNotes);
  const addQuickNote = useNotesStore(s => s.addQuickNote);
  const updateQuickNote = useNotesStore(s => s.updateQuickNote);
  const deleteQuickNote = useNotesStore(s => s.deleteQuickNote);
  const loadQuickNotes = useNotesStore(s => s.loadQuickNotes);

  const [inputValue, setInputValue] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  // 加载快捷笔记
  useEffect(() => {
    loadQuickNotes();
  }, [loadQuickNotes]);

  const handleAdd = useCallback(() => {
    if (!inputValue.trim()) return;
    addQuickNote(inputValue.trim(), selectedTags);
    setInputValue('');
    setSelectedTags([]);
  }, [inputValue, selectedTags, addQuickNote]);

  const handleDelete = useCallback((id: string) => {
    deleteQuickNote(id);
  }, [deleteQuickNote]);

  const handleStartEdit = useCallback((note: { id: string; content: string }) => {
    setEditingId(note.id);
    setEditingContent(note.content);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editingContent.trim()) return;
    updateQuickNote(editingId, editingContent.trim());
    setEditingId(null);
    setEditingContent('');
  }, [editingId, editingContent, updateQuickNote]);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    );
  }, []);

  const formatTime = (dateStr: string): string =>
    formatDateTime(dateStr, { prefixToday: true });

  return (
    <div className="quick-note-panel">
      <div className="quick-note-header">
        <h2 className="quick-note-title"><IconLightbulb size={16} /> 小记</h2>
        <p className="quick-note-subtitle">快速记录想法、灵感、待办事项</p>
      </div>

      <div className="quick-note-input-area">
        <textarea
          className="quick-note-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder={`记点什么... (${modKey}+Enter 保存)`}
          rows={3}
        />
        <div className="quick-note-input-footer">
          <div className="quick-note-tags-select">
            {tags.slice(0, 8).map(tag => (
              <button
                key={tag.id}
                className={`quick-note-tag-chip ${selectedTags.includes(tag.id) ? 'selected' : ''}`}
                onClick={() => toggleTag(tag.id)}
                style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color + '30', borderColor: tag.color, color: tag.color } : undefined}
              >
                {tag.icon} {tag.name}
              </button>
            ))}
          </div>
          <button
            className="quick-note-add-btn"
            onClick={handleAdd}
            disabled={!inputValue.trim()}
          >
            保存
          </button>
        </div>
      </div>

      <div className="quick-note-list">
        {quickNotes.length === 0 ? (
          <EmptyState
            icon={<IconLightbulb size={32} />}
            title="还没有小记"
            description="快速记录想法、灵感、待办事项"
          />
        ) : (
          quickNotes.map(note => (
            <div key={note.id} className="quick-note-item">
              {editingId === note.id ? (
                <div className="quick-note-edit">
                  <textarea
                    className="quick-note-edit-input"
                    value={editingContent}
                    onChange={(e) => setEditingContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        handleSaveEdit();
                      }
                      if (e.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                    rows={3}
                    autoFocus
                  />
                  <div className="quick-note-edit-actions">
                    <button className="quick-note-edit-save" onClick={handleSaveEdit}>保存</button>
                    <button className="quick-note-edit-cancel" onClick={() => setEditingId(null)}>取消</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="quick-note-item-content">{note.content}</div>
                  <div className="quick-note-item-meta">
                    <div className="quick-note-item-tags">
                      {note.tags.map(tagId => {
                        const tag = tags.find(t => t.id === tagId);
                        return tag ? (
                          <span key={tag.id} className="quick-note-item-tag" style={{ backgroundColor: tag.color + '30', color: tag.color }}>
                            {tag.icon} {tag.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                    <span className="quick-note-item-time">{formatTime(note.updatedAt)}</span>
                    <div className="quick-note-item-actions">
                      {/* 交互按钮统一用 SVG（V2）：emoji 保留在空态/菜单等装饰位，按钮上不混用 */}
                      <button className="quick-note-action-btn" onClick={() => handleStartEdit(note)} title="编辑" aria-label="编辑便签">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button className="quick-note-action-btn danger" onClick={() => handleDelete(note.id)} title="删除" aria-label="删除便签">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}