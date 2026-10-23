import { Component, type ErrorInfo, type ReactNode } from 'react'
import { appendErrorLog } from './utils/errorLog'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
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
    error: null
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
    try {
      await navigator.clipboard.writeText(text)
    } catch (err) {
      console.error('复制错误信息失败:', err)
    }
  }

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-card">
            <div className="error-boundary-icon" aria-hidden="true">⚠️</div>
            <h2 className="error-boundary-title">应用出错了</h2>
            <p className="error-boundary-message">
              {this.state.error?.message || '发生了未知错误，可尝试重试或重新加载应用。'}
            </p>
            <div className="error-boundary-actions">
              <button className="error-boundary-btn primary" onClick={this.handleReset}>重试</button>
              <button className="error-boundary-btn" onClick={this.handleReload}>重新加载</button>
              <button className="error-boundary-btn" onClick={this.handleCopyError}>复制错误信息</button>
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