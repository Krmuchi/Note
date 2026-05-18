import React from 'react';

/**
 * 错误边界组件
 * 用于捕获子组件的 JavaScript 错误并显示备用 UI
 */
interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  /**
   * 静态方法：从错误中派生状态
   * 当子组件抛出错误时调用，更新状态以显示错误信息
   */
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  /**
   * 实例方法：捕获错误后的处理
   * 可在此处发送错误日志到监控系统
   */
  componentDidCatch() {
    // 可在此处添加错误上报逻辑
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h2>应用出错了</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#b91c1c' }}>{String(this.state.error)}</pre>
          <div>请打开开发者工具查看详细信息。</div>
        </div>
      );
    }
    return this.props.children;
  }
}