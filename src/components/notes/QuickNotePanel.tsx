import { useState, useCallback, useEffect } from 'react';
import { useNotesStore } from '@/store';
import { modKey } from '@/utils/platform';
import { formatDateTime } from '@/utils/formatters';
import { EmptyState } from '@/components/common/EmptyState';

export default function QuickNotePanel(): import('react').ReactElement {
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
        <h2 className="quick-note-title">📝 小记</h2>
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
            icon="📝"
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
                      <button className="quick-note-action-btn" onClick={() => handleStartEdit(note)} title="编辑">✏️</button>
                      <button className="quick-note-action-btn" onClick={() => handleDelete(note.id)} title="删除">🗑️</button>
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