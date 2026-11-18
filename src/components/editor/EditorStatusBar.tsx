import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { getCursorPosition } from './cursorPosition';

interface EditorStatusBarProps {
  content: string;
  className?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** 当前挂载的 textarea DOM 节点（节点重建后监听器需重新绑定） */
  textareaNode?: HTMLTextAreaElement | null;
  /**
   * 富文本内核的光标位置来源。
   *
   * contenteditable 没有 selectionStart/End，`textareaNode` 为 null 时
   * 原来的实现会直接 return —— 状态栏的行列号会**永久停在"行 1, 列 1"**。
   * 传入这个函数后，改为监听文档的 selectionchange 并用它算行列号。
   */
  cursorInfoProvider?: () => { line: number; column: number; selectedChars: number; selectedWords: number } | null;
  /** 富文本内核的编辑器根节点（用于判断选区是否在编辑器内） */
  richEditorRoot?: HTMLElement | null;
}

/** 代码围栏行本身不是正文（三反引号 / 三个波浪线，可带语言标注） */
const FENCE_LINE_RE = /^\s{0,3}(?:`{3}|~{3})/;
/** 表格分隔行 |---|---| */
const TABLE_SEPARATOR_RE = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;
/** 分隔线 --- / *** / ___ */
const THEMATIC_BREAK_RE = /^\s{0,3}(?:[-*_]\s*){3,}$/;
/** 行首块标记：# 标题、> 引用、- / * / + / 1. 列表 */
const BLOCK_MARKER_RE = /^\s{0,3}(?:#{1,6}\s+|>\s?|(?:[-*+]|\d+[.)])\s+)/;
/** 任务列表的勾选框 [ ] / [x] */
const TASK_BOX_RE = /^\s*\[[ xX]\]\s+/;

/**
 * 剥离 Markdown 标记，得到"正文文字"（缺陷7）。
 *
 * 旧实现直接对 activeDoc.content 做 length / split —— 用户在编辑器里看到的是
 * 排版后的正文，状态栏却在数源码：一行 "## 标题" 算 4 个字、"**加粗**" 算 8 个字、
 * 链接 "[文字](https://很长的地址)" 把 URL 也算进字数、代码围栏行白算一行。
 * 这里按"行首块标记 → 链接括号 → 行内标记"的顺序剥一层，
 * 统计口径与预览里读到的文字基本一致；纯估算，不追求与渲染器逐字一致。
 */
function stripMarkdownForStats(text: string): string {
  return text
    .split('\n')
    // 代码围栏行：标记本身不计入任何统计
    .filter((line) => !FENCE_LINE_RE.test(line))
    .map((line) => {
      // 整行都是"排版结构"的行直接清空：表格分隔行、分隔线
      if (TABLE_SEPARATOR_RE.test(line) || THEMATIC_BREAK_RE.test(line)) return '';
      return (
        line
          .replace(BLOCK_MARKER_RE, '')
          .replace(TASK_BOX_RE, '')
          // 图片 / 链接：只留可见文字，丢掉括号里的地址
          .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
          // Wiki 链接 [[目标]] / [[目标|别名]]
          .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, '$2')
          .replace(/\[\[([^\]]*)\]\]/g, '$1')
          // 行内代码保留内容、去掉反引号
          .replace(/`([^`]*)`/g, '$1')
          // 加粗 / 斜体 / 删除线
          .replace(/(\*\*|__)(.*?)\1/g, '$2')
          .replace(/(\*|_)(.*?)\1/g, '$2')
          .replace(/~~(.*?)~~/g, '$1')
          // 残留的 HTML 标签（<br>、<u> 等）
          .replace(/<[^>]+>/g, '')
      );
    })
    .join('\n');
}

/** 统计文本信息（字数 / 字符 / 段落 / 阅读时长均按剥离标记后的正文计） */
function countTextStats(text: string): {
  characters: number;
  charactersNoSpaces: number;
  words: number;
  lines: number;
  paragraphs: number;
  readingTime: number;
} {
  if (!text) {
    return {
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      lines: 0,
      paragraphs: 0,
      readingTime: 0,
    };
  }

  // 行数按 **Markdown 源码** 计：用户对照编辑器行号时才对得上，表格行与围栏行也算行
  const lines = text.split('\n').length;

  const body = stripMarkdownForStats(text);

  // 字符数（含空格）
  const characters = body.length;

  // 字符数（不含空格）
  const charactersNoSpaces = body.replace(/\s/g, '').length;

  // 中文字符数
  const chineseChars = (body.match(/[\u4e00-\u9fff]/g) || []).length;

  // 英文单词数（不含中文字符）
  const englishWords = body
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0).length;

  // 总词数（中文按字计，英文按词计）
  const words = chineseChars + englishWords;

  // 段落数（非空行）
  const paragraphs = body.split('\n').filter(line => line.trim().length > 0).length;

  // 阅读时间（中文按 300 字/分钟，英文按 200 词/分钟）
  const chineseReadingTime = chineseChars / 300;
  const englishReadingTime = englishWords / 200;
  const readingTime = Math.ceil(chineseReadingTime + englishReadingTime);

  return {
    characters,
    charactersNoSpaces,
    words,
    lines,
    paragraphs,
    readingTime,
  };
}

/** 格式化数字 */
function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  return num.toLocaleString('zh-CN');
}

/** 获取选中文本信息 */
function getSelectionInfo(text: string, selectionStart: number, selectionEnd: number): { selectedChars: number; selectedWords: number } {
  if (!text || selectionStart === selectionEnd) {
    return { selectedChars: 0, selectedWords: 0 };
  }

  const selectedText = text.substring(selectionStart, selectionEnd);
  const selectedChars = selectedText.length;

  // 统计选中的词数
  const chineseChars = (selectedText.match(/[\u4e00-\u9fff]/g) || []).length;
  const englishWords = selectedText
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0).length;
  const selectedWords = chineseChars + englishWords;

  return { selectedChars, selectedWords };
}

/*
 * 行列号与选中统计的口径说明（缺陷6）。
 *
 * 两种内核的光标来源都只有 **Markdown 源码偏移**：
 * textarea 的 selectionStart 直接就是源码下标；富文本内核的
 * RichEditorHandle.getCursorInfo() 也是把 DOM 选区换算回源码偏移再算行列
 * （RichEditor 不能改，所以这里不去动它，只把口径讲清楚）。
 * 因此状态栏显示的行列号一定是"源码行 / 源码列"，与 Markdown 预览的排版
 * 行号并不一致 —— "**加粗**" 在源码里占 6 个字符，在预览里只显示 2 个字。
 * 写进 tooltip，而不是放任用户误读。
 */
const CURSOR_TITLE =
  '光标位置：按 Markdown 源码计（#、**、- 等标记也计入列号，与预览排版的行列不一致）';
const SELECTION_TITLE = '选中：按 Markdown 源码字符计（含标记符号），与右侧行列号同一口径';

