// src/utils/editorUtils.ts

/**
 * 在编辑器中插入带包装的内容（例如加粗、斜体等）
 */
export const insertWrappedText = (
  textarea: HTMLTextAreaElement,
  prefix: string,
  suffix?: string
): void => {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);
  const sfx = suffix ?? prefix;
  
  const newText = textarea.value.substring(0, start) + 
                  prefix + selectedText + sfx + 
                  textarea.value.substring(end);
  
  textarea.value = newText;
  
  // 移动光标到合适位置
  const newCursorPosition = start + prefix.length + selectedText.length;
  textarea.setSelectionRange(newCursorPosition, newCursorPosition);
};

/**
 * 在当前行插入前缀（例如列表项、引用等）
 */
export const insertLinePrefix = (
  textarea: HTMLTextAreaElement,
  prefix: string
): void => {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const lines = textarea.value.split('\n');
  
  // 找到当前行
  let charCount = 0;
  let currentLineIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    if (charCount + lines[i].length >= start) {
      currentLineIndex = i;
      break;
    }
    charCount += lines[i].length + 1; // +1 for newline character
  }
  
  // 找到选中范围内的所有行
  const startLineIndex = currentLineIndex;
  let endLineIndex = currentLineIndex;
  
  let tempCharCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (tempCharCount + lines[i].length >= end) {
      endLineIndex = i;
      break;
    }
    tempCharCount += lines[i].length + 1;
  }
  
  // 为选中的每一行添加前缀
  for (let i = startLineIndex; i <= endLineIndex; i++) {
    if (lines[i].trim() !== '') {
      lines[i] = prefix + lines[i];
    }
  }
  
  const newValue = lines.join('\n');
  textarea.value = newValue;
  
  // 保持选区
  textarea.setSelectionRange(start, end + (endLineIndex - startLineIndex + 1) * prefix.length);
};

/**
 * 插入标题
 */
export const insertHeading = (
  textarea: HTMLTextAreaElement,
  level: number
): void => {
  const headingPrefix = `${'#'.repeat(level)} `;
  insertLinePrefix(textarea, headingPrefix);
};

/**
 * 插入分隔线
 */
export const insertSeparator = (textarea: HTMLTextAreaElement): void => {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  
  const beforeText = textarea.value.substring(0, start);
  const afterText = textarea.value.substring(end);
  
  const newContent = beforeText + '\n---\n' + afterText;
  textarea.value = newContent;
  
  // 将光标移动到分隔线之后
  const newCursorPosition = start + 6; // Length of '\n---\n'
  textarea.setSelectionRange(newCursorPosition, newCursorPosition);
};

/**
 * 插入链接
 * @returns { url: string; text: string } | null - 返回用户输入的链接信息，null表示取消
 */
export const insertLink = (textarea: HTMLTextAreaElement): { url: string; text: string } | null => {
  const url = prompt("请输入链接 URL：", "https://");
  if (!url) return null;

  const text = prompt("请输入显示文本：", "链接文本") || url;

  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selectedText = textarea.value.substring(start, end);

  const linkText = `[${selectedText || text}](${url})`;

  const newContent =
    textarea.value.substring(0, start) +
    linkText +
    textarea.value.substring(end);

  textarea.value = newContent;

  const newCursorPosition = start + linkText.length;
  textarea.setSelectionRange(newCursorPosition, newCursorPosition);

  return { url, text: selectedText || text };
};

/**
 * 插入图片
 */
export const insertImage = (textarea: HTMLTextAreaElement, src: string, alt: string = "图片"): void => {
  const start = textarea.selectionStart;
  const newContent = 
    textarea.value.substring(0, start) + 
    `\n![${alt}](${src})\n` + 
    textarea.value.substring(start);
  
  textarea.value = newContent;
  
  const newCursorPosition = start + 4 + alt.length + src.length; // Length of '![]( )' + alt + src
  textarea.setSelectionRange(newCursorPosition, newCursorPosition);
};

