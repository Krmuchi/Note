import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Mermaid } from '@/components/common/Mermaid';
import 'katex/dist/katex.min.css';

interface MarkdownPreviewProps {
  content: string;
  className?: string;
  syncScroll?: boolean;
  /**
   * 预览滚动回调：上抛滚动百分比，由父组件（Editor）同步编辑区滚动位置。
   * 编辑器→预览方向经 onRegisterEditorScrollSync 的 ref 直通，不触发渲染。
   */
  onScrollChange?: (percentage: number) => void;
  /**
   * 注册编辑器→预览的同步函数。滚动百分比经 ref 直通（不再以 props 传 state），
   * 避免每个滚动帧重渲染整个编辑面板
   */
  onRegisterEditorScrollSync?: (fn: ((pct: number) => void) | null) => void;
}

/** 高亮语言关键词表（省略部分同 tsx/jsx 以减小体积） */
const KEYWORDS: Record<string, string[]> = {
  typescript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'interface', 'type', 'import', 'from', 'export', 'default', 'async', 'await', 'new', 'this', 'super', 'extends', 'implements', 'public', 'private', 'protected', 'readonly', 'static', 'void', 'null', 'undefined', 'true', 'false', 'string', 'number', 'boolean', 'any', 'unknown', 'never'],
  javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'from', 'export', 'default', 'async', 'await', 'new', 'this', 'super', 'extends', 'null', 'undefined', 'true', 'false'],
  python: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'with', 'try', 'except', 'finally', 'raise', 'pass', 'break', 'continue', 'lambda', 'None', 'True', 'False', 'and', 'or', 'not', 'in', 'is', 'self'],
  java: ['public', 'private', 'protected', 'class', 'interface', 'extends', 'implements', 'static', 'final', 'void', 'int', 'String', 'boolean', 'double', 'float', 'long', 'char', 'byte', 'short', 'new', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'finally', 'throw', 'throws', 'import', 'package', 'this', 'super', 'null', 'true', 'false'],
  go: ['package', 'import', 'func', 'var', 'const', 'type', 'struct', 'interface', 'map', 'chan', 'go', 'defer', 'return', 'if', 'else', 'for', 'range', 'switch', 'case', 'select', 'break', 'continue', 'nil', 'true', 'false'],
  rust: ['fn', 'let', 'mut', 'const', 'static', 'struct', 'enum', 'trait', 'impl', 'pub', 'use', 'mod', 'crate', 'self', 'super', 'where', 'for', 'loop', 'while', 'if', 'else', 'match', 'return', 'break', 'continue', 'move', 'ref', 'as', 'in', 'true', 'false'],
  cpp: ['int', 'char', 'float', 'double', 'void', 'bool', 'short', 'long', 'unsigned', 'signed', 'const', 'static', 'virtual', 'inline', 'class', 'struct', 'union', 'enum', 'public', 'private', 'protected', 'namespace', 'using', 'template', 'typename', 'new', 'delete', 'this', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'try', 'catch', 'throw', 'true', 'false', 'nullptr'],
  c: ['int', 'char', 'float', 'double', 'void', 'bool', 'short', 'long', 'unsigned', 'signed', 'const', 'static', 'struct', 'union', 'enum', 'typedef', 'volatile', 'extern', 'auto', 'register', 'return', 'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'goto', 'sizeof', 'NULL', 'true', 'false'],
  css: ['color', 'background', 'width', 'height', 'margin', 'padding', 'border', 'display', 'position', 'flex', 'grid', 'font', 'overflow', 'opacity', 'transform', 'transition', 'animation'],
  bash: ['echo', 'cd', 'ls', 'mkdir', 'rm', 'cp', 'mv', 'cat', 'grep', 'find', 'sed', 'awk', 'if', 'then', 'else', 'fi', 'for', 'do', 'done', 'while', 'case', 'esac', 'function', 'return', 'export', 'source', 'exit'],
  sql: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER', 'INDEX', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL', 'AND', 'OR', 'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'AS', 'DISTINCT'],
};

const LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  yml: 'yaml',
  rs: 'rust',
  golang: 'go',
  'c++': 'cpp',
};

/** 用 # 作为行注释的语言 */
const HASH_COMMENT_LANGS = new Set(['python', 'bash', 'yaml', 'ruby', 'r', 'perl', 'toml']);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NUM_RE = /\b(\d+(?:\.\d+)?)\b/g;

/** 对纯文本段做关键词 + 数字高亮（此时文本不含任何 HTML，二次替换安全） */
function highlightWords(text: string, kwRe: RegExp | null): string {
  if (!kwRe) return text.replace(NUM_RE, '<span class="tok-num">$1</span>');
  let out = '';
  let last = 0;
  for (const m of text.matchAll(kwRe)) {
    const plain = text.slice(last, m.index);
    out += plain.replace(NUM_RE, '<span class="tok-num">$1</span>');
    out += `<span class="tok-kw">${m[0]}</span>`;
    last = m.index + m[0].length;
  }
  out += text.slice(last).replace(NUM_RE, '<span class="tok-num">$1</span>');
  return out;
}

/**
 * 单趟 tokenizer 代码高亮：注释/字符串整体优先捕获，关键词/数字只作用于纯文本段。
 * 旧实现是在已插入 span 的字符串上反复 replace，字符串/注释正则会匹配到已插入的
 * 样式属性（如 "color:#c678dd"），产出损坏的嵌套 HTML。
 */
function simpleHighlight(code: string, language: string): string {
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lang = LANG_MAP[language] || language;
  const kwList = KEYWORDS[lang] || [];
  const kwRe = kwList.length > 0
    ? new RegExp(`\\b(${kwList.map(escapeRegExp).join('|')})\\b`, 'g')
    : null;

  const lineComments = lang === 'sql' ? ['--'] : ['//'];
  if (HASH_COMMENT_LANGS.has(lang)) lineComments.push('#');
  const commentSrc = lineComments.map(escapeRegExp).join('|');

  // 优先级：块注释 / 行注释 > 字符串 > 其余文本（再做关键词+数字）
  const tokenRe = new RegExp(
    `(\\/\\*[\\s\\S]*?\\*\\/|${commentSrc}(?!")[^\\n]*)|("(?:[^"\\\\\\n]|\\\\.)*"|'(?:[^'\\\\\\n]|\\\\.)*'|\`(?:[^\`\\\\]|\\\\.)*\`)`,
    'g'
  );

  const parts: string[] = [];
  let last = 0;
  for (const m of escaped.matchAll(tokenRe)) {
    parts.push(highlightWords(escaped.slice(last, m.index), kwRe));
    if (m[1] !== undefined) {
      parts.push(`<span class="tok-comment">${m[0]}</span>`);
    } else {
      parts.push(`<span class="tok-str">${m[0]}</span>`);
    }
    last = m.index + m[0].length;
  }
  parts.push(highlightWords(escaped.slice(last), kwRe));
  return parts.join('');
}

