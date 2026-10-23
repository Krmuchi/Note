import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { FindMatch } from '@/utils/findInText'

interface FindMatchGutterProps {
  /** 全部命中（字符偏移） */
  matches: FindMatch[]
  /** 当前命中的下标 */
  current: number
  /** 正文总长度，用于把字符偏移换算成百分比位置 */
  contentLength: number
  /** 点击某个刻度时跳转到该命中 */
  onJump: (index: number) => void
  /** 当前挂载的 textarea 节点：用于跟随其滚动位置平移刻度 */
  textareaNode?: HTMLTextAreaElement | null
  /**
   * 富文本内核的滚动容器（编辑器根节点）。
   *
   * 旧实现只认 textareaNode 的 scrollHeight/scrollTop —— contenteditable 下
   * 该节点为 null，`if (!ta) return` 会让**可见区间底色永远停在初始值**
   * （表现为"整篇都可见"，用户看不出刻度带对应文档的哪一段）。
   * 传入滚动容器后两种内核共用同一套视口计算。
   */
  scrollContainer?: HTMLElement | null
}

/**
 * 查找命中位置刻度（右侧滚动条旁）。
 *
 * 编辑器是 textarea，DOM 层无法给"全部命中"加内联高亮（没有富文本层），
 * 旧实现只能"选中当前一处 + 滚动过去"，用户看不到一共几处、分别在哪 ——
 * 长文档里连续按"下一个"实际上是在盲找。
 *
 * 这里用一条与文档等长的刻度带解决可见性：每个命中一个短横线，
 * 当前命中高亮，点击刻度可直接跳过去。
 * 位置按**字符偏移占比**估算（而非精确像素行高），刻度是导航提示而非精确定位，
 * 这样不必随字号/换行/软换行重新测量，成本恒定。
 */
export const FindMatchGutter: React.FC<FindMatchGutterProps> = ({
  matches,
  current,
  contentLength,
  onJump,
  textareaNode,
  scrollContainer,
}) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState<{ top: number; height: number }>({ top: 0, height: 1 })

  // 跟随滚动位置：刻度带只在"可见区间"内绘制，避免几百个命中堆满整条
  useEffect(() => {
    /*
     * 统一取"可滚动元素"：富文本内核下是编辑器根节点，旧内核是 textarea。
     * 两者都有 scrollHeight / scrollTop / clientHeight，所以后续计算完全共用。
     */
    const el = (scrollContainer ?? textareaNode) as HTMLElement | null
    if (!el) return

    const update = (): void => {
      const total = el.scrollHeight || 1
      setViewport({
        top: el.scrollTop / total,
        height: (el.clientHeight || 1) / total,
      })
    }

    update()
    el.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [textareaNode, scrollContainer])

  const marks = useMemo(() => {
    if (contentLength <= 0 || matches.length === 0) return []
    return matches.map((match, index) => {
      const ratio = match.index / contentLength
      return { index, ratio, isCurrent: index === current }
    })
  }, [matches, current, contentLength])

  if (marks.length === 0) return null

  return (
    <div
      className="find-match-gutter"
      ref={trackRef}
      aria-hidden="true"
      title={`共 ${marks.length} 处命中`}
    >
      {/* 当前可见区间底色：让用户知道刻度对应文档的哪一段 */}
      <div
        className="find-match-viewport"
        style={{
          top: `${viewport.top * 100}%`,
          height: `${Math.min(100, viewport.height * 100)}%`,
        }}
      />
      {marks.map((mark) => (
        <button
          key={mark.index}
          type="button"
          tabIndex={-1}
          className={`find-match-mark ${mark.isCurrent ? 'current' : ''}`}
          style={{ top: `${mark.ratio * 100}%` }}
          onClick={() => onJump(mark.index)}
          aria-label={`跳转到第 ${mark.index + 1} 处命中`}
        />
      ))}
    </div>
  )
}

export default FindMatchGutter
