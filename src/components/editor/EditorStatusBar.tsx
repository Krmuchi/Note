import React, { useMemo, useState, useEffect, useCallback } from 'react';

interface EditorStatusBarProps {
  content: string;
  className?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** 当前挂载的 textarea DOM 节点（节点重建后监听器需重新绑定） */
  textareaNode?: HTMLTextAreaElement | null;
}

/** 统计文本信息 */
function countTextStats(text: string) {
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

  // 字符数（含空格）
  const characters = text.length;

  // 字符数（不含空格）
  const charactersNoSpaces = text.replace(/\s/g, '').length;

  // 中文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;

  // 英文单词数（不含中文字符）
  const englishWords = text
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 0).length;

  // 总词数（中文按字计，英文按词计）
  const words = chineseChars + englishWords;

  // 行数
  const lines = text.split('\n').length;

  // 段落数（非空行）
  const paragraphs = text.split('\n').filter(line => line.trim().length > 0).length;

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

/** 获取光标位置信息 */
function getCursorPosition(text: string, selectionStart: number) {
  if (!text) return { line: 1, column: 1 };
  
  const beforeCursor = text.substring(0, selectionStart);
  const lines = beforeCursor.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  
  return { line, column };
}

/** 获取选中文本信息 */
function getSelectionInfo(text: string, selectionStart: number, selectionEnd: number) {
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

/** 编辑器状态栏组件 */
export const EditorStatusBar: React.FC<EditorStatusBarProps> = ({
  content,
  className = '',
  textareaRef,
  textareaNode,
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

    const handleSelectionChange = () => {
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

  return (
    <div className={`editor-status-bar ${className}`}>
      <div className="status-bar-left">
        <span className="status-item" title="字数">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>{formatNumber(stats.words)} 字</span>
        </span>
        <span className="status-divider">|</span>
        <span className="status-item" title="字符数（不含空格）">
          {formatNumber(stats.charactersNoSpaces)} 字符
        </span>
        <span className="status-divider">|</span>
        <span className="status-item" title="行数">
          {formatNumber(stats.lines)} 行
        </span>
        <span className="status-divider">|</span>
        <span className="status-item" title="段落数">
          {formatNumber(stats.paragraphs)} 段
        </span>
        {selectionInfo.selectedChars > 0 && (
          <>
            <span className="status-divider">|</span>
            <span className="status-item status-selection" title="选中文本">
              已选择 {formatNumber(selectionInfo.selectedChars)} 字符
            </span>
          </>
        )}
      </div>
      <div className="status-bar-right">
        <span className="status-item" title="光标位置">
          行 {cursorPosition.line}, 列 {cursorPosition.column}
        </span>
        <span className="status-divider">|</span>
        <span className="status-item" title="预计阅读时间">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>约 {stats.readingTime} 分钟阅读</span>
        </span>
      </div>
    </div>
  );
};

export default EditorStatusBar;
