import { Component, type ErrorInfo, type ReactNode } from 'react'

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

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.reportError(error, errorInfo)
    this.logError(error, errorInfo)
  }

  private reportError(error: Error, errorInfo: ErrorInfo) {
    if (window.Sentry) {
      window.Sentry.captureException(error, { 
        extra: { componentStack: errorInfo.componentStack } 
      })
    }
  }

  private logError(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error)
    console.error('Component stack:', errorInfo.componentStack)
    
    try {
      const logs = JSON.parse(localStorage.getItem('error-logs') || '[]')
      logs.push({
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: errorInfo.componentStack
      })
      localStorage.setItem('error-logs', JSON.stringify(logs.slice(-50)))
    } catch {
      // ignore
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }
      
      return (
        <div style={{ padding: 24 }}>
          <h2>应用出错了</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={this.handleReset} style={{ padding: '8px 16px', cursor: 'pointer' }}>重试</button>
          <details style={{ marginTop: 16 }}>
            <summary>错误详情</summary>
            <pre style={{ whiteSpace: 'pre-wrap', color: '#b91c1c' }}>{this.state.error?.stack}</pre>
          </details>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary