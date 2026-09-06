import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
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
  /**
   * 任务列表勾选回写：lineIndex 为源内容中的 0 基行号。
   * 未传时任务 checkbox 保持只读。
   */
  onToggleTask?: (lineIndex: number, checked: boolean) => void;
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

/**
 * 把 rehype-raw 产出的 style 字符串（如 "color:#ff0000;text-align:center"）
 * 解析为 React 需要的样式对象。React 会忽略字符串形式的 style，
 * 导致编辑器插入的文字颜色/高亮/对齐在预览中全部失效。
 */
function parseStyleAttribute(styleStr?: string): React.CSSProperties | undefined {
  if (!styleStr || typeof styleStr !== 'string') return undefined;
  const out: Record<string, string> = {};
  for (const decl of styleStr.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!prop || !value) continue;
    const camel = prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = value;
  }
  return out as React.CSSProperties;
}

/**
 * 编辑器插入的行内样式标签共用处理。
 *
 * react-markdown 依赖 style-to-js@1.0.0 把 hast 的 style 字符串转成对象，
 * 但该包的 CJS 导出形态（{__esModule, default}）在 Vite/Vitest 互操作下会
 * 解析失败并产出空对象，导致颜色/高亮/对齐在预览中丢失。
 * 因此当 style 为空对象时，回退到 hast node 上保留的原始 style 字符串自行解析。
 */
function withParsedStyle(props: { style?: unknown; node?: unknown }): React.CSSProperties | undefined {
  const s = props.style;
  if (typeof s === 'string') return parseStyleAttribute(s);
  if (s && typeof s === 'object' && Object.keys(s).length > 0) return s as React.CSSProperties;
  const raw = (props.node as { properties?: { style?: unknown } } | undefined)?.properties?.style;
  if (typeof raw === 'string') return parseStyleAttribute(raw);
  return undefined;
}

/** react-markdown 会传入 hast node，不能透传到 DOM */
function stripNode({ node: _node, ...rest }: Record<string, unknown>) {
  return rest;
}

/** Markdown 实时预览组件 */
export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  className = '',
  syncScroll = true,
  onScrollChange,
  onRegisterEditorScrollSync,
  onToggleTask,
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

  // 任务列表行的 0 基行号（按文档顺序）。GFM 任务 checkbox 由 mdast-util-to-hast
  // 生成、无 position 信息，无法从 hast 节点定位源行。改为渲染后按 DOM 顺序
  // 在 effect 中给每个 checkbox 标 data-task-line（见下方 effect）
  const taskLines = useMemo(() => {
    const idx: number[] = [];
    (debouncedContent || '').split('\n').forEach((line, i) => {
      if (/^\s*[-*+]\s+\[[ xX]\]/.test(line)) idx.push(i);
    });
    return idx;
  }, [debouncedContent]);

  // 任务 checkbox 勾选回写：渲染后按 DOM 顺序标注源行号，并委托 change 事件。
  // 不在组件渲染期定位（react-hooks/refs 禁止渲染期读写 ref），也天然覆盖
  // 行内 HTML 的 checkbox——越界/错位由 Editor 端的行内容校验兜底拒绝
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const boxes = el.querySelectorAll('input[type="checkbox"]');
    boxes.forEach((box, idx) => {
      const line = taskLines[idx];
      if (line !== undefined) box.setAttribute('data-task-line', String(line));
    });
    if (!onToggleTask) return;
    const handler = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.type !== 'checkbox') return;
      const line = target.getAttribute('data-task-line');
      if (line !== null) onToggleTask(Number(line), target.checked);
    };
    el.addEventListener('change', handler);
    return () => el.removeEventListener('change', handler);
  }, [taskLines, onToggleTask, debouncedContent]);

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

  // rehype-raw：让预览原生支持编辑器插入的 HTML（<u>/<mark>/<span style>/<div align>），
  // 且 HTML 与 Markdown 语法（粗体/链接等）混排时能正确嵌套解析。
  // 旧方案用 ‡ 占位符二次替换，遇到占位符被 Markdown 语法拆开时标记字符会原样泄露。
  const processedContent = debouncedContent;

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
    a({ href, children }) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    span(props) {
      const { style: _style, children, ...rest } = props;
      return (
        <span style={withParsedStyle(props)} {...stripNode(rest)}>
          {children}
        </span>
      );
    },
    div(props) {
      const { style: _style, children, ...rest } = props;
      return (
        <div style={withParsedStyle(props)} {...stripNode(rest)}>
          {children}
        </div>
      );
    },
    mark(props) {
      const { style: _style, children, ...rest } = props;
      return (
        // 无内联样式时回退到主题化高亮底色（md-mark-highlight）
        <mark className="md-mark-highlight" style={withParsedStyle(props)} {...stripNode(rest)}>
          {children}
        </mark>
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
    input(props) {
      const { node: _node, ...rest } = props;
      // 勾选回写由容器上的 change 事件委托处理（见上方 effect），
      // readOnly 仅用于消除 React 对 checked 无 onChange 的警告，不会阻止点击
      return (
        <input
          type={rest.type}
          checked={rest.checked}
          readOnly
          style={{ marginRight: '0.5em' }}
          {...stripNode(rest)}
        />
      );
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
        rehypePlugins={[rehypeRaw, rehypeKatex]}
        components={components}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};