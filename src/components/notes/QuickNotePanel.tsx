import { useState, useCallback } from 'react';
import { useNotesStore } from '@/store';
import { newId } from '@/store/storeUtils';

interface QuickNote {
  id: string;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

const STORAGE_KEY = 'notes-quick-notes';

const loadQuickNotes = (): QuickNote[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return []
  }
};

const saveQuickNotes = (notes: QuickNote[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {
    // storage unavailable
  }
};

export default function QuickNotePanel() {
  const tags = useNotesStore(s => s.tags);
  const [notes, setNotes] = useState<QuickNote[]>(loadQuickNotes);
  const [inputValue, setInputValue] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');

  const persistNotes = useCallback((updated: QuickNote[]) => {
    setNotes(updated);
    saveQuickNotes(updated);
  }, []);

  const handleAdd = useCallback(() => {
    if (!inputValue.trim()) return;
    const newNote: QuickNote = {
      id: newId(),
      content: inputValue.trim(),
      tags: selectedTags,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const updated = [newNote, ...notes];
    persistNotes(updated);
    setInputValue('');
    setSelectedTags([]);
  }, [inputValue, selectedTags, notes, persistNotes]);

  const handleDelete = useCallback((id: string) => {
    const updated = notes.filter(n => n.id !== id);
    persistNotes(updated);
  }, [notes, persistNotes]);

  const handleStartEdit = useCallback((note: QuickNote) => {
    setEditingId(note.id);
    setEditingContent(note.content);
  }, []);

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editingContent.trim()) return;
    const updated = notes.map(n =>
      n.id === editingId
        ? { ...n, content: editingContent.trim(), updatedAt: new Date().toISOString() }
        : n
    );
    persistNotes(updated);
    setEditingId(null);
    setEditingContent('');
  }, [editingId, editingContent, notes, persistNotes]);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTags(prev =>
      prev.includes(tagId) ? prev.filter(t => t !== tagId) : [...prev, tagId]
    );
  }, []);

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    return date.toLocaleDateString('zh-CN');
  };

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
          placeholder="记点什么... (Ctrl+Enter 保存)"
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
        {notes.length === 0 ? (
          <div className="quick-note-empty">
            <span className="quick-note-empty-icon">📝</span>
            <span className="quick-note-empty-text">还没有小记，开始记录吧</span>
          </div>
        ) : (
          notes.map(note => (
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