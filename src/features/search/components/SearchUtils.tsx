import { useMemo, useRef, useEffect, useCallback, useState } from 'react'
import { escapeRegExp } from '@/shared/utils'

interface HighlightTextProps {
  text: string
  query: string
}

export const HighlightText: React.FC<HighlightTextProps> = ({ text, query }) => {
  const parts = useMemo(() => {
    if (!query.trim()) return [text]
    return text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'))
  }, [text, query])
  
  if (!query.trim()) return <>{text}</>
  
  return (
    <>
      {parts.map((part, i) => 
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i}>{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  )
}

interface WorkerSearchResult {
  docId: string
  notebookId: string
  titleMatch: boolean
  contentMatches: Array<{ lineIndex: number; content: string }>
  tagMatches: string[]
  score: number
}

interface WorkerNotebook {
  id: string
  title: string
  docs: Array<{
    id: string
    title: string
    content: string
    tags: string[]
  }>
}

export const useSearchWorker = () => {
  const workerRef = useRef<Worker | null>(null)
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    try {
      workerRef.current = new Worker('/searchWorker.js')
    } catch {
      console.warn('Web Worker not available, search will run on main thread')
      workerRef.current = null
    }
    
    return () => {
      workerRef.current?.terminate()
    }
  }, [])

  const search = useCallback((
    searchText: string, 
    notebooks: WorkerNotebook[], 
    options?: { caseSensitive?: boolean }
  ): Promise<WorkerSearchResult[]> => {
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve([])
        return
      }
      
      setIsSearching(true)
      
      const timeout = setTimeout(() => {
        setIsSearching(false)
        resolve([])
      }, 10000)
      
      workerRef.current.onmessage = (e: MessageEvent<{ type: string; results: WorkerSearchResult[] }>) => {
        clearTimeout(timeout)
        setIsSearching(false)
        if (e.data.type === 'results') {
          resolve(e.data.results)
        }
      }
      
      workerRef.current.onerror = () => {
        clearTimeout(timeout)
        setIsSearching(false)
        resolve([])
      }
      
      workerRef.current.postMessage({ 
        type: 'search',
        searchText, 
        notebooks, 
        options: options || {} 
      })
    })
  }, [])

  return { search, isSearching }
}