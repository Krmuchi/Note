import { useState, useCallback, useEffect } from 'react';
import { compressImage } from '@/shared/utils';
import { saveImage } from '@/services/storage';
import { toast } from '@/components/common/Toast';
import {
  wrapSelection,
  insertBlockMark,
  insertAtLine,
  changeIndent,
  clearFormatting,
  setAlignment,
} from '@/utils/editorTextOps';
import type { NoteDoc } from '@/types';

export type FormatType =
  | 'bold' | 'italic' | 'strike' | 'underline' | 'code'
  | 'link' | 'image'
  | 'heading1' | 'heading2' | 'heading3' | 'paragraph'
  | 'ulist' | 'olist' | 'tasklist'
  | 'quote' | 'codeblock'
  | 'alignLeft' | 'alignCenter' | 'alignRight'
  | 'indent' | 'outdent'
  | 'textColor' | 'highlight'
  | 'fontSize'
  | 'table' | 'divider' | 'clearFormat';

interface UseEditorFormattingOptions {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  /** 当前挂载的 textarea DOM 节点（预览切换会卸载/重建节点，依赖它使监听器重新绑定） */
  textareaNode: HTMLTextAreaElement | null;
  activeDoc: NoteDoc | null;
  updateDocContent: (changes: Partial<NoteDoc>) => void;
}

export function useEditorFormatting({
  textareaRef,
  textareaNode,
  activeDoc,
  updateDocContent,
}: UseEditorFormattingOptions) {
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());

  /** 检测当前光标位置的格式 */
  const detectFormats = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const formats = new Set<string>();

    // 获取当前行文本
    const lineStart = text.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = text.indexOf('\n', start);
    const lineText = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);

    // 检测块级格式
    if (lineText.startsWith('# ')) formats.add('heading1');
    else if (lineText.startsWith('## ')) formats.add('heading2');
    else if (lineText.startsWith('### ')) formats.add('heading3');
    if (lineText.startsWith('- ')) formats.add('ulist');
    if (lineText.match(/^1\.\s/)) formats.add('olist');
    if (lineText.startsWith('- [ ] ') || lineText.startsWith('- [x] ')) formats.add('tasklist');
    if (lineText.startsWith('> ')) formats.add('quote');
    if (lineText.startsWith('```')) formats.add('codeblock');

    // 检测行内格式
    if (start !== end) {
      const selected = text.substring(start, end);

      // 粗体检测
      if (selected.startsWith('**') && selected.endsWith('**')) formats.add('bold');
      else if (text.substring(Math.max(0, start - 2), start) === '**' && text.substring(end, end + 2) === '**') formats.add('bold');

      // 斜体检测
      if (selected.startsWith('*') && selected.endsWith('*') && !selected.startsWith('**')) formats.add('italic');
      else if (text.substring(Math.max(0, start - 1), start) === '*' && text.substring(end, end + 1) === '*' && !text.substring(Math.max(0, start - 2), start).includes('*')) formats.add('italic');

      // 删除线检测
      if (selected.startsWith('~~') && selected.endsWith('~~')) formats.add('strike');
      else if (text.substring(Math.max(0, start - 2), start) === '~~' && text.substring(end, end + 2) === '~~') formats.add('strike');

      // 下划线检测
      if (selected.startsWith('<u>') && selected.endsWith('</u>')) formats.add('underline');
      else if (text.substring(Math.max(0, start - 3), start) === '<u>' && text.substring(end, end + 4) === '</u>') formats.add('underline');

      // 行内代码检测
      if (selected.startsWith('`') && selected.endsWith('`') && !selected.startsWith('``')) formats.add('code');
      else if (text.substring(Math.max(0, start - 1), start) === '`' && text.substring(end, end + 1) === '`' && !text.substring(Math.max(0, start - 2), start).includes('`')) formats.add('code');
    } else {
      // 光标位置检测（无选中文本）
      // 检查光标周围的字符来判断格式
      const beforeCursor = text.substring(Math.max(0, start - 2), start);
      const afterCursor = text.substring(end, end + 2);

      if (beforeCursor.endsWith('**') && afterCursor.startsWith('**')) formats.add('bold');
      else if (beforeCursor.endsWith('*') && afterCursor.startsWith('*') && !beforeCursor.endsWith('**')) formats.add('italic');
      if (beforeCursor.endsWith('~~') && afterCursor.startsWith('~~')) formats.add('strike');
      if (beforeCursor.endsWith('<u>') && afterCursor.startsWith('</u>')) formats.add('underline');
      if (beforeCursor.endsWith('`') && afterCursor.startsWith('`') && !beforeCursor.endsWith('``')) formats.add('code');
    }

    setActiveFormats(formats);
  }, [textareaRef]);

  // 监听 textarea 事件以检测格式。
  // 依赖 textareaNode（而非 ref）：切换预览/空态会卸载并重建 textarea 节点，
  // 仅依赖稳定的 ref 会导致监听器绑在旧节点上、工具栏激活态永久失效
  useEffect(() => {
    const ta = textareaNode;
    if (!ta) return;

    const handlers = () => { setTimeout(detectFormats, 0); };
    ta.addEventListener('keyup', handlers);
    ta.addEventListener('mouseup', handlers);
    ta.addEventListener('click', handlers);

    return () => {
      ta.removeEventListener('keyup', handlers);
      ta.removeEventListener('mouseup', handlers);
      ta.removeEventListener('click', handlers);
    };
  }, [textareaNode, detectFormats]);

  /** 插入图片到 textarea */
  const insertImage = useCallback((ta: HTMLTextAreaElement | null, src: string) => {
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selectedText = ta.value.substring(start, end);
    const imageMarkdown = `![${selectedText || 'image'}](${src})`;
    ta.value = ta.value.substring(0, start) + imageMarkdown + ta.value.substring(end);
    ta.selectionStart = ta.selectionEnd = start + imageMarkdown.length;
  }, []);

  /** 读取文件为 data URL，尝试保存到本地后插入编辑器（失败则内联 data URL 兜底并提示） */
  const readAndInsertImage = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const data = (reader.result as string) || '';
      let src = data;
      try {
        const saved = await saveImage({ name: file.name, data });
        if (saved) {
          src = saved;
        } else {
          // Electron 主进程保存失败时返回空串，回退为内联 base64 并告知用户影响
          toast.warning('图片保存到磁盘失败，已内联插入（会增大文档体积）');
        }
      } catch (err) {
        console.error('saveImage failed:', err);
        toast.warning('图片保存到磁盘失败，已内联插入（会增大文档体积）');
      }
      insertImage(textareaRef.current, src);
      updateDocContent({ content: textareaRef.current?.value || '' });
    };
    reader.readAsDataURL(file);
  }, [insertImage, textareaRef, updateDocContent]);

  /** 处理图片插入（先压缩，压缩失败则使用原图） */
  const handleInsertImage = useCallback(async (file: File) => {
    if (!file || !activeDoc) return;

    try {
      const compressedBlob = await compressImage(file, 1200);
      readAndInsertImage(new File([compressedBlob], file.name, { type: 'image/jpeg' }));
    } catch {
      readAndInsertImage(file);
    }
  }, [activeDoc, readAndInsertImage]);

  /** 处理粘贴事件（检测图片） */
  const handlePaste = useCallback((ev: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = ev.clipboardData && ev.clipboardData.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type && item.type.indexOf('image') === 0) {
        const file = item.getAsFile();
        if (file) {
          ev.preventDefault();
          handleInsertImage(file);
          return;
        }
      }
    }
  }, [handleInsertImage]);

  /** 对 textarea 选中文本应用格式化 */
  const applyFormat = useCallback(
    (type: FormatType, options?: { color?: string; size?: string }) => {
      const ta = textareaRef.current;
      if (!ta || !activeDoc) return;

      let newContent: string | null = null;

      switch (type) {
        case 'bold':
          newContent = wrapSelection(ta, '**', '**');
          break;
        case 'italic':
          newContent = wrapSelection(ta, '*', '*');
          break;
        case 'strike':
          newContent = wrapSelection(ta, '~~', '~~');
          break;
        case 'underline':
          newContent = wrapSelection(ta, '<u>', '</u>');
          break;
        case 'code':
          newContent = wrapSelection(ta, '`', '`');
          break;
        case 'link':
          newContent = wrapSelection(ta, '[', '](url)');
          break;
        case 'textColor':
          newContent = wrapSelection(ta, `<span style="color:${options?.color || '#1677ff'}">`, '</span>');
          break;
        case 'highlight':
          newContent = wrapSelection(ta, `<mark style="background-color:${options?.color || '#fff3a0'}">`, '</mark>');
          break;
        case 'fontSize':
          newContent = wrapSelection(ta, `<span style="font-size:${options?.size || '15px'}">`, '</span>');
          break;
        case 'heading1':
          newContent = insertBlockMark(ta, '# ');
          break;
        case 'heading2':
          newContent = insertBlockMark(ta, '## ');
          break;
        case 'heading3':
          newContent = insertBlockMark(ta, '### ');
          break;
        case 'paragraph':
          newContent = insertBlockMark(ta, '');
          break;
        case 'ulist':
          newContent = insertBlockMark(ta, '- ');
          break;
        case 'olist':
          newContent = insertBlockMark(ta, '1. ');
          break;
        case 'tasklist':
          newContent = insertBlockMark(ta, '- [ ] ');
          break;
        case 'quote':
          newContent = insertBlockMark(ta, '> ');
          break;
        case 'alignLeft':
          newContent = setAlignment(ta, 'left');
          break;
        case 'alignCenter':
          newContent = setAlignment(ta, 'center');
          break;
        case 'alignRight':
          newContent = setAlignment(ta, 'right');
          break;
        case 'indent':
          newContent = changeIndent(ta, true);
          break;
        case 'outdent':
          newContent = changeIndent(ta, false);
          break;
        case 'divider':
          newContent = insertAtLine(ta, '---');
          break;
        case 'table':
          newContent = insertAtLine(ta, '| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |');
          break;
        case 'clearFormat':
          newContent = clearFormatting(ta);
          break;
        case 'codeblock':
          {
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const selected = ta.value.substring(start, end);
            ta.value = ta.value.substring(0, start) + '```\n' + selected + '\n```' + ta.value.substring(end);
            ta.selectionStart = start + 4;
            ta.selectionEnd = start + 4 + selected.length;
            ta.focus();
            newContent = ta.value;
          }
          break;
        case 'image':
          {
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.onchange = (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) handleInsertImage(file);
            };
            fileInput.click();
          }
          return;
      }

      if (newContent !== null) {
        updateDocContent({ content: newContent });
      }
    },
    [activeDoc, updateDocContent, textareaRef, handleInsertImage]
  );

  return {
    activeFormats,
    applyFormat,
    handlePaste,
    handleInsertImage,
  };
}

export default useEditorFormatting;
