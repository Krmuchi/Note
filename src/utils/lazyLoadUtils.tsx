import { lazy, Suspense, useState, useEffect } from 'react'
import type { ComponentType, ReactNode } from 'react'

interface LazyComponentProps {
  fallback?: ReactNode
  delay?: number
}

function DelayedFallback({ fallback, delay, children }: { 
  fallback: ReactNode; delay: number; children: ReactNode 
}) {
  const [showFallback, setShowFallback] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowFallback(false)
    }, delay)

    return () => clearTimeout(timer)
  }, [delay])

  if (showFallback) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

export function createLazyComponent<P extends object>(
  importFn: () => Promise<{ default: ComponentType<P> }>,
  options: LazyComponentProps = {}
) {
  const { fallback = <div>Loading...</div>, delay = 0 } = options

  const LazyComponent = lazy(importFn)

  return function LazyWrapper(props: P) {
    const content = (
      <Suspense fallback={fallback}>
        <LazyComponent {...props} />
      </Suspense>
    )

    if (delay > 0) {
      return <DelayedFallback fallback={fallback} delay={delay}>{content}</DelayedFallback>
    }

    return content
  }
}

export const withLazyLoad = <P extends object>(
  WrappedComponent: ComponentType<P>,
  options: LazyComponentProps = {}
) => {
  const { fallback = <div>Loading...</div> } = options

  return function LazyWrapper(props: P) {
    return (
      <Suspense fallback={fallback}>
        <WrappedComponent {...props} />
      </Suspense>
    )
  }
}

export default createLazyComponent