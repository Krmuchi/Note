import { useCallback, useEffect, useRef, useState } from 'react';

import type { WritingLength, WritingStyle } from '@/types/ai';
import { WRITING_LENGTHS, WRITING_STYLES, shouldOfferRetry } from '@/services/ai';
import { useAiWriter } from '@/hooks/useAiWriter';

interface AiWriterProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (title: string, content: string) => void;
}

interface WritingConfig {
  topic: string;
  style: WritingStyle;
  length: WritingLength;
  includeOutline: boolean;
  includeExamples: boolean;
}

const DEFAULT_CONFIG: WritingConfig = {
  topic: '',
  style: 'formal',
  length: 'medium',
  includeOutline: true,
  includeExamples: true,
};

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * AI 写作助手。
 *
 * 生成走主进程代理的流式接口（见 src/services/ai 与 electron/ai）：
 * 增量按帧累积渲染，完成后由用户确认再一次性插入文档 —— 流式文本绝不逐块写进 store，
 * 否则会瞬间打满自动版本快照上限并污染撤销栈。
 */
export default function AiWriter({ isOpen, onClose, onInsert }: AiWriterProps) {
  const [config, setConfig] = useState<WritingConfig>(DEFAULT_CONFIG);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const {
    status,
    text,
    title,
    error,
    model,
    cached,
    elapsedMs,
    isStreaming,
    generate,
    cancel,
    reset,
  } = useAiWriter(isOpen);

  useEffect(() => {
    if (isOpen) textareaRef.current?.focus();
  }, [isOpen]);

  const handleGenerate = useCallback(() => {
    if (!config.topic.trim()) return;
    generate(config);
  }, [config, generate]);

  const handleInsert = useCallback(() => {
    const content = text.trim();
    if (!content) return;
    onInsert(title.trim() || `${config.topic.trim()} - AI 文档`, content);
    onClose();
  }, [text, title, config.topic, onInsert, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  if (!isOpen) return null;

  const showingResult = status !== 'idle';
  const canRetry = status === 'done' || (status === 'error' && error !== null && shouldOfferRetry(error));

  return (
    <div className="ai-writer-overlay" onClick={onClose}>
      <div className="ai-writer-panel" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        {/* 头部 */}
        <div className="ai-writer-header">
          <div className="ai-writer-title">
            <span className="ai-icon">🤖</span>
            <h2>AI 帮你写</h2>
          </div>
          <button className="ai-writer-close" onClick={onClose}>✕</button>
        </div>

        {/* 主体内容 */}
        <div className="ai-writer-body">
          {!showingResult ? (
            /* 配置面板 */
            <div className="ai-writer-config">
              {/* 主题输入 */}
              <div className="config-section">
                <label className="config-label">📝 写作主题</label>
                <textarea
                  ref={textareaRef}
                  className="topic-input"
                  value={config.topic}
                  onChange={(e) => setConfig((prev) => ({ ...prev, topic: e.target.value }))}
                  placeholder={'请输入你想写的主题，例如：\n- 如何提高工作效率\n- 产品需求文档\n- 旅行计划'}
                  rows={4}
                />
              </div>

              {/* 写作风格 */}
              <div className="config-section">
                <label className="config-label">🎨 写作风格</label>
                <div className="style-options">
                  {WRITING_STYLES.map((option) => (
                    <button
                      key={option.value}
                      className={`style-option ${config.style === option.value ? 'active' : ''}`}
                      onClick={() => setConfig((prev) => ({ ...prev, style: option.value }))}
                    >
                      <span className="style-icon">{option.icon}</span>
                      <span className="style-label">{option.label}</span>
                      <span className="style-desc">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 内容长度 */}
              <div className="config-section">
                <label className="config-label">📏 内容长度</label>
                <div className="length-options">
                  {WRITING_LENGTHS.map((option) => (
                    <button
                      key={option.value}
                      className={`length-option ${config.length === option.value ? 'active' : ''}`}
                      onClick={() => setConfig((prev) => ({ ...prev, length: option.value }))}
                    >
                      <span className="length-label">{option.label}</span>
                      <span className="length-desc">{option.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 附加选项 */}
              <div className="config-section">
                <label className="config-label">⚙️ 附加选项</label>
                <div className="extra-options">
                  <label className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={config.includeOutline}
                      onChange={(e) => setConfig((prev) => ({ ...prev, includeOutline: e.target.checked }))}
                    />
                    <span>包含文档大纲</span>
                  </label>
                  <label className="checkbox-option">
                    <input
                      type="checkbox"
                      checked={config.includeExamples}
                      onChange={(e) => setConfig((prev) => ({ ...prev, includeExamples: e.target.checked }))}
                    />
                    <span>包含示例内容</span>
                  </label>
                </div>
              </div>

              {/* 生成按钮 */}
              <button
                className={`generate-btn ${!config.topic.trim() ? 'disabled' : ''}`}
                onClick={handleGenerate}
                disabled={!config.topic.trim()}
              >
                ✨ 开始生成
              </button>
            </div>
          ) : (
            /* 生成结果（流式预览 / 完成 / 失败） */
            <div className="ai-writer-result">
              <div className="result-header">
                <h3>
                  {isStreaming ? '正在生成…' : status === 'error' ? '⚠️ 生成失败' : '📄 生成结果'}
                </h3>
                <button className="back-btn" onClick={reset} disabled={isStreaming}>
                  ← 返回编辑
                </button>
              </div>

              {status === 'error' && error && (
                <div className="ai-error-bar">
                  <span className="ai-error-code">{error.code}</span>
                  <span className="ai-error-text">{error.message}</span>
                  {typeof error.attempts === 'number' && error.attempts > 1 && (
                    <span className="ai-error-attempts">已尝试 {error.attempts} 次</span>
                  )}
                </div>
              )}

              {(text || isStreaming) && (
                <div className="result-preview">
                  {title && <div className="result-title">{title}</div>}
                  <div className="result-content">
                    <pre className="result-text">
                      {text}
                      {isStreaming && <span className="ai-stream-cursor" />}
                    </pre>
                  </div>
                </div>
              )}

              <div className="ai-result-meta">
                {isStreaming && <span className="ai-meta-item">已用时 {formatSeconds(elapsedMs)}</span>}
                {model && <span className="ai-meta-item">模型 {model}</span>}
                {status === 'done' && <span className="ai-meta-item">耗时 {formatSeconds(elapsedMs)}</span>}
                {cached && <span className="ai-meta-item is-cache">来自缓存</span>}
                <span className="ai-meta-item is-muted">
                  {text.length} 字符 · 内容由 AI 生成，请自行核对
                </span>
              </div>

              <div className="result-actions">
                {isStreaming ? (
                  <button className="action-btn secondary" onClick={cancel}>
                    ⏹ 停止生成
                  </button>
                ) : (
                  <>
                    <button className="action-btn secondary" onClick={reset}>
                      重新配置
                    </button>
                    {canRetry && (
                      <button className="action-btn secondary" onClick={handleGenerate}>
                        {status === 'error' ? '重试' : '重新生成'}
                      </button>
                    )}
                    <button className="action-btn primary" onClick={handleInsert} disabled={!text.trim()}>
                      📥 插入到文档
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}