import { useState, useCallback, useEffect } from 'react';
import { compressImage } from '@/shared/utils';
import { saveImage, saveFile } from '@/services/storage';
import { toast } from '@/components/common/Toast';
import {
  wrapSelection,
  insertBlockMark,
  insertAtLine,
  changeIndent,
  clearFormatting,
  setAlignment,
  insertTextAtCursor,
  buildTableMarkdown,
  buildCodeFence,
} from '@/utils/editorTextOps';
import { htmlToMarkdown, HTML_TO_MD_MAX_LENGTH } from '@/utils/htmlToMarkdown';
import type { NoteDoc } from '@/types';

export type FormatType =
  | 'bold' | 'italic' | 'strike' | 'underline' | 'code'
  | 'link' | 'image'
  | 'heading1' | 'heading2' | 'heading3' | 'heading4' | 'heading5' | 'heading6'
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
  /** 插入链接时改走弹窗流程（由 Editor 捕获选区并弹出 LinkDialog），未传则退回插入字面量 `](url)` */
  onLinkInsert?: () => void;
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function useEditorFormatting({
  textareaRef,
  textareaNode,
  activeDoc,
  updateDocContent,
  onLinkInsert,
}: UseEditorFormattingOptions) {
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());

  /**
   * 粘贴 HTML 中的外链图片转存本地：最多处理 5 张、单张不超过 8MB，
   * 失败（CORS/404/网络）时保留原始外链，不影响已插入的内容。
   */
  const localizeRemoteImages = useCallback(async (markdown: string): Promise<{ from: string; to: string }[]> => {
    const MAX_REMOTE_IMAGES = 5;
    const MAX_REMOTE_IMAGE_BYTES = 8 * 1024 * 1024;
    const urls = Array.from(
      new Set(Array.from(markdown.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g), (m) => m[1])),
    ).slice(0, MAX_REMOTE_IMAGES);
    if (urls.length === 0) return [];

    const replacements: { from: string; to: string }[] = [];
    for (const url of urls) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const blob = await resp.blob();
        if (!blob.type.startsWith('image/') || blob.size > MAX_REMOTE_IMAGE_BYTES) continue;

        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve((reader.result as string) || '');
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        if (!data) continue;

        const ext = (blob.type.split('/')[1] || 'png').split('+')[0];
        const saved = await saveImage({ name: `remote-${Date.now()}.${ext}`, data });
        // Web 模式 saveImage 原样返回 data URL，此时无需替换（避免内联体积翻倍）
        if (saved && saved !== data) replacements.push({ from: url, to: saved });
      } catch (err) {
        console.error('localize remote image failed:', err);
      }
    }
    return replacements;
  }, []);

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

    const handlers = (): void => { setTimeout(detectFormats, 0); };
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

  /** 通用附件（非图片）落盘并插入链接语法 */
  const handleInsertFile = useCallback((file: File) => {
    if (!file || !activeDoc) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const data = (reader.result as string) || '';
      let src = data;
      try {
        const saved = await saveFile({ name: file.name, data });
        if (!saved) {
          toast.warning('附件保存到磁盘失败，已内联插入（会显著增大文档体积）');
        } else {
          src = saved;
        }
      } catch (err) {
        console.error('saveFile failed:', err);
        toast.warning('附件保存到磁盘失败，已内联插入（会显著增大文档体积）');
      }
      const ta = textareaRef.current;
      if (!ta) return;
      const next = insertTextAtCursor(ta, `[${file.name}](${src})`);
      if (next !== null) updateDocContent({ content: next });
    };
    reader.readAsDataURL(file);
  }, [activeDoc, textareaRef, updateDocContent]);

  /**
   * 处理粘贴事件，按优先级分支：
   * 1) 剪贴板图片 → 压缩落盘后插入
   * 2) text/html → 转为 Markdown 插入（超大片段降级为纯文本，避免阻塞输入）
   * 3) 其余情况保留 textarea 原生纯文本粘贴
   */
  const handlePaste = useCallback((ev: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboard = ev.clipboardData;
    if (!clipboard) return;

    const items = clipboard.items;
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

    const ta = textareaRef.current;
    const html = clipboard.getData('text/html');
    if (!html || !ta || !activeDoc) return;

    // 超长片段：转换代价过高，降级为纯文本并提示
    if (html.length > HTML_TO_MD_MAX_LENGTH) {
      const plain = clipboard.getData('text/plain');
      if (plain) {
        ev.preventDefault();
        const next = insertTextAtCursor(ta, plain);
        if (next !== null) updateDocContent({ content: next });
        toast.warning('内容过大，已按纯文本粘贴');
      }
      return;
    }

    const markdown = htmlToMarkdown(html);
    if (!markdown) return;
    ev.preventDefault();
    const next = insertTextAtCursor(ta, markdown);
    if (next !== null) updateDocContent({ content: next });

    // 先插入保证粘贴不卡顿，再异步把外链图片转存本地并原位替换
    void localizeRemoteImages(markdown).then((replacements) => {
      if (replacements.length === 0) return;
      const taNow = textareaRef.current;
      if (!taNow) return;
      let value = taNow.value;
      replacements.forEach(({ from, to }) => {
        value = value.split(from).join(to);
      });
      if (value !== taNow.value) {
        taNow.value = value;
        updateDocContent({ content: value });
      }
    });
  }, [handleInsertImage, localizeRemoteImages, activeDoc, updateDocContent, textareaRef]);

  /** 处理粘贴/拖入的任意文件：图片走图片流程，其余走附件流程 */
  const handleInsertAnyFile = useCallback((file: File) => {
    if (file.type.startsWith('image/')) {
      handleInsertImage(file);
      return;
    }
    handleInsertFile(file);
  }, [handleInsertImage, handleInsertFile]);

  /** 对 textarea 选中文本应用格式化 */
  const applyFormat = useCallback(
    (type: FormatType, options?: { color?: string; size?: string; rows?: number; cols?: number; language?: string }) => {
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
          if (onLinkInsert) {
            onLinkInsert();
          } else {
            newContent = wrapSelection(ta, '[', '](url)');
          }
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
        case 'heading4':
          newContent = insertBlockMark(ta, '#### ');
          break;
        case 'heading5':
          newContent = insertBlockMark(ta, '##### ');
          break;
        case 'heading6':
          newContent = insertBlockMark(ta, '###### ');
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
          newContent = insertAtLine(ta, buildTableMarkdown(options?.rows ?? 3, options?.cols ?? 3));
          break;
        case 'clearFormat':
          newContent = clearFormatting(ta);
          break;
        case 'codeblock':
          {
            const start = ta.selectionStart;
            const end = ta.selectionEnd;
            const selected = ta.value.substring(start, end);
            const fence = buildCodeFence(options?.language);
            const content = selected ? `\n${selected}\n` : '\n\n';
            ta.value = ta.value.substring(0, start) + fence + content + '```' + ta.value.substring(end);
            // 光标落在围栏内首行，语言为空时正好是空行
            ta.selectionStart = ta.selectionEnd = start + fence.length + 1;
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
    [activeDoc, updateDocContent, textareaRef, handleInsertImage, onLinkInsert]
  );

  return {
    activeFormats,
    applyFormat,
    handlePaste,
    handleInsertImage,
    handleInsertFile,
    handleInsertAnyFile,
  };
}

export default useEditorFormatting;
