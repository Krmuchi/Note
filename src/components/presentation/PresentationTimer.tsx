import { useEffect, useState } from 'react'
import type { JSX } from 'react'

/**
 * 演示计时器。
 *
 * 从 PresentationMode 里抽出来单独成组件的原因：计时每秒 setState 一次，
 * 如果 state 在 PresentationMode 里，整页（含 MarkdownPreview 渲染整篇文档、
 * 激光笔层、工具栏）都会每秒重渲染一遍。隔离后每秒只有一个 <span> 更新。
 */

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

interface PresentationTimerProps {
  running: boolean
  /**
   * 渲染方式由调用方决定，这里只负责提供时间。
   *
   * 换文档重置计时**不在这里做**：调用方给组件加 `key={docId}` 即可 ——
   * key 变化会让组件整体重新挂载，state 自然归零。
   * 用 effect 里 setSeconds(0) 会触发级联渲染，也被
   * react-hooks/set-state-in-effect 规则拦下。
   */
  children: (formatted: string) => JSX.Element
}

export function PresentationTimer({ running, children }: PresentationTimerProps): JSX.Element {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  return children(formatTime(seconds))
}

export default PresentationTimer
