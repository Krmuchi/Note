import { useState } from 'react';
import { useTheme } from '@/shared/hooks';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  fontSize: string;
  onFontSizeChange: (size: string) => void;
}

export default function SettingsPanel({ isOpen, onClose, fontSize, onFontSizeChange }: SettingsPanelProps) {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<'general' | 'editor' | 'shortcuts'>('general');

  if (!isOpen) return null;

  const tabs = [
    { id: 'general' as const, label: '通用', icon: '⚙️' },
    { id: 'editor' as const, label: '编辑器', icon: '📝' },
    { id: 'shortcuts' as const, label: '快捷键', icon: '⌨️' },
  ];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">⚙️ 设置</h2>
          <button className="settings-close" onClick={onClose}>×</button>
        </div>

        <div className="settings-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="settings-tab-icon">{tab.icon}</span>
              <span className="settings-tab-text">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="settings-body">
          {activeTab === 'general' && (
            <div className="settings-section">
              <h3 className="settings-section-title">外观</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">主题模式</span>
                  <span className="settings-item-desc">切换亮色/暗色主题</span>
                </div>
                <button className="settings-toggle-btn" onClick={toggleTheme}>
                  {theme === 'light' ? '☀️ 亮色' : '🌙 暗色'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'editor' && (
            <div className="settings-section">
              <h3 className="settings-section-title">编辑器设置</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">字号大小</span>
                  <span className="settings-item-desc">调整编辑器文字大小</span>
                </div>
                <select
                  className="settings-select"
                  value={fontSize}
                  onChange={(e) => onFontSizeChange(e.target.value)}
                >
                  <option value="12px">12px</option>
                  <option value="13px">13px</option>
                  <option value="14px">14px</option>
                  <option value="15px">15px</option>
                  <option value="16px">16px</option>
                  <option value="18px">18px</option>
                  <option value="20px">20px</option>
                </select>
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="settings-section">
              <h3 className="settings-section-title">快捷键列表</h3>
              <div className="settings-shortcuts-list">
                {[
                  { keys: 'Ctrl+K', desc: '打开搜索' },
                  { keys: 'Ctrl+S', desc: '保存' },
                  { keys: 'Ctrl+N', desc: '新建文档' },
                  { keys: 'Ctrl+Shift+N', desc: '新建知识库' },
                  { keys: 'Ctrl+B', desc: '粗体' },
                  { keys: 'Ctrl+I', desc: '斜体' },
                  { keys: 'Ctrl+Z', desc: '撤销' },
                  { keys: 'Ctrl+Y', desc: '重做' },
                  { keys: 'Ctrl+/', desc: '快捷键帮助' },
                  { keys: 'Ctrl+\\', desc: '切换侧边栏' },
                  { keys: 'Ctrl+Shift+F', desc: '收藏/取消收藏' },
                  { keys: 'Esc', desc: '关闭弹窗' },
                ].map(item => (
                  <div key={item.keys} className="settings-shortcut-item">
                    <span className="settings-shortcut-desc">{item.desc}</span>
                    <span className="settings-shortcut-keys">
                      {item.keys.split('+').map((key, i) => (
                        <span key={i}>
                          <kbd>{key}</kbd>
                          {i < item.keys.split('+').length - 1 && <span>+</span>}
                        </span>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}