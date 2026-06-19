import React, { useState, useEffect, useRef } from 'react';
import type { NoteDoc } from '@/types';

interface PresentationModeProps {
  doc: NoteDoc;
  onClose: () => void;
}

export const PresentationMode: React.FC<PresentationModeProps> = ({ doc, onClose }) => {
  const [currentPage, setCurrentPage] = useState(0);
  const [isSpeakerMode, setIsSpeakerMode] = useState(false);
  const [timer, setTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);
  const [laserPosition, setLaserPosition] = useState({ x: 0, y: 0 });
  const [showLaser, setShowLaser] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const pages = doc.content
    ? doc.content.split(/(#{1,6}\s+.+)/g).filter(p => p.trim()).map(p => p.trim())
    : ['暂无内容'];

  useEffect(() => {
    let interval: number;
    if (isTimerRunning) {
      interval = window.setInterval(() => {
        setTimer(t => t + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setCurrentPage(p => Math.min(p + 1, pages.length - 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentPage(p => Math.max(p - 1, 0));
      } else if (e.key === 's') {
        setIsSpeakerMode(s => !s);
      } else if (e.key === 'l') {
        setShowLaser(l => !l);
      } else if (e.key === 't') {
        setIsTimerRunning(t => !t);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pages.length, onClose]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (showLaser && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setLaserPosition({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [showLaser]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
                <span className={`timer-value ${isTimerRunning ? 'running' : 'paused'}`}>
                  {formatTime(timer)}
                </span>
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
          >
            👤
          </button>
          <button 
            className={`toolbar-btn ${showLaser ? 'active' : ''}`} 
            onClick={() => setShowLaser(!showLaser)}
            title="激光笔 (L)"
          >
            🔴
          </button>
          <button 
            className={`toolbar-btn timer-btn ${isTimerRunning ? '' : 'paused'}`} 
            onClick={() => setIsTimerRunning(!isTimerRunning)}
            title="计时器 (T)"
          >
            {formatTime(timer)}
          </button>
        </div>

        <div className="presentation-progress">
          <div className="progress-bar" style={{ width: `${progress}%` }} />
        </div>

        <div className="slide-container">
          <div className="slide-content">
            <div className="slide-page">
              {pages[currentPage]?.startsWith('#') ? (
                <h1 className="slide-title">{pages[currentPage]?.replace(/^#{1,6}\s*/, '')}</h1>
              ) : (
                <div className="slide-text">{pages[currentPage]}</div>
              )}
            </div>
          </div>

          <div className="slide-nav">
            <button 
              className="nav-btn" 
              onClick={() => setCurrentPage(p => Math.max(p - 1, 0))}
              disabled={currentPage === 0}
            >
              ◀
            </button>
            <div className="nav-dots">
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
            >
              ▶
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