/** 编辑器状态栏组件 */
export const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
  content,
  className = '',
  textareaRef,
  textareaNode,
  cursorInfoProvider,
  richEditorRoot,
}) => {
  const [cursorPosition, setCursorPosition] = useState({ line: 1, column: 1 });
  const [selectionInfo, setSelectionInfo] = useState({ selectedChars: 0, selectedWords: 0 });

  // 统计防抖：countTextStats 包含多次正则与 split，大文档每次击键全量计算开销明显，
  // 延迟 300ms 合并连续击键后再统计
  const [debouncedContent, setDebouncedContent] = useState(content);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedContent(content), 300);
    return () => clearTimeout(timer);
  }, [content]);

  const stats = useMemo(() => countTextStats(debouncedContent), [debouncedContent]);

  // 更新光标位置
  const updateCursorPosition = useCallback(() => {
    if (!textareaRef?.current) return;

    const ta = textareaRef.current;
    const position = getCursorPosition(ta.value, ta.selectionStart);
    setCursorPosition(position);

    const selection = getSelectionInfo(ta.value, ta.selectionStart, ta.selectionEnd);
    setSelectionInfo(selection);
  }, [textareaRef]);

  // 监听选择变化。依赖 textareaNode（而非 ref）：textarea 因预览/空态切换被重建后，
  // 监听器必须重新绑定到新节点，否则行列号显示永久冻结
  useEffect(() => {
    const ta = textareaNode;
    if (!ta) return;

    const handleSelectionChange = (): void => {
      updateCursorPosition();
    };

    ta.addEventListener('click', handleSelectionChange);
    ta.addEventListener('keyup', handleSelectionChange);
    ta.addEventListener('select', handleSelectionChange);

    return () => {
      ta.removeEventListener('click', handleSelectionChange);
      ta.removeEventListener('keyup', handleSelectionChange);
      ta.removeEventListener('select', handleSelectionChange);
    };
  }, [textareaNode, updateCursorPosition]);

  // 初始化光标位置
  useEffect(() => {
    updateCursorPosition();
  }, [content, updateCursorPosition]);

  /**
   * 富文本内核：监听文档级 selectionchange 更新行列号。
   *
   * 不能用 textarea 的 click/keyup/select 那套 —— contenteditable 的选区变化
   * 只体现在 document 的 selectionchange 事件上（键盘移动光标、鼠标拖选、
   * 点选都会触发）。用 rAF 延后一拍：事件触发时选区有时还没完成布局。
   */
  useEffect(() => {
    if (!cursorInfoProvider) return;

    const handle = (): void => {
      requestAnimationFrame(() => {
        const info = cursorInfoProvider();
        if (!info) return;
        // 选区不在编辑器内（例如点了侧栏）时保持上一次的值，避免闪烁成"行1,列1"
        if (!richEditorRoot) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        if (!richEditorRoot.contains(sel.getRangeAt(0).startContainer)) return;

        setCursorPosition({ line: info.line, column: info.column });
        setSelectionInfo({ selectedChars: info.selectedChars, selectedWords: info.selectedWords });
      });
    };

    document.addEventListener('selectionchange', handle);
    handle();
    return () => document.removeEventListener('selectionchange', handle);
  }, [cursorInfoProvider, richEditorRoot]);

  return (
    /*
     * P2-10：状态栏做成可聚焦的分组（tabIndex=0）。
     *
     * 次要统计（字符/段落/阅读时长）默认收起、只有 :hover 才展开 ——
     * 触屏（无 hover）与键盘用户此前**永远看不到**这些数据。
     * 配合 editor.css 的 :focus-within 与 @media (hover:none) 规则，
     * Tab 到状态栏同样能展开，与 A1/A4 那轮覆盖的 hover 控件同一口径。
     */
    <div className={`editor-status-bar ${className}`} tabIndex={0} role="group" aria-label="文档统计（悬停或聚焦展开完整信息）">
      <div className="status-bar-left">
        <span
          className="status-item"
          title="字数：中文按字、英文按词；已剥离 Markdown 标记（#、**、- 等）与代码围栏行"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>{formatNumber(stats.words)} 字</span>
        </span>
        <span className="status-bar-extra">
          <span className="status-divider">|</span>
          <span className="status-item" title="字符数（不含空格）：按正文文字计，已剥离 Markdown 标记与链接地址">
            {formatNumber(stats.charactersNoSpaces)} 字符
          </span>
          <span className="status-divider">|</span>
          <span className="status-item" title="行数：按 Markdown 源码行计（含标题行、代码围栏行）">
            {formatNumber(stats.lines)} 行
          </span>
          <span className="status-divider">|</span>
          <span className="status-item" title="段落数：正文非空行（已剥离 Markdown 标记）">
            {formatNumber(stats.paragraphs)} 段
          </span>
        </span>
        {selectionInfo.selectedChars > 0 && (
          <span
            className="status-item status-selection"
            title={`${SELECTION_TITLE}；约 ${selectionInfo.selectedWords} 词`}
          >
            已选择 {formatNumber(selectionInfo.selectedChars)} 字符
          </span>
        )}
      </div>
      <div className="status-bar-right">
        <span className="status-bar-extra">
          <span className="status-item" title="预计阅读时间：按正文文字计算，中文 300 字/分钟、英文 200 词/分钟">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>约 {stats.readingTime} 分钟阅读</span>
          </span>
          <span className="status-divider">|</span>
        </span>
        <span className="status-item status-cursor" title={CURSOR_TITLE} aria-label={CURSOR_TITLE}>
          行 {cursorPosition.line}, 列 {cursorPosition.column}
        </span>
      </div>
    </div>
  );
};

export default EditorStatusBar;
