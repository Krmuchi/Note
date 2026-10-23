import React, { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 块级悬浮手柄（语雀式）。
 *
 * 鼠标移入某个块时，该块左侧浮出两个按钮：
 * - `+` 插入按钮：在当前块下方插入一个新的空段落
 * - `⋮⋮` 拖拽手柄：点击弹出块菜单（转换类型 / 复制 / 删除 / 上移下移）
 *
 * 为什么单独做成一层而不是往每个块里塞按钮：
 * 1. 块是用户内容，往里塞 DOM 会被 `editorHtmlToMarkdown` 当成正文读走；
 * 2. 手柄需要绝对定位到"当前块"旁边，独立一层只需算一次坐标。
 *
 * 定位用**块元素的 getBoundingClientRect**，因此块高度不同（标题/列表/代码）
 * 也能精确贴住 —— 这也是不能只靠 CSS `::before` 的原因。
 */

/** 可转换的目标块类型；与 RichEditor.transformBlock 的入参一致 */
export type BlockTransformType =
  | 'paragraph'
  | 'h1' | 'h2' | 'h3'
  | 'ulist' | 'olist'
  | 'quote'
  | 'codeblock'

export interface BlockHandleProps {
  /** 编辑器根节点；为 null 时不工作 */
  root: HTMLElement | null
  /** 插入新块（在指定块之后） */
  onInsertAfter: (block: HTMLElement) => void
  /** 把块移动到目标位置（before/after 由调用方算好） */
  onMove: (block: HTMLElement, direction: -1 | 1) => void
  /** 删除块（至少保留一个可编辑块） */
  onDelete: (block: HTMLElement) => void
  /** 复制块（副本插在原块之后） */
  onDuplicate: (block: HTMLElement) => void
  /** 转换块类型 */
  onTransform: (block: HTMLElement, type: BlockTransformType) => void
  /** 预览模式下隐藏 */
  enabled?: boolean
}

interface HandleState {
  block: HTMLElement
  top: number
  left: number
}

interface MenuState {
  block: HTMLElement
  top: number
  left: number
}

const TRANSFORM_ITEMS: { type: BlockTransformType; label: string }[] = [
  { type: 'paragraph', label: '正文' },
  { type: 'h1', label: '标题 1' },
  { type: 'h2', label: '标题 2' },
  { type: 'h3', label: '标题 3' },
  { type: 'ulist', label: '无序列表' },
  { type: 'olist', label: '有序列表' },
  { type: 'quote', label: '引用' },
  { type: 'codeblock', label: '代码块' },
]

export const BlockHandle: React.FC<BlockHandleProps> = ({
  root,
  onInsertAfter,
  onMove,
  onDelete,
  onDuplicate,
  onTransform,
  enabled = true,
}) => {
  const [state, setState] = useState<HandleState | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  /** 拖拽中的块；非 null 表示正在拖动 */
  const draggingRef = useRef<HTMLElement | null>(null)
  /** 菜单打开期间不跟随鼠标移动（否则菜单会跟着鼠标漂移） */
  const menuOpenRef = useRef(false)

  useEffect(() => {
    menuOpenRef.current = menu !== null
  }, [menu])

  /**
   * 根据鼠标位置找它所在的顶层块。
   *
   * 用 `elementFromPoint` 而不是监听每个块的 mouseenter：
   * 后者要为每块绑一次事件，块增删后还要重绑，成本与出错面都更大。
   */
  const locate = useCallback(
    (x: number, y: number) => {
      if (!enabled || !root) {
        setState(null)
        return
      }
      const el = document.elementFromPoint(x, y) as HTMLElement | null
      if (!el || !root.contains(el)) {
        setState(null)
        return
      }
      // 向上找到 root 的直接子元素（即"块"）
      let node: HTMLElement | null = el
      while (node && node.parentElement !== root) {
        node = node.parentElement
      }
      if (!node) {
        setState(null)
        return
      }
      const rect = node.getBoundingClientRect()
      const rootRect = root.getBoundingClientRect()
      /*
       * 左侧留 8px 间距、垂直居中。
       * 手柄宽约 44px（两个 22px 按钮），要保证不压住正文：
       * 内容列左边界 = rootRect.left + paddingLeft，手柄贴在其外侧。
       */
      const padLeft = parseFloat(getComputedStyle(root).paddingLeft) || 0
      setState({
        block: node,
        top: rect.top + rect.height / 2 - 11,
        left: rootRect.left + padLeft - 46,
      })
    },
    [enabled, root],
  )

  useEffect(() => {
    if (!enabled || !root) return
    const onMouseMove = (e: MouseEvent): void => {
      // 拖拽 / 菜单打开期间不重新定位，否则手柄会跟着鼠标乱跑
      if (draggingRef.current || menuOpenRef.current) return
      locate(e.clientX, e.clientY)
    }
    const onLeave = (): void => {
      if (draggingRef.current || menuOpenRef.current) return
      setState(null)
    }
    root.addEventListener('mousemove', onMouseMove)
    root.addEventListener('mouseleave', onLeave)
    // 滚动后块位置变了，重新定位（用捕获阶段覆盖内部滚动容器）
    window.addEventListener('scroll', onLeave, true)
    return () => {
      root.removeEventListener('mousemove', onMouseMove)
      root.removeEventListener('mouseleave', onLeave)
      window.removeEventListener('scroll', onLeave, true)
    }
  }, [enabled, root, locate])

  /* 菜单：点击外部 / Esc 关闭 */
  useEffect(() => {
    if (!menu) return
    const onPointerDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null
      if (target?.closest('.block-menu, .block-handle')) return
      setMenu(null)
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  const openMenu = useCallback(() => {
    if (!state) return
    setMenu({ block: state.block, top: state.top + 24, left: state.left })
  }, [state])

  const runAndClose = useCallback((fn: (block: HTMLElement) => void) => {
    const block = menu?.block
    setMenu(null)
    if (block) fn(block)
  }, [menu])

  return (
    <>
      {state && (
        <div
          className="block-handle"
          style={{ top: state.top, left: state.left }}
          // 手柄自己不能夺焦：点它时编辑器要保持选区，否则命令作用不到内容
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            type="button"
            className="block-handle-btn"
            title="插入块"
            aria-label="在下方插入块"
            onClick={() => onInsertAfter(state.block)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            className={`block-handle-btn block-handle-grip ${menu ? 'active' : ''}`}
            title="块操作"
            aria-label="打开块菜单"
            aria-haspopup="menu"
            aria-expanded={!!menu}
            onClick={openMenu}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <circle cx="9" cy="6" r="1.6" />
              <circle cx="15" cy="6" r="1.6" />
              <circle cx="9" cy="12" r="1.6" />
              <circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="18" r="1.6" />
              <circle cx="15" cy="18" r="1.6" />
            </svg>
          </button>
        </div>
      )}

      {menu && (
        <div
          className="block-menu"
          role="menu"
          style={{ top: menu.top, left: menu.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="block-menu-label">转换为</div>
          <div className="block-menu-grid">
            {TRANSFORM_ITEMS.map((item) => (
              <button
                key={item.type}
                type="button"
                className="block-menu-chip"
                role="menuitem"
                onClick={() => runAndClose((block) => onTransform(block, item.type))}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="block-menu-divider" />

          <button type="button" className="block-menu-item" role="menuitem" onClick={() => runAndClose(onDuplicate)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="12" height="12" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            复制块
          </button>
          <button type="button" className="block-menu-item" role="menuitem" onClick={() => runAndClose(onDelete)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
            </svg>
            删除块
          </button>

          <div className="block-menu-divider" />

          <button type="button" className="block-menu-item" role="menuitem" onClick={() => runAndClose((block) => onMove(block, -1))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
            上移
          </button>
          <button type="button" className="block-menu-item" role="menuitem" onClick={() => runAndClose((block) => onMove(block, 1))}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
            下移
          </button>
        </div>
      )}
    </>
  )
}

export default BlockHandle