/**
 * 插入表格
 */
export const insertTable = (textarea: HTMLTextAreaElement): void => {
  const table = 
    "\n| 列1 | 列2 | 列3 |\n" +
    "| --- | --- | --- |\n" +
    "|     |     |     |\n";
  
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  
  const newContent = 
    textarea.value.substring(0, start) + 
    table + 
    textarea.value.substring(end);
  
  textarea.value = newContent;
  
  const newCursorPosition = start + table.length;
  textarea.setSelectionRange(newCursorPosition, newCursorPosition);
};

/**
 * 插入代码块
 */
export const insertCodeBlock = (textarea: HTMLTextAreaElement, language: string = ""): void => {
  const codeBlock = `\n\`\`\`${language}\n\n\`\`\`\n`;
  
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  
  const newContent = 
    textarea.value.substring(0, start) + 
    codeBlock + 
    textarea.value.substring(end);
  
  textarea.value = newContent;
  
  // 将光标放在代码块中间
  const newCursorPosition = start + 4 + language.length; // After '```' + language
  textarea.setSelectionRange(newCursorPosition, newCursorPosition);
};

/**
 * 获取当前光标所在的 Markdown 元素类型
 */
export const getCurrentElementType = (textarea: HTMLTextAreaElement): string => {
  const cursorPos = textarea.selectionStart;
  const text = textarea.value;
  
  // 获取光标之前的文本
  const beforeCursor = text.substring(0, cursorPos);
  const lines = beforeCursor.split('\n');
  const currentLine = lines[lines.length - 1];
  
  // 检查当前行是否是某种 Markdown 元素
  if (currentLine.startsWith('# ')) return 'heading1';
  if (currentLine.startsWith('## ')) return 'heading2';
  if (currentLine.startsWith('### ')) return 'heading3';
  if (currentLine.startsWith('- ') || currentLine.startsWith('* ')) return 'listItem';
  if (currentLine.startsWith('> ')) return 'blockquote';
  if (currentLine.startsWith('    ') || currentLine.startsWith('\t')) return 'codeBlock';
  if (currentLine.startsWith('---') || currentLine.startsWith('***')) return 'divider';
  
  return 'paragraph';
};

/**
 * 切换列表类型（有序/无序）
 */
export const toggleListType = (textarea: HTMLTextAreaElement, ordered: boolean = false): void => {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  
  const lines = textarea.value.split('\n');
  
  // 找到选中范围内的行
  let startLine = 0;
  let charCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (charCount >= start) {
      startLine = i;
      break;
    }
    if (charCount + lines[i].length >= start) {
      startLine = i;
      break;
    }
    charCount += lines[i].length + 1;
  }
  
  let endLine = startLine;
  for (let i = startLine; i < lines.length; i++) {
    if (charCount >= end) {
      endLine = i - 1;
      break;
    }
    if (charCount + lines[i].length >= end) {
      endLine = i;
      break;
    }
    charCount += lines[i].length + 1;
  }
  
  // 切换列表类型
  for (let i = startLine; i <= endLine; i++) {
    if (ordered) {
      // 转换为有序列表
      if (lines[i].match(/^\s*[-*+]\s/)) {
        lines[i] = lines[i].replace(/^\s*[-*+]\s/, '1. ');
      } else if (!lines[i].match(/^\s*\d+\.\s/)) {
        lines[i] = `1. ${lines[i].trim()}`;
      }
    } else {
      // 转换为无序列表
      if (lines[i].match(/^\s*\d+\.\s/)) {
        lines[i] = lines[i].replace(/^\s*\d+\.\s/, '- ');
      } else if (!lines[i].match(/^\s*[-*+]\s/)) {
        lines[i] = `- ${lines[i].trim()}`;
      }
    }
  }
  
  textarea.value = lines.join('\n');
  textarea.setSelectionRange(start, end);
};