import { useCallback, useState } from 'react';
import { useTheme, THEME_OPTIONS, useFont, FONT_OPTIONS, applyCustomPrimaryColor } from '@/shared/hooks';
import { modKey } from '@/utils/platform';
import { aiClient } from '@/services/ai';
import type { AiConfigView, AiFailure } from '@/types/ai';
import AiSettingsTab from './AiSettingsTab';

type SettingsTabId = 'general' | 'editor' | 'ai' | 'shortcuts';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  fontSize: string;
  onFontSizeChange: (size: string) => void;
}

// 预设主题色
const PRESET_COLORS = [
  { name: '蓝色', value: '#1677ff' },
  { name: '绿色', value: '#52c41a' },
  { name: '红色', value: '#ff4d4f' },
  { name: '橙色', value: '#fa8c16' },
  { name: '紫色', value: '#722ed1' },
  { name: '粉色', value: '#eb2f96' },
  { name: '青色', value: '#13c2c2' },
  { name: '金色', value: '#faad14' },
];

export default function SettingsPanel({ isOpen, onClose, fontSize, onFontSizeChange }: SettingsPanelProps) {
  const { theme, setCustomTheme } = useTheme();
  const { font, setCustomFont } = useFont();
  const [activeTab, setActiveTab] = useState<SettingsTabId>('general');
  /** AI 配置在切到该页签时才加载：放在事件处理器里而不是 effect 中，避免级联渲染 */
  const [aiConfig, setAiConfig] = useState<AiConfigView | AiFailure | null>(null);

  const handleSelectTab = useCallback(
    (tabId: SettingsTabId) => {
      setActiveTab(tabId);
      if (tabId !== 'ai' || aiConfig !== null) return;
      void aiClient.config.get().then(setAiConfig);
    },
    [aiConfig],
  );
  const [customColor, setCustomColor] = useState(() => {
    // 从 localStorage 加载自定义颜色
    try {
      return localStorage.getItem('notes-custom-primary-color') || '#1677ff';
    } catch {
      return '#1677ff';
    }
  });

  // 应用自定义颜色（主题感知：色阶由 applyCustomPrimaryColor 按亮/暗主题分别生成，
  // 切换主题时自动跟随，重启后由 useTheme 挂载时的 restore 恢复）
  const handleApplyCustomColor = (color: string) => {
    setCustomColor(color);
    applyCustomPrimaryColor(color);
  };

  // 清除自定义主题色，恢复当前主题的默认色
  const handleResetCustomColor = () => {
    setCustomColor('#1677ff');
    applyCustomPrimaryColor(null);
  };

  if (!isOpen) return null;

  const tabs = [
    { id: 'general' as const, label: '通用', icon: '⚙️' },
    { id: 'editor' as const, label: '编辑器', icon: '📝' },
    { id: 'ai' as const, label: 'AI', icon: '🤖' },
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
              onClick={() => handleSelectTab(tab.id)}
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
                  <span className="settings-item-desc">选择喜欢的主题风格</span>
                </div>
              </div>
              <div className="theme-grid">
                {THEME_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    className={`theme-option ${theme === option.id ? 'active' : ''}`}
                    onClick={() => setCustomTheme(option.id)}
                    title={option.description}
                  >
                    <span className="theme-option-icon">{option.icon}</span>
                    <span className="theme-option-name">{option.name}</span>
                  </button>
                ))}
              </div>
              
              <div className="settings-item" style={{ marginTop: '16px' }}>
                <div className="settings-item-info">
                  <span className="settings-item-label">主题色</span>
                  <span className="settings-item-desc">自定义应用的主色调</span>
                </div>
              </div>
              <div className="color-picker-section">
                <div className="preset-colors">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color.value}
                      className={`color-preset ${customColor === color.value ? 'active' : ''}`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => handleApplyCustomColor(color.value)}
                      title={color.name}
                    />
                  ))}
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={customColor}
                      onChange={(e) => handleApplyCustomColor(e.target.value)}
                      className="color-input"
                    />
                    <span className="color-value">{customColor}</span>
                  </div>
                  <button className="color-reset-btn" onClick={handleResetCustomColor} title="恢复默认主题色">
                    恢复默认
                  </button>
                </div>
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
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">字体选择</span>
                  <span className="settings-item-desc">选择喜欢的字体风格</span>
                </div>
              </div>
              <div className="font-grid">
                {FONT_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    className={`font-option ${font === option.id ? 'active' : ''}`}
                    onClick={() => setCustomFont(option.id)}
                    title={option.description}
                  >
                    <span className="font-option-preview" style={{ fontFamily: option.id === 'mono' ? 'var(--font-family-mono)' : option.id === 'serif' ? 'var(--font-family-serif)' : 'inherit' }}>
                      {option.preview}
                    </span>
                    <span className="font-option-name">{option.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'ai' && <AiSettingsTab initial={aiConfig} onViewChange={setAiConfig} />}

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
                          <kbd>{key === 'Ctrl' ? modKey : key}</kbd>
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