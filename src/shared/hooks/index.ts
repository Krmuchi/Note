import { useState, useCallback, useEffect } from 'react'

export const useLoading = () => {
  const [loadingTasks, setLoadingTasks] = useState<Set<string>>(new Set())
  
  const withLoading = useCallback(async <T,>(
    taskId: string,
    promise: Promise<T>
  ): Promise<T> => {
    setLoadingTasks(prev => new Set(prev).add(taskId))
    try {
      return await promise
    } finally {
      setLoadingTasks(prev => {
        const next = new Set(prev)
        next.delete(taskId)
        return next
      })
    }
  }, [])
  
  const isLoading = useCallback((taskId?: string) => {
    if (!taskId) return loadingTasks.size > 0
    return loadingTasks.has(taskId)
  }, [loadingTasks])
  
  return { withLoading, isLoading }
}

export const useTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => 
    localStorage.getItem('theme') as 'light' | 'dark' || 'light'
  )
  
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])
  
  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light')
  }, [])
  
  return { theme, toggleTheme }
}

export const useAsyncError = () => {
  const [error, setError] = useState<Error | null>(null)
  
  const handleAsync = useCallback(async <T,>(
    promise: Promise<T>,
    errorMessage?: string
  ): Promise<T | null> => {
    try {
      return await promise
    } catch (err) {
      const error = err instanceof Error ? err : new Error(errorMessage || '操作失败')
      setError(error)
      return null
    }
  }, [])
  
  return { error, handleAsync, clearError: () => setError(null) }
}

export const useDebounce = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}