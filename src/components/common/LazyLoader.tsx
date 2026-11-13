import { Component, Suspense } from 'react';
import type { ErrorInfo, JSX, ReactNode } from 'react';
import { Loading } from './Loading';
import { appendErrorLog } from '@/utils/errorLog';

interface LazyLoaderProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface BoundaryProps {
  children: ReactNode;
}

interface BoundaryState {
  error: Error | null;
}

/**
 * 懒加载面板的局部错误边界。
 *
 * 背景：React.lazy 的 import 失败（chunk 缺失/更新后旧哈希等）会沿 Suspense
 * 向上抛到根 ErrorBoundary，整个应用被错误页替换。这里把失败限制在单个面板内。
 *
 * 注意：React.lazy 会缓存 rejected promise —— 仅重置边界状态再渲染，lazy 会立刻
 * 重抛同一个错误，「重试」无效。因此重试计数 ≥1 后不再渲染 lazy 子树，
 * 明确引导用户「重新加载应用」（整页重载才会重新请求 chunk）。
 * 计数放在实例字段而不是 state：getDerivedStateFromError 是静态方法，读不到当前 state。
 */
class LazyErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  public state: BoundaryState = { error: null };
  private attempt = 0;

  public static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('LazyLoader caught:', error);
    // 与根 ErrorBoundary 同一份日志，设置里的「诊断信息」可以读到
    appendErrorLog({
      source: 'render',
      message: error.message,
      stack: (error.stack ?? '') + (errorInfo.componentStack ?? ''),
    });
  }

  private handleRetry = (): void => {
    this.attempt += 1;
    this.setState({ error: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  public render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      // key 变化 → 子树整体重挂载（组件内部渲染错误可借此恢复）
      return <div key={this.attempt} style={{ display: 'contents' }}>{this.props.children}</div>;
    }
    if (this.attempt >= 1) {
      // lazy 缓存了失败的 import，原地重试必然再次失败：只给整页重载
      return (
        <div className="lazy-error" role="alert">
          <p className="lazy-error-message">该模块加载失败，重试无效，请重新加载应用。</p>
          <div className="lazy-error-actions">
            <button type="button" className="error-boundary-btn primary" onClick={this.handleReload}>
              重新加载应用
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="lazy-error" role="alert">
        <p className="lazy-error-message">该模块加载失败：{error.message || '未知错误'}</p>
        <div className="lazy-error-actions">
          <button type="button" className="error-boundary-btn primary" onClick={this.handleRetry}>
            重试
          </button>
          <button type="button" className="error-boundary-btn" onClick={this.handleReload}>
            重新加载应用
          </button>
        </div>
      </div>
    );
  }
}

export function LazyLoader({ children, fallback }: LazyLoaderProps): JSX.Element {
  const loading = fallback || (
    <div className="lazy-loading">
      <Loading type="spinner" size="medium" text="加载中..." />
    </div>
  );
  return (
    <LazyErrorBoundary>
      <Suspense fallback={loading}>{children}</Suspense>
    </LazyErrorBoundary>
  );
}
