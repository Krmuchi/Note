import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  computeScrollTop,
  findMatches,
  lineIndexAt,
  measureLineHeight,
  replaceAllMatches,
  replacementTextFor,
  type FindMatch,
} from '@/utils/findInText'
import { toast } from '@/components/common/Toast'
import { confirmAction } from '@/hooks/useConfirmAction'

interface EditorFindBarProps {
  content: string
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  /**
   * 富文本内核下的"按 Markdown 偏移选中并滚动"。
   *
   * 新内核（contenteditable）没有 textarea 的 setSelectionRange，
   * 由 Editor 传入 RichEditorHandle.selectRange；为 undefined 时走 textarea 分支。
   */
  selectRangeInRichEditor?: (start: number, end: number) => boolean
  onReplaceContent: (next: string) => void
  onClose: () => void
  /**
   * 关闭后把焦点还给编辑器（缺陷9）。
   * 富文本内核下 textareaRef 为 null，`textareaRef.current?.focus()` 静默跳过，
   * 焦点落到 body，用户接着打字毫无反应。由 Editor 注入对应内核的聚焦函数。
   */
  onFocusEditor?: () => void
  /** 由 Ctrl+H 打开时直接展开替换行 */
  initialShowReplace?: boolean
  /**
   * 替换行显隐变化时通知父组件（可选，用于让 Editor 的 findBar.replace 跟着同步）。
   *
   * 没有它也不会坏：initialShowReplace 变化时本组件会自我同步。
   * 但"用户按 Esc 收起替换行"是我们内部的局部状态，Editor 并不知道，
   * 它仍以为 replace=true —— 这时再按 Ctrl+H，prop 没有从 false 变 true，
   * 组件收不到信号，替换行就打不开了。接了这条回调后 Editor 能把状态复位，
   * 下一次 Ctrl+H 才是一次真正的 false→true 变化。
   */
  onShowReplaceChange?: (showReplace: boolean) => void
  /** 预填关键词：搜索面板跳转过来时直接定位到首个命中（S1） */
  initialQuery?: string
  /**
   * 命中信息上抛：右侧刻度带需要"全部命中 + 当前下标 + 正文长度"才能绘制。
   * 由 Editor 持有并渲染，避免 FindBar 自己再插一层布局。
   */
  onMatchesChange?: (info: { matches: FindMatch[]; current: number; contentLength: number } | null) => void
  /**
   * 注册"跳到第 N 处命中"的函数（返回取消注册）。
   * 刻度带的点击要复用 FindBar 内部的 jumpTo（含选中与滚动），
   * 与既有的 onRegisterEditorScrollSync 是同一套 ref 直通模式。
   */
  onRegisterJump?: (fn: ((index: number) => void) | null) => void
  /**
   * 编辑器是否已挂载。
   *
   * 旧内核（EditorContent）改成 React.lazy 后，查找栏可能先于编辑器出现：
   * `jumpTo` 里 `if (!ta) return` 会静默跳过且不再重试 ——
   * 表现为"查找栏打开了、命中数也对，但没有选中任何一处"。
   * 这个值从 false 变 true 时重新定位一次。
   */
  editorReady?: boolean
}

/**
 * 文档内查找 / 替换（BUG-3）。
 *
 * 之前编辑器完全没有查找能力：长文档里找一句话只能靠肉眼，
 * 而从搜索面板跳进文档后也定位不到具体那句话，形成完整断链。
 */
export const EditorFindBar: React.FC<EditorFindBarProps> = ({
  content,
  textareaRef,
  selectRangeInRichEditor,
  onReplaceContent,
  onClose,
  onFocusEditor,
  initialShowReplace = false,
  initialQuery = '',
  onMatchesChange,
  onRegisterJump,
  editorReady = false,
  onShowReplaceChange,
}) => {
  const [query, setQuery] = useState(initialQuery)
  const [replacement, setReplacement] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [regexMode, setRegexMode] = useState(false)
  const [showReplace, setShowReplace] = useState(initialShowReplace)
  const [current, setCurrent] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const { matches, valid, error: patternError, regexp } = useMemo(
    () => findMatches(content, query, { caseSensitive, wholeWord, regex: regexMode }),
    [content, query, caseSensitive, wholeWord, regexMode],
  )
  const safeCurrent = matches.length === 0 ? -1 : Math.min(current, matches.length - 1)

  /** focus=false 用于"边输入边定位"：只选中与滚动，不抢走输入框的焦点 */
  const jumpTo = useCallback(
    (index: number, focus: boolean) => {
      const match = matches[index]
      if (!match) return

      // 富文本内核：按 Markdown 偏移在 DOM 里选中（没有 setSelectionRange）
      if (selectRangeInRichEditor) {
        selectRangeInRichEditor(match.index, match.index + match.length)
        return
      }

      const ta = textareaRef.current
      if (!ta) return
      if (focus) ta.focus()
      ta.setSelectionRange(match.index, match.index + match.length)
      ta.scrollTop = computeScrollTop(lineIndexAt(content, match.index), measureLineHeight(ta), ta.clientHeight)
    },
    [content, matches, textareaRef, selectRangeInRichEditor],
  )

  /**
   * 查询条件或内容变化后把当前命中保持在视口内（纯 DOM 操作，不 setState）。
   *
   * `editorReady` 必须进依赖：旧内核（EditorContent）已改成 React.lazy，
   * 查找栏出现时 textarea 可能还没挂载 —— jumpTo 里的 `if (!ta) return`
   * 会直接跳过且永不重试，表现为"查找栏打开了，但没选中任何命中"。
   * 编辑器一旦就绪（textareaRef 或富文本 root 有值）就重新跑一次。
   */
  useEffect(() => {
    if (safeCurrent >= 0) jumpTo(safeCurrent, false)
  }, [jumpTo, safeCurrent, editorReady])

  // 命中信息上抛给 Editor 的刻度带；组件卸载时清空，避免刻度残留在关闭后的编辑器上
  useEffect(() => {
    if (!onMatchesChange) return
    onMatchesChange({ matches, current: safeCurrent, contentLength: content.length })
    return () => onMatchesChange(null)
  }, [matches, safeCurrent, content.length, onMatchesChange])

  // 把"跳到第 N 处"注册给刻度带：点击刻度时既切当前下标，也把选区/滚动带过去
  useEffect(() => {
    if (!onRegisterJump) return
    onRegisterJump((index: number) => {
      setCurrent(index)
      jumpTo(index, true)
    })
    return () => onRegisterJump(null)
  }, [onRegisterJump, jumpTo])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  /*
   * Ctrl+H 已打开查找栏时不会重新挂载（Editor 用的是同一个组件实例），
   * `useState(initialShowReplace)` 只在首次渲染取值 —— 用户第二次按 Ctrl+H
   * 就再也打不开替换行。这里跟随 props 变化同步，既不用换 key 重挂载
   * （会丢掉已输入的关键词），也能让 Esc 收起替换行后再次 Ctrl+H 生效。
   *
   * 用"渲染期比对上一次 props"而不是 useEffect 里的 setState：
   * 前者是 React 官方推荐的"随 props 调整 state"写法，不会多一轮渲染；
   * 后者会触发 react-hooks/set-state-in-effect（级联渲染告警）。
   */
  const [prevInitialShowReplace, setPrevInitialShowReplace] = useState(initialShowReplace)
  if (prevInitialShowReplace !== initialShowReplace) {
    setPrevInitialShowReplace(initialShowReplace)
    setShowReplace(initialShowReplace)
  }

  const handleNext = useCallback(() => {
    if (matches.length === 0) return
    const next = (safeCurrent + 1) % matches.length
    setCurrent(next)
    jumpTo(next, true)
  }, [jumpTo, matches.length, safeCurrent])

  const handlePrev = useCallback(() => {
    if (matches.length === 0) return
    const prev = (safeCurrent - 1 + matches.length) % matches.length
    setCurrent(prev)
    jumpTo(prev, true)
  }, [jumpTo, matches.length, safeCurrent])

  /**
   * 替换当前并前进（缺陷1）。
   *
   * 旧实现只把新内容交给 onReplaceContent，current 不动：替换文本仍匹配原查询时，
   * 下一次"替换"还落在同一处（因为 re-render 后 matches 又指向同一段新文本）。
   * 现在按"新内容重新算命中"的方式推算下一处的位置：
   * 下次渲染的 current 是"第一处 index ≥ 本处替换结束位置"的命中，没有就回到第一处。
   */
  const handleReplaceCurrent = useCallback(() => {
    const match = matches[safeCurrent]
    if (!match) return

    const inserted = replacementTextFor(content, match, replacement, regexp)
    const next = content.slice(0, match.index) + inserted + content.slice(match.index + match.length)
    const cursor = match.index + inserted.length

    const { matches: nextMatches } = findMatches(next, query, {
      caseSensitive,
      wholeWord,
      regex: regexMode,
    })
    let nextIndex = nextMatches.findIndex((item) => item.index >= cursor)
    if (nextIndex === -1 && nextMatches.length > 0) nextIndex = 0

    setCurrent(nextIndex >= 0 ? nextIndex : 0)
    onReplaceContent(next)
  }, [
    caseSensitive,
    content,
    matches,
    onReplaceContent,
    query,
    regexMode,
    regexp,
    replacement,
    safeCurrent,
    wholeWord,
  ])

  /**
   * 全部替换（缺陷3）。
   *
   * 旧实现只有"事后 toast"—— 一次误点就会把整篇文档的关键词全部改掉且无法逐处撤销。
   * 现在先走全局 ConfirmDialog：取消则一个字都不动。
   */
  const handleReplaceAll = useCallback(() => {
    if (matches.length === 0) return
    const count = matches.length
    confirmAction({
      title: '全部替换',
      message: `将把文档中全部 ${count} 处「${query}」替换为「${replacement}」，此操作会一次性修改整篇文档，确定继续吗？`,
      confirmText: '全部替换',
      onConfirm: () => {
        onReplaceContent(replaceAllMatches(content, matches, replacement, regexp))
        setCurrent(0)
        toast.success(`已替换 ${count} 处`)
      },
    })
  }, [content, matches, onReplaceContent, query, regexp, replacement])

  const handleClose = useCallback(() => {
    onClose()
    // 缺陷9：富文本内核下 textareaRef 为 null，必须走注入的聚焦回调，
    // 否则焦点落到 body，用户关闭查找栏后接着打字毫无反应。
    if (onFocusEditor) onFocusEditor()
    else textareaRef.current?.focus()
  }, [onClose, onFocusEditor, textareaRef])

  /**
   * Esc 先收替换行、再关查找栏（缺陷4）。
   *
   * 替换行展开时按 Esc 的意图是"收起这一行"；旧实现直接关掉整个查找栏，
   * 用户想退一步回到纯查找就得重按 Ctrl+F 并重新输入关键词。
   */
  const handleEscape = useCallback(() => {
    if (showReplace) {
      setShowReplace(false)
      onShowReplaceChange?.(false)
      inputRef.current?.focus()
      return
    }
    handleClose()
  }, [handleClose, onShowReplaceChange, showReplace])

  /** 替换行的显隐切换：同步本地状态，并把选择告知父组件（如果接了回调） */
  const toggleShowReplace = useCallback(
    (next: boolean) => {
      setShowReplace(next)
      onShowReplaceChange?.(next)
    },
    [onShowReplaceChange],
  )

  const handleFindKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) handlePrev()
      else handleNext()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleEscape()
    }
  }

  /**
   * 替换框的 Enter 是"替换并前进"（缺陷2）。
   *
   * 旧实现与查找框共用同一个 handleInputKeyDown，Enter 被绑成"下一个" ——
   * 用户在替换框里敲回车本来就想替换，结果只是移动了光标，
   * 得再用鼠标去点「替换」按钮。Shift+Enter 保留为"上一个"，与查找框一致。
   */
  const handleReplaceKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) handlePrev()
      else handleReplaceCurrent()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleEscape()
    }
  }

  const countLabel = !query
    ? ''
    : !valid
      ? '正则无效'
      : matches.length === 0
        ? '无结果'
        : `${safeCurrent + 1}/${matches.length}`

  return (
    <div className="find-bar" role="search" aria-label="文档内查找">
      <div className="find-bar-row">
        <input
          ref={inputRef}
          className="find-bar-input"
          placeholder={regexMode ? '查找（正则）…' : '查找…'}
          value={query}
          aria-label="查找内容"
          aria-invalid={!valid}
          title={!valid ? patternError : undefined}
          style={!valid ? { borderColor: 'var(--error-500)' } : undefined}
          onChange={(e) => {
            setQuery(e.target.value)
            setCurrent(0)
          }}
          onKeyDown={handleFindKeyDown}
        />
        <span
          className="find-bar-count"
          aria-live="polite"
          style={!valid ? { color: 'var(--error-500)' } : undefined}
          title={!valid ? patternError : undefined}
        >
          {countLabel}
        </span>
        <button type="button" className="find-bar-btn" onClick={handlePrev} disabled={matches.length === 0} title="上一个（Shift+Enter）" aria-label="上一个匹配">
          ↑
        </button>
        <button type="button" className="find-bar-btn" onClick={handleNext} disabled={matches.length === 0} title="下一个（Enter）" aria-label="下一个匹配">
          ↓
        </button>
        <button
          type="button"
          className={`find-bar-btn ${caseSensitive ? 'active' : ''}`}
          onClick={() => {
            setCaseSensitive((v) => !v)
            setCurrent(0)
          }}
          title="区分大小写"
          aria-pressed={caseSensitive}
        >
          Aa
        </button>
        <button
          type="button"
          className={`find-bar-btn ${wholeWord ? 'active' : ''}`}
          onClick={() => {
            setWholeWord((v) => !v)
            setCurrent(0)
          }}
          title="全词匹配（中英文均按整词判定）"
          aria-label="全词匹配"
          aria-pressed={wholeWord}
        >
          全词
        </button>
        <button
          type="button"
          className={`find-bar-btn ${regexMode ? 'active' : ''}`}
          onClick={() => {
            setRegexMode((v) => !v)
            setCurrent(0)
          }}
          title="正则表达式"
          aria-label="正则表达式"
          aria-pressed={regexMode}
        >
          .*
        </button>
        <button
          type="button"
          className={`find-bar-btn ${showReplace ? 'active' : ''}`}
          onClick={() => toggleShowReplace(!showReplace)}
          title="替换"
          aria-pressed={showReplace}
        >
          ⇄
        </button>
        <button type="button" className="find-bar-btn find-bar-close" onClick={handleClose} title="关闭（Esc）" aria-label="关闭查找">
          ×
        </button>
      </div>

      {showReplace && (
        <div className="find-bar-row">
          <input
            className="find-bar-input"
            placeholder="替换为…"
            value={replacement}
            aria-label="替换内容"
            title={regexMode ? '支持 $1 / $& 捕获组引用' : undefined}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
          />
          <button type="button" className="find-bar-btn find-bar-text-btn" onClick={handleReplaceCurrent} disabled={matches.length === 0} title="替换并前进（Enter）">
            替换
          </button>
          <button type="button" className="find-bar-btn find-bar-text-btn" onClick={handleReplaceAll} disabled={matches.length === 0} title="全部替换（需确认）">
            全部替换
          </button>
        </div>
      )}
    </div>
  )
}

export default EditorFindBar
