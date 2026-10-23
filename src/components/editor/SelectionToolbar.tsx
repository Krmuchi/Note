import React, { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 格式图标（内联 SVG）。
 *
 * 不复用 Icon.tsx：那套是通用线性图标集（书/文档/搜索…），没有格式类图形；
 * 这里直接沿用 EditorHeaderInlineFormatGroup 的路径，保证与顶部工具栏**视觉一致**。
 */
const I = (d: React.ReactNode, strokeWidth = 2): React.FC<{ size?: number }> => {
  const Comp: React.FC<{ size?: number }> = ({ size = 15 }) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {d}
    </svg>
  )
  return Comp
}

const IconBold = I(
  <>
    <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
  </>,
  3,
)
const IconItalic = I(
  <>
    <line x1="19" y1="4" x2="10" y2="4" />
    <line x1="14" y1="20" x2="5" y2="20" />
    <line x1="15" y1="4" x2="9" y2="20" />
  </>,
)
const IconStrikethrough = I(
  <>
    <path d="M16 4H9a3 3 0 0 0-3 3 3 3 0 0 0 3 3h6" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <path d="M15 12a3 3 0 1 1 0 6H8" />
  </>,
)
const IconCode = I(
  <>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </>,
)
const IconQuote = I(
  <>
    <path d="M4 5h16" />
    <path d="M8 12h12" />
    <path d="M8 19h12" />
    <path d="M4 12v7" />
  </>,
)
const IconH1 = I(
  <>
    <path d="M4 6v12" />
    <path d="M12 6v12" />
    <path d="M4 12h8" />
    <path d="M17 10l2-2v10" />
  </>,
)
const IconLink = I(
  <>
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </>,
)

/**
 * 划词浮层工具栏（语雀式）。
 *
 * 为什么需要：语雀最标志性的操作感就是"选中文字 → 浮层立刻出现在选区上方，
 * 点一下加粗"。原内核用 textarea，做不到"贴着选区浮动"；contenteditable +
 * Range 才能拿到选区的真实屏幕坐标。
 *
 * 设计要点：
 * - 只在**真实选区**（非折叠、有内容）时出现，空光标不弹 —— 否则打字时会一直挡着。
 * - 定位用 `Range.getBoundingClientRect()`，浮层放在选区**上方**（下方会盖住下一行）。
 * - 浮层自己会夺焦，所以按钮用 `onMouseDown={preventDefault}` 保住选区；
 *   否则点按钮时选区先丢失，命令作用不到任何文字（这是浮层工具栏最常见的坑）。
 * - 用 fixed 定位 + 视口坐标，不受编辑器滚动容器影响。
 */

export interface SelectionToolbarProps {
  /** 浮层所在的可编辑根节点；为 null 时不挂载监听 */
  root: HTMLElement | null
  /** 执行格式命令（复用既有 applyFormat，保证与顶部工具栏行为一致） */
  onFormat: (id: string) => void
  /** 触发插入链接 */
  onLink: () => void
  /** 预览模式下不显示 */
  enabled?: boolean
}

const TOOLBAR_ITEMS: Array<{ id: string; title: string; Icon: React.FC<{ size?: number }> }> = [
  { id: 'bold', title: '加粗', Icon: IconBold },
  { id: 'italic', title: '斜体', Icon: IconItalic },
  // id 必须与 FormatType 对齐：'strikethrough' / 'h1' 在 applyFormat 里没有对应分支，
  // 会被当成未知类型静默丢弃（实测：浮层里的删除线、标题按钮点了没反应）
  { id: 'strike', title: '删除线', Icon: IconStrikethrough },
  { id: 'code', title: '行内代码', Icon: IconCode },
  { id: 'heading1', title: '标题', Icon: IconH1 },
  { id: 'quote', title: '引用', Icon: IconQuote },
]

export const SelectionToolbar: React.FC<SelectionToolbarProps> = ({
  root,
  onFormat,
  onLink,
  enabled = true,
}) => {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  /**
   * 用户点顶部工具栏 / 下拉菜单时收起浮层。
   *
   * 浮层固定在选区上方（fixed），下拉菜单展开时两者会重叠，浮层会**挡住菜单项**
   * 的点击（实测：选中文字后打开「段落样式」，点不到「标题 2」）。
   * 点击编辑器正文则恢复显示。
   */
  const [dismissed, setDismissed] = useState(false)
  /**
   * dismissed 的同步镜像：rAF 回调里必须读到**当下**的值。
   * 只用 state 会有竞态 —— 点击顶部工具栏前排队的那一帧 rAF 会在
   * 收起之后又把浮层显示出来（实测：浮层仍挡着下拉菜单）。
   */
  const dismissedRef = useRef(false)

  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('.eh-header')) {
        dismissedRef.current = true
        setDismissed(true)
      } else if (root?.contains(target)) {
        dismissedRef.current = false
        setDismissed(false)
      }
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [root])

  /**
   * 重新计算浮层位置。
   *
   * 用 requestAnimationFrame 延后一帧：selectionchange 触发时选区矩形
   * 有时还没完成布局，立即读取会拿到 (0,0) 或旧值 —— 表现为浮层闪到左上角。
   */
  const reposition = useCallback(() => {
    if (!enabled || !root || dismissed) {
      setPos(null)
      return
    }
    requestAnimationFrame(() => {
      if (dismissedRef.current) {
        setPos(null)
        return
      }
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
        setPos(null)
        return
      }
      const range = sel.getRangeAt(0)
      // 选区必须落在编辑器内，避免选中侧栏文字时也弹浮层
      if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
        setPos(null)
        return
      }
      const text = sel.toString().trim()
      if (!text) {
        setPos(null)
        return
      }

      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        setPos(null)
        return
      }
      // 浮层宽约 260px、高约 36px：水平居中于选区，垂直放在选区上方
      const TOOLBAR_W = 260
      const TOOLBAR_H = 36
      const left = Math.min(
        Math.max(8, rect.left + rect.width / 2 - TOOLBAR_W / 2),
        window.innerWidth - TOOLBAR_W - 8,
      )
      // 上方空间不足时改放到选区下方（贴住底边，避免压住文字）
      const above = rect.top - TOOLBAR_H - 8
      const top = above > 8 ? above : Math.min(rect.bottom + 8, window.innerHeight - TOOLBAR_H - 8)
      setPos({ top, left })
    })
  }, [enabled, root, dismissed])

  useEffect(() => {
    if (dismissed) return
    if (!enabled || !root) return
    document.addEventListener('selectionchange', reposition)
    // 滚动/改变窗口尺寸后选区位置会变，需要重算，否则浮层停在旧位置
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('selectionchange', reposition)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [enabled, root, reposition, dismissed])

  if (!pos || dismissed) return null

  return (
    <div
      className="selection-toolbar"
      style={{ top: pos.top, left: pos.left }}
      /*
       * 保住选区：浮层内的 mousedown 默认会让编辑器失焦、选区消失，
       * 那样后续命令就没有作用对象了。preventDefault 阻止焦点转移。
       */
      onMouseDown={(e) => e.preventDefault()}
      role="toolbar"
      aria-label="选中文字格式"
    >
      {TOOLBAR_ITEMS.map(({ id, title, Icon }) => (
        <button
          key={id}
          type="button"
          className="selection-toolbar-btn"
          title={title}
          onClick={() => onFormat(id)}
        >
          <Icon size={15} />
        </button>
      ))}
      <span className="selection-toolbar-sep" aria-hidden="true" />
      <button
        type="button"
        className="selection-toolbar-btn"
        title="插入链接"
        onClick={onLink}
      >
        <IconLink size={15} />
      </button>
    </div>
  )
}

export default SelectionToolbar
