import React, { useEffect, useRef, useState } from 'react';

interface MermaidProps {
  code: string;
  className?: string;
}

// 全局ID计数器
let idCounter = 0;

// 已初始化标记：mermaid.initialize 是全局配置，重复调用会反复重置全局状态
let initializedTheme: string | null = null;

/** 根据当前主题返回 mermaid 主题名（暗色系列主题用 dark 保证图表可读） */
function getMermaidTheme(): 'dark' | 'default' {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  return current.includes('dark') ? 'dark' : 'default';
}

// 模块级单例：一个 MutationObserver 服务于所有图表实例
type ThemeListener = () => void;
const themeListeners = new Set<ThemeListener>();
let themeObserver: MutationObserver | null = null;

function subscribeThemeChange(listener: ThemeListener): () => void {
  themeListeners.add(listener);
  if (!themeObserver) {
    themeObserver = new MutationObserver(() => {
      themeListeners.forEach(fn => fn());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  }
  return () => {
    themeListeners.delete(listener);
    if (themeListeners.size === 0 && themeObserver) {
      themeObserver.disconnect();
      themeObserver = null;
    }
  };
}

/** Mermaid 图表渲染组件 */
export const Mermaid: React.FC<MermaidProps> = ({ code, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(code));
  const [id] = useState(() => `mermaid-${++idCounter}-${Date.now()}`);
  // 跟随主题切换重新渲染图表
  const [themeTick, setThemeTick] = useState(0);

  // 主题监听使用模块级单例 observer + 订阅集合，避免每个图表实例各挂一个 MutationObserver
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return;
    return subscribeThemeChange(() => setThemeTick(t => t + 1));
  }, []);

  useEffect(() => {
    if (!code) return;

    let cancelled = false;

    const renderChart = async () => {
      try {
        setLoading(true);
        const mermaid = await import('mermaid').then(m => m.default || m);

        if (cancelled) return;

        // 仅在主题变化时重新初始化；securityLevel 用 strict 避免图表内容注入执行
        const theme = getMermaidTheme();
        if (initializedTheme !== theme) {
          mermaid.initialize({
            startOnLoad: false,
            theme,
            securityLevel: 'strict',
            fontFamily: 'sans-serif',
          });
          initializedTheme = theme;
        }

        const { svg: renderedSvg } = await mermaid.render(id, code);
        
        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Mermaid render error:', err);
          setError(err instanceof Error ? err.message : '图表渲染失败');
          setSvg('');
          setLoading(false);
        }
      }
    };

    renderChart();

    return () => {
      cancelled = true;
    };
  }, [code, id, themeTick]);

  // 空代码直接渲染占位：原实现 loading 永远为 true，会一直显示"渲染图表中..."
  if (!code) {
    return (
      <div style={{ padding: '12px', textAlign: 'center', color: 'var(--text-placeholder, #9ca3af)', fontSize: '13px' }}>
        暂无图表代码
      </div>
    );
  }

  if (loading && !error) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: 'var(--text-placeholder, #9ca3af)',
        fontSize: '14px',
      }}>
        渲染图表中...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '12px',
        background: 'var(--error-50, #fff3f3)',
        border: '1px solid var(--error-300, #ffcdd2)',
        borderRadius: '6px',
        color: 'var(--error-600, #c62828)',
        fontSize: '14px',
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>图表渲染错误</div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '12px' }}>{error}</pre>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`mermaid-container ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
      style={{
        textAlign: 'center',
        margin: '1em 0',
        overflow: 'auto',
      }}
    />
  );
};

export default Mermaid;
