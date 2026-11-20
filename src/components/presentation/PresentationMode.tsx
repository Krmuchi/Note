import '@/styles/presentation.css';
import React, { useState, useEffect, useRef } from 'react';
import type { NoteDoc } from '@/types';
import { MarkdownPreview } from '@/components/editor/MarkdownPreview';
import { PresentationTimer } from './PresentationTimer';
import { IconUser } from '@/components/common/Icon';

interface PresentationModeProps {
  doc: NoteDoc;
  onClose: () => void;
}

export const PresentationMode: React.FC<PresentationModeProps> = ({ doc, onClose }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [isSpeakerMode, setIsSpeakerMode] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [laserPosition, setLaserPosition] = useState({ x: 0, y: 0 });
  const [showLaser, setShowLaser] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /*
   * 分页策略（P：演示模式 --- 手动分页）：
   * 1. 标题为分界 —— 标题与其后续正文归入同一页（旧实现把标题与正文拆成两页，
   *    每页要么只有标题要么只有正文，演示效果割裂）；
   * 2. **单独成行的 --- 是手动分页符** —— 想按自己的节奏切页，不必硬凑标题；
   *    代码围栏里的 --- 是代码内容，不参与分页（旧实现连围栏里的标题都会误分）。
   * 文首孤立的 --- 没有"上一页"可分，直接忽略。
   */
  const pages = React.useMemo(() => {
    if (!doc.content) return ['暂无内容'];
    const segments: string[] = [];
    let buf: string[] = [];
    let inFence = false;
    for (const line of doc.content.split('\n')) {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (!inFence && /^---\s*$/.test(line)) {
        const hasContent = buf.some((l) => l.trim() !== '');
        if (hasContent) {
          segments.push(buf.join('\n'));
          buf = [];
        }
        continue;
      }
      if (!inFence && /^(#{1,6})\s+/.test(line) && buf.length > 0) {
        segments.push(buf.join('\n'));
        buf = [line];
        continue;
      }
      buf.push(line);
    }
    segments.push(buf.join('\n'));
    const trimmed = segments.map((p) => p.trim()).filter(Boolean);
    return trimmed.length > 0 ? trimmed : [doc.content];
  }, [doc.content]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // 演示期间全局 useKeyboard 仍然挂载：本层处理过的键必须在 capture 阶段拦下，
      // 否则 Ctrl+Alt+←/→ 会同时触发「翻页」与全局「上一篇/下一篇」，演示文档被整个换掉；
      // Esc 也会连带关掉背后开着的面板。
      const handled = (): void => {
        e.preventDefault();
        e.stopImmediatePropagation();
        e.stopPropagation();
      };

      if (e.key === 'Escape') {
        handled();
        onClose();
        return;
      }

      // 翻页键必须排除修饰键组合：Ctrl+Alt+←/→ 是全局切文档快捷键，不是翻页
      const noModifier = !e.ctrlKey && !e.metaKey && !e.altKey;
      if (noModifier && (e.key === 'ArrowRight' || e.key === ' ')) {
        handled();
        setCurrentPage(p => Math.min(p + 1, pages.length - 1));
        return;
      }
      if (noModifier && e.key === 'ArrowLeft') {
        handled();
        setCurrentPage(p => Math.max(p - 1, 0));
        return;
      }

      if (noModifier) {
        // 单字母快捷键须排除修饰键组合，否则 Ctrl+S 等系统快捷键会误触演示功能
        if (e.key === 's') {
          handled();
          setIsSpeakerMode(sp => !sp);
        } else if (e.key === 'l') {
          handled();
          setShowLaser(l => !l);
        } else if (e.key === 't') {
          handled();
          setIsTimerRunning(t => !t);
        }
      }
    };

    // capture：先于 window 上的 bubble 监听器（useKeyboard）执行
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [pages.length, onClose]);

  useEffect(() => {
    // 激光笔关闭时**根本不挂监听**：演示中鼠标一直在动，
    // 常驻的 mousemove 回调每次都空转一遍（旧写法在回调里才判断 showLaser）
    if (!showLaser) return;

    const handleMouseMove = (e: MouseEvent): void => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setLaserPosition({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [showLaser]);

  const progress = pages.length > 1 ? ((currentPage + 1) / pages.length) * 100 : 0;

  return (
    <div className="presentation-container" ref={containerRef}>
      {isSpeakerMode && (
        <div className="speaker-panel">
          <div className="speaker-header">
            <h3>{doc.title}</h3>
            <button className="speaker-close-btn" onClick={() => setIsSpeakerMode(false)}>
              ✕
            </button>
          </div>
          <div className="speaker-content">
            <div className="speaker-slide-preview">
              <div className="preview-title">当前页面</div>
              <div className="preview-content">
                {pages[currentPage]?.slice(0, 200)}...
              </div>
            </div>
            <div className="speaker-notes">
              <div className="notes-title">备注</div>
              <div className="notes-content">
                {currentPage < pages.length - 1 ? (
                  <div className="next-preview">
                    <div className="next-label">下一页预览:</div>
                    {pages[currentPage + 1]?.slice(0, 100)}...
                  </div>
                ) : (
                  <span className="no-next">已是最后一页</span>
                )}
              </div>
            </div>
            <div className="speaker-controls">
              <div className="timer-display">
                <span className="timer-label">演示时长</span>
                <PresentationTimer key={doc.id} running={isTimerRunning}>
                  {(time) => (
                    <span className={`timer-value ${isTimerRunning ? 'running' : 'paused'}`}>
                      {time}
                    </span>
                  )}
                </PresentationTimer>
              </div>
              <div className="progress-info">
                {currentPage + 1} / {pages.length}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="presentation-main">
        <div className="presentation-toolbar">
          <button className="toolbar-btn" onClick={onClose} title="退出演示 (Esc)">
            ✕
          </button>
          <button 
            className={`toolbar-btn ${isSpeakerMode ? 'active' : ''}`} 
            onClick={() => setIsSpeakerMode(!isSpeakerMode)}
            title="演讲者模式 (S)"
            aria-label="演讲者模式"
          >
            <IconUser size={18} />
          </button>
          <button 
            className={`toolbar-btn ${showLaser ? 'active' : ''}`} 
            onClick={() => setShowLaser(!showLaser)}
            title="激光笔 (L)"
            aria-label="激光笔"
          >
            {/* 激光点是播放语义字形，保留；可访问名走 aria-label */}
            <span aria-hidden="true">🔴</span>
          </button>
          <button 
            className={`toolbar-btn timer-btn ${isTimerRunning ? '' : 'paused'}`} 
            onClick={() => setIsTimerRunning(!isTimerRunning)}
            title="计时器 (T)"
          >
            <PresentationTimer key={doc.id} running={isTimerRunning}>
              {(time) => <span>{time}</span>}
            </PresentationTimer>
          </button>
        </div>

        <div className="presentation-progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div className="slide-container">
          <div className="slide-content">
            <div className="slide-page">
              {(() => {
                const page = pages[currentPage] || '';
                const headingMatch = page.match(/^(#{1,6})\s+(.+)$/m);
                if (headingMatch) {
                  // 页面 = 标题 + 其后续正文，标题进 slide-title，其余进 slide-text
                  const headingIndex = page.indexOf(headingMatch[0]);
                  const body = (page.slice(0, headingIndex) + page.slice(headingIndex + headingMatch[0].length)).trim();
                  return (
                    <>
                      <h1 className="slide-title">{headingMatch[2]}</h1>
                      {body && <MarkdownPreview content={body} className="slide-text" syncScroll={false} />}
                    </>
                  );
                }
                return <MarkdownPreview content={page} className="slide-text" syncScroll={false} />;
              })()}
            </div>
          </div>

          <div className="slide-nav">
            <button 
              className="nav-btn" 
              onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
              disabled={currentPage === 0}
              aria-label="上一页"
            >
              <span aria-hidden="true">◀</span>
            </button>
            <div className="nav-dots" title="点击跳页；正文中单独成行的 --- 与各级标题都会切一页">
              {pages.map((_, i) => (
                <button
                  key={i}
                  className={`nav-dot ${i === currentPage ? 'active' : ''}`}
                  onClick={() => setCurrentPage(i)}
                />
              ))}
            </div>
            <button 
              className="nav-btn" 
              onClick={() => setCurrentPage(p => Math.min(p + 1, pages.length - 1))}
              disabled={currentPage === pages.length - 1}
              aria-label="下一页"
            >
              <span aria-hidden="true">▶</span>
            </button>
          </div>
        </div>

        {showLaser && (
          <div 
            className="laser-pointer"
            style={{ left: laserPosition.x, top: laserPosition.y }}
          />
        )}
      </div>
    </div>
  );
};
