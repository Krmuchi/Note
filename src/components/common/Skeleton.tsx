import React, { useState } from 'react';

export const SidebarSkeleton: React.FC = () => (
  <aside className="main-sidebar">
    <div className="sidebar-header">
      <div className="skeleton skeleton-text" style={{ width: '60%', height: '20px' }} />
      <div className="skeleton skeleton-text" style={{ width: '100%', height: '32px', marginTop: '12px', borderRadius: '8px' }} />
    </div>
    <nav className="sidebar-nav">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="skeleton skeleton-item" style={{ width: '100%', height: '36px' }} />
      ))}
    </nav>
    <div className="sidebar-section">
      <div className="skeleton skeleton-text" style={{ width: '40%', height: '14px', marginBottom: '8px' }} />
      {[1, 2, 3].map(i => (
        <div key={i} className="skeleton skeleton-item" style={{ width: '100%', height: '32px' }} />
      ))}
    </div>
  </aside>
);

export const DocsSidebarSkeleton: React.FC = () => {
  const [widths] = useState(() => [1, 2, 3, 4, 5].map(() => 70 + Math.random() * 30));
  return (
    <aside className="docs-sidebar">
      <div className="docs-header">
        <div className="skeleton skeleton-text" style={{ width: '50%', height: '20px' }} />
      </div>
      <div className="docs-search">
        <div className="skeleton skeleton-text" style={{ width: '100%', height: '32px', borderRadius: '8px' }} />
      </div>
      <div className="docs-list">
        {widths.map((w, i) => (
          <div key={i} className="skeleton skeleton-item" style={{ width: `${w}%`, height: '28px', marginLeft: i > 2 ? '16px' : '0' }} />
        ))}
      </div>
    </aside>
  );
};

export const EditorSkeleton: React.FC = () => (
  <main className="editor-panel">
    <header className="editor-header">
      <div className="skeleton skeleton-text" style={{ width: '40%', height: '24px', marginBottom: '8px' }} />
      <div className="skeleton skeleton-bar" style={{ width: '100%', height: '36px', marginBottom: '8px' }} />
      <div style={{ display: 'flex', gap: '8px' }}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="skeleton skeleton-circle" style={{ width: '28px', height: '28px' }} />
        ))}
      </div>
    </header>
    <div style={{ padding: '24px' }}>
      <div className="skeleton skeleton-text" style={{ width: '100%', height: '18px', marginBottom: '12px' }} />
      <div className="skeleton skeleton-text" style={{ width: '90%', height: '18px', marginBottom: '12px' }} />
      <div className="skeleton skeleton-text" style={{ width: '95%', height: '18px', marginBottom: '12px' }} />
      <div className="skeleton skeleton-text" style={{ width: '60%', height: '18px', marginBottom: '24px' }} />
      <div className="skeleton skeleton-text" style={{ width: '100%', height: '18px', marginBottom: '12px' }} />
      <div className="skeleton skeleton-text" style={{ width: '85%', height: '18px', marginBottom: '12px' }} />
      <div className="skeleton skeleton-text" style={{ width: '70%', height: '18px' }} />
    </div>
  </main>
);