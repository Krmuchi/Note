import { Component, type ErrorInfo, type ReactNode } from 'react'
import { appendErrorLog } from './utils/errorLog'
import { IconWarning } from './components/common/Icon'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  /**
   * P2-12：本组件渲染在 ToastContainer 之外（Toast 在 App 内部，此时已被替换掉），
   * 复制结果只能就地反馈 —— 否则崩溃页上点「复制错误信息」毫无反应，用户会反复点。
   * 可选：getDerivedStateFromError 只回填 hasError/error，缺失即视为 idle。
   */
  copyState?: 'idle' | 'copied' | 'failed'
}

interface SentryWindow {
  Sentry?: {
    captureException: (error: Error, options: { extra: { componentStack: string | null | undefined } }) => void
  }
}

declare const window: Window & SentryWindow

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    copyState: 'idle'
  }

  private copyResetTimer: ReturnType<typeof setTimeout> | null = null

  public componentWillUnmount(): void {
    if (this.copyResetTimer) clearTimeout(this.copyResetTimer)
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.reportError(error, errorInfo)
    this.logError(error, errorInfo)
  }

  private reportError(error: Error, errorInfo: ErrorInfo): void {
    if (window.Sentry) {
      window.Sentry.captureException(error, { 
        extra: { componentStack: errorInfo.componentStack } 
      })
    }
  }

  private logError(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary caught:', error)
    console.error('Component stack:', errorInfo.componentStack)

    // 统一走 utils/errorLog（设置里的"诊断信息"会读取同一份数据）
    appendErrorLog({
      source: 'render',
      message: error.message,
      stack: (error.stack ?? '') + (errorInfo.componentStack ?? ''),
    })
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  private handleReload = (): void => {
    window.location.reload()
  }

  private handleCopyError = async (): Promise<void> => {
    const { error } = this.state
    if (!error) return
    const text = `[${new Date().toISOString()}] ${error.message}\n\n${error.stack ?? ''}`
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch (err) {
      console.error('复制错误信息失败:', err)
    }
    // 成功/失败都必须有可见反馈：这是崩溃页上唯一的反馈通道
    this.setState({ copyState: ok ? 'copied' : 'failed' })
    if (this.copyResetTimer) clearTimeout(this.copyResetTimer)
    this.copyResetTimer = setTimeout(() => this.setState({ copyState: 'idle' }), 3000)
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-card">
            <div className="error-boundary-icon" aria-hidden="true"><IconWarning size={32} /></div>
            <h2 className="error-boundary-title">应用出错了</h2>
            <p className="error-boundary-message">
              {this.state.error?.message || '发生了未知错误，可尝试重试或重新加载应用。'}
            </p>
            <div className="error-boundary-actions">
              <button className="error-boundary-btn primary" onClick={this.handleReset}>重试</button>
              <button className="error-boundary-btn" onClick={this.handleReload}>重新加载</button>
              <button
                className="error-boundary-btn"
                onClick={this.handleCopyError}
                // 反馈用 aria-live 区域承载：读屏用户同样知道复制是否成功
                aria-live="polite"
              >
                {this.state.copyState === 'copied'
                  ? '✓ 已复制'
                  : this.state.copyState === 'failed'
                    ? '复制失败：请展开「错误详情」手动选择'
                    : '复制错误信息'}
              </button>
            </div>
            <details className="error-boundary-details">
              <summary>错误详情</summary>
              <pre className="error-boundary-stack">{this.state.error?.stack}</pre>
            </details>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary