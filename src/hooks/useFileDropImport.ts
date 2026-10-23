import { useEffect, useRef, useState } from 'react'
import { deriveDocFromFile, isImportableFileName } from '@/utils/droppedFiles'

interface UseFileDropImportOptions {
  /** 收到已解析好的文档（标题 + 正文），由调用方决定落到哪个知识库 */
  onImport: (docs: { title: string; content: string }[]) => void
  enabled?: boolean
}

/**
 * 拖文件到窗口导入（P6）。
 *
 * 两个必须处理的细节：
 * 1. **不能抢编辑器的拖放**：编辑器的拖放处理器虽然 stopPropagation，但那是 React 合成事件，
 *    原生事件仍会冒泡到 window，所以这里要主动忽略落在 textarea 上的拖放。
 * 2. dragenter/dragleave 会在子元素间反复触发，用计数器配对，归零才收起遮罩。
 */
export function useFileDropImport({ onImport, enabled = true }: UseFileDropImportOptions): {
  isDraggingFiles: boolean
} {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const counterRef = useRef(0)
  // onImport 每次渲染都可能变，用 ref 持有最新引用，避免反复重挂监听
  const onImportRef = useRef(onImport)

  useEffect(() => {
    onImportRef.current = onImport
  }, [onImport])

  useEffect(() => {
    if (!enabled) return

    const isOverEditor = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null
      return !!el?.closest?.('textarea, input, [data-no-file-drop]')
    }

    const dragFiles = (e: DragEvent): File[] => Array.from(e.dataTransfer?.files ?? [])

    const handleDragEnter = (e: DragEvent): void => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      if (isOverEditor(e.target)) return
      counterRef.current += 1
      setIsDraggingFiles(true)
    }

    const handleDragOver = (e: DragEvent): void => {
      if (!e.dataTransfer?.types?.includes('Files')) return
      if (isOverEditor(e.target)) return
      // 必须 preventDefault，否则浏览器不会把 drop 事件交给我们
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }

    const handleDragLeave = (e: DragEvent): void => {
      if (isOverEditor(e.target)) return
      counterRef.current = Math.max(0, counterRef.current - 1)
      if (counterRef.current === 0) setIsDraggingFiles(false)
    }

    const handleDrop = (e: DragEvent): void => {
      if (isOverEditor(e.target)) return
      const files = dragFiles(e).filter((file) => isImportableFileName(file.name))
      counterRef.current = 0
      setIsDraggingFiles(false)
      if (files.length === 0) return

      e.preventDefault()
      void Promise.all(
        files.map(async (file) => deriveDocFromFile(file.name, await file.text())),
      ).then((docs) => {
        if (docs.length > 0) onImportRef.current(docs)
      })
    }

    window.addEventListener('dragenter', handleDragEnter)
    window.addEventListener('dragover', handleDragOver)
    window.addEventListener('dragleave', handleDragLeave)
    window.addEventListener('drop', handleDrop)
    return () => {
      window.removeEventListener('dragenter', handleDragEnter)
      window.removeEventListener('dragover', handleDragOver)
      window.removeEventListener('dragleave', handleDragLeave)
      window.removeEventListener('drop', handleDrop)
    }
  }, [enabled])

  return { isDraggingFiles }
}
