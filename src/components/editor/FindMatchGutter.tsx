import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/** 认为容器"真的能滚"的最小差值（px）；亚像素误差不算 */
const SCROLL_EPSILON = 1

/**
 * P1-7：刻度带上限。
 *
 * 刻度是"每个命中一个 <button>"，长文档搜一个高频字（"的"）能出上万个命中 ——
 * 这些节点随每次击键 / 每次"上一处下一处"整体重绘，是查找栏开着时打字卡顿的
 * 主要来源。超过上限时按比例抽样绘制：刻度本质是"位置分布提示"而不是
 * 逐条列表，抽样后视觉分布几乎一致，DOM 数量却被硬性封顶。
 * 命中**总数**仍由查找栏的计数与本容器的 title 如实展示，不丢信息。
 */
const MAX_MARKS = 400

/** 按固定步长抽样；保证当前命中一定被画出来（否则"当前在哪"会看不见） */
function sampleMarks(
  marks: Array<{ index: number; ratio: number; isCurrent: boolean }>,
  limit: number,
): Array<{ index: number; ratio: number; isCurrent: boolean }> {
  if (marks.length <= limit) return marks
  const step = marks.length / limit
  const sampled: typeof marks = []
  for (let i = 0; i < limit; i++) sampled.push(marks[Math.floor(i * step)])
  const current = marks.find((m) => m.isCurrent)
  if (current && !sampled.includes(current)) {
    // 用真实当前项替换抽样里最接近的一格，保证高亮不丢
    let nearest = 0
    for (let i = 1; i < sampled.length; i++) {
      if (Math.abs(sampled[i].ratio - current.ratio) < Math.abs(sampled[nearest].ratio - current.ratio)) nearest = i
    }
    sampled[nearest] = current
  }
  return sampled
}

/** 刻度带与滚动容器共用的一套坐标（全部相对刻度带盒子的顶边） */
interface GutterLayout {
  /** 正文 top=0 在刻度带坐标系里的 y（已扣掉 scrollTop） */
  base: number
  /** 刻度带自身高度 */
  height: number
  /** 滚动容器的内容总高度 */
  scrollHeight: number
  /** 滚动容器可视高度 */
  clientHeight: number
  /** 滚动容器可视区顶边在刻度带坐标系里的 y */
  viewTop: number
}

const EMPTY_LAYOUT: GutterLayout = {
  base: 0,
  height: 1,
  scrollHeight: 1,
  clientHeight: 1,
  viewTop: 0,
}

function isScrollable(el: HTMLElement | null): boolean {
  return !!el && el.scrollHeight > el.clientHeight + SCROLL_EPSILON
}

/**
 * 找刻度带的"几何锚点" —— 优先用传入的滚动容器自身。
 *
 * 旧实现把刻度按整条 wrapper 的高度铺开（CSS 上刻度带是 absolute 覆盖 wrapper），
 * 却拿滚动容器的 scrollHeight 算可见区；两个盒子不是同一个（wrapper 里还有标题、
 * 内边距，或刻度带只盖住滚动容器的一部分）时刻度会整体偏移、越往下越歪。
 * 现在刻度与可见区统一用"滚动容器相对刻度带的坐标"换算，口径只有一个。
 */
function resolveScroller(preferred: HTMLElement | null, gutter: HTMLElement | null): HTMLElement | null {
  // 传入的节点优先（哪怕暂时还没溢出：空文档 / 刚挂载时也按它算）
  if (preferred) return preferred
  // 没传：从刻度带向上找真正可滚动的祖先，而不是直接退回整条 wrapper
  let node = gutter?.parentElement ?? null
  while (node) {
    if (isScrollable(node)) return node
    node = node.parentElement
  }
  return null
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
  const [layout, setLayout] = useState<GutterLayout>(EMPTY_LAYOUT)

  // 跟随滚动位置：刻度带只在"可见区间"内绘制，避免几百个命中堆满整条
  useEffect(() => {
    const gutter = trackRef.current
    const el = resolveScroller((scrollContainer ?? textareaNode) as HTMLElement | null, gutter)
    if (!el || !gutter) {
      setLayout(EMPTY_LAYOUT)
      return
    }

    const update = (): void => {
      // 每次刷新都重新取 rect：窗口缩放、侧栏折叠、工具栏换行都会改变几何
      const box = gutter.getBoundingClientRect()
      const elBox = el.getBoundingClientRect()
      const scrollHeight = el.scrollHeight || 1
      const clientHeight = el.clientHeight || 1
      const viewTop = elBox.top - box.top
      setLayout({
        // 内容原点 = 可视区顶边 - 已滚过的距离
        base: viewTop - el.scrollTop,
        height: box.height || 1,
        scrollHeight,
        clientHeight,
        viewTop,
      })
    }

    update()
    el.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    // 容器尺寸变化（分栏、面板展开、字号调整、内容增减）也要重新测量
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    observer?.observe(gutter)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
      observer?.disconnect()
    }
  }, [textareaNode, scrollContainer, contentLength, matches.length])

  /** 文档位置占比（0~1）→ 刻度带内的百分比；越界贴边 */
  const toPercent = useCallback(
    (ratio: number): number => {
      const safeRatio = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0
      const y = layout.base + safeRatio * layout.scrollHeight
      return Math.min(100, Math.max(0, (y / layout.height) * 100))
    },
    [layout],
  )

  const viewport = useMemo(
    () => ({
      top: Math.min(100, Math.max(0, (layout.viewTop / layout.height) * 100)),
      height: Math.min(100, Math.max(0, (layout.clientHeight / layout.height) * 100)),
    }),
    [layout],
  )

  const marks = useMemo(() => {
    if (contentLength <= 0 || matches.length === 0) return []
    return matches.map((match, index) => {
      const ratio = match.index / contentLength
      return { index, ratio, isCurrent: index === current }
    })
  }, [matches, current, contentLength])

  if (marks.length === 0) return null

  // P1-7：命中过多时按比例抽样绘制（总数由 title 与查找栏计数如实展示）
  const visibleMarks = sampleMarks(marks, MAX_MARKS)

  return (
    <div
      className="find-match-gutter"
      ref={trackRef}
      aria-hidden="true"
      title={marks.length > visibleMarks.length ? `共 ${marks.length} 处命中（刻度已按 ${visibleMarks.length} 处抽样显示）` : `共 ${marks.length} 处命中`}
    >
      {/* 当前可见区间底色：让用户知道刻度对应文档的哪一段 */}
      <div
        className="find-match-viewport"
        style={{
          top: `${viewport.top}%`,
          height: `${viewport.height}%`,
        }}
      />
      {visibleMarks.map((mark) => (
        <button
          key={mark.index}
          type="button"
          tabIndex={-1}
          className={`find-match-mark ${mark.isCurrent ? 'current' : ''}`}
          style={{ top: `${toPercent(mark.ratio)}%` }}
          onClick={() => onJump(mark.index)}
          aria-label={`跳转到第 ${mark.index + 1} 处命中`}
        />
      ))}
    </div>
  )
}

export default FindMatchGutter