/** 自定义代码块渲染器：配色统一由 markdown-preview.css 的 .md-codeblock 提供（随主题切换） */
const CodeBlock = React.memo(({ language, children }: { language: string; children: string }) => {
  if (language === 'mermaid') {
    return <Mermaid code={children} />;
  }

  const html = simpleHighlight(children, language);

  return (
    <div className="md-codeblock">
      <pre
        className={`language-${language || 'text'}`}
      >
        <code
          className={`language-${language || 'text'}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </pre>
    </div>
  );
});

CodeBlock.displayName = 'CodeBlock';

// 自定义标记的正则表达式
const CUSTOM_MARK_REGEX = /‡U‡(.*?)‡\/U‡|‡MARK‡(.*?)‡\/MARK‡|‡COLOR_(#[a-fA-F0-9]+)‡(.*?)‡\/COLOR‡/g;

/** 处理字符串中的自定义标记，返回React节点数组 */
function processCustomMarks(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  CUSTOM_MARK_REGEX.lastIndex = 0;

  while ((match = CUSTOM_MARK_REGEX.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      parts.push(<u key={`u-${match.index}`} style={{ textDecoration: 'underline' }}>{match[1]}</u>);
    } else if (match[2] !== undefined) {
      // 高亮底色/文字色随主题（CSS 类），避免暗色主题下白字配浅黄底不可读
      parts.push(<mark key={`mark-${match.index}`} className="md-mark-highlight">{match[2]}</mark>);
    } else if (match[3] !== undefined && match[4] !== undefined) {
      parts.push(<span key={`color-${match.index}`} style={{ color: match[3] }}>{match[4]}</span>);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/** 递归处理React节点树，处理自定义标记 */
function processReactNode(node: React.ReactNode): React.ReactNode {
  if (typeof node === 'string') {
    const result = processCustomMarks(node);
    return result.length === 1 && typeof result[0] === 'string' ? result[0] : <>{result}</>;
  }

  if (Array.isArray(node)) {
    return node.map((item, index) => {
      const processed = processReactNode(item);
      return React.isValidElement(processed) && !processed.key ?
        React.cloneElement(processed as React.ReactElement, { key: index }) :
        processed;
    });
  }

  if (React.isValidElement(node)) {
    const props = node.props as any;
    if (props.children) {
      const children = React.Children.map(props.children, (child) => processReactNode(child));
      return React.cloneElement(node, {}, children);
    }
  }

  return node;
}

/** 预处理内容：将HTML标签转换为自定义标记 */
function preprocessContent(content: string): string {
  let processed = content.replace(/<u>(.*?)<\/u>/g, '‡U‡$1‡/U‡');
  processed = processed.replace(/<mark[^>]*>(.*?)<\/mark>/g, '‡MARK‡$1‡/MARK‡');
  processed = processed.replace(/<span style="color:([^"]+)">(.*?)<\/span>/g, '‡COLOR_$1‡$2‡/COLOR‡');
  return processed;
}

/** Markdown 实时预览组件 */
export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  className = '',
  syncScroll = true,
  onScrollChange,
  onRegisterEditorScrollSync,
}) => {
  const previewRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  // 防抖渲染：split 模式下每次击键都会触发全量 markdown 重解析（含 KaTeX/mermaid），
  // 大文档明显卡顿。延迟 200ms 合并连续击键，只在停顿后解析一次。
  const [debouncedContent, setDebouncedContent] = useState(content);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedContent(content), 200);
    return () => clearTimeout(timer);
  }, [content]);

  // 注册"编辑器 → 预览"同步函数：编辑区滚动时按百分比设置预览滚动位置
  useEffect(() => {
    if (!onRegisterEditorScrollSync) return;
    onRegisterEditorScrollSync((pct) => {
      if (!syncScroll || !previewRef.current || isScrollingRef.current) return;
      const el = previewRef.current;
      const maxScroll = el.scrollHeight - el.clientHeight;
      el.scrollTop = pct * maxScroll;
    });
    return () => onRegisterEditorScrollSync(null);
  }, [syncScroll, onRegisterEditorScrollSync]);

  // 预览滚动：上抛百分比，由父组件同步编辑区（自身用 isScrollingRef 防回环）
  const handleScroll = useCallback(() => {
    if (!syncScroll) return;
    const el = previewRef.current;
    if (!el) return;

    isScrollingRef.current = true;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const percentage = maxScroll > 0 ? el.scrollTop / maxScroll : 0;
    onScrollChange?.(percentage);

    setTimeout(() => {
      isScrollingRef.current = false;
    }, 50);
  }, [syncScroll, onScrollChange]);

  const processedContent = useMemo(() => preprocessContent(debouncedContent), [debouncedContent]);

  const components = useMemo<Components>(() => ({
    code({ className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || '');
      const language = match ? match[1] : '';

      // react-markdown v10 不再提供 inline 标记，改以是否带语言标识判定代码块
      if (language) {
        return (
          <CodeBlock language={language}>
            {String(children).replace(/\n$/, '')}
          </CodeBlock>
        );
      }

      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    p({ children }) {
      const processed = processReactNode(children);
      return <p>{processed}</p>;
    },
    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    img({ src, alt }) {
      return (
        <img
          src={src}
          alt={alt}
          style={{ maxWidth: '100%', height: 'auto' }}
          loading="lazy"
        />
      );
    },
    table({ children }) {
      return (
        <div style={{ overflowX: 'auto', margin: '1em 0' }}>
          <table>{children}</table>
        </div>
      );
    },
    input({ type, checked, ...props }) {
      if (type === 'checkbox') {
        return (
          <input
            type="checkbox"
            checked={checked}
            readOnly
            style={{ marginRight: '0.5em' }}
            {...props}
          />
        );
      }
      return <input type={type} {...props} />;
    },
  }), []);

  // 空态判断与正文渲染使用同一数据源（防抖后的内容），避免清空/输入时闪跳
  if (!debouncedContent || debouncedContent.trim() === '') {
    return (
      <div className={`markdown-preview markdown-preview-empty ${className}`}>
        <div className="preview-empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 48, height: 48, opacity: 0.3 }}>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <p>开始输入内容以查看预览</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={previewRef}
      className={`markdown-preview ${className}`}
      onScroll={handleScroll}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};