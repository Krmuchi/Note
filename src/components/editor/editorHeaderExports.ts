import { useNotesStore } from '@/store';
import { exportHtmlDoc, exportPdfDoc, exportDoc, exportNotebookZip } from '@/services/storage';
import { toast } from '@/components/common/Toast';

/**
 * EditorHeader 的文档导出逻辑（从 EditorHeader.tsx 纯拆分）。
 * 导出时从 store 读取最新内容，保持函数零依赖、引用稳定。
 */

export async function exportCurrentDocAsHtml(): Promise<void> {
  try {
    const doc = useNotesStore.getState().activeDoc;
    if (!doc) return;
    const ok = await exportHtmlDoc({
      title: doc.title,
      content: doc.content || '',
    });
    if (ok) toast.success('HTML 导出成功');
  } catch (err) {
    console.error('Export HTML failed:', err);
    toast.error(`导出 HTML 失败：${err instanceof Error ? err.message : '未知错误'}`);
  }
}

/** 导出当前文档为 Markdown（IPC 层已具备，此前 UI 未接入） */
export async function exportCurrentDocAsMarkdown(): Promise<void> {
  try {
    const doc = useNotesStore.getState().activeDoc;
    if (!doc) return;
    const ok = await exportDoc({
      title: doc.title,
      content: doc.content || '',
    });
    if (ok) toast.success('Markdown 导出成功');
  } catch (err) {
    console.error('Export Markdown failed:', err);
    toast.error(`导出 Markdown 失败：${err instanceof Error ? err.message : '未知错误'}`);
  }
}

/** 导出当前知识库为 ZIP（每篇文档一个 .md） */
export async function exportCurrentNotebookAsZip(): Promise<void> {
  try {
    const state = useNotesStore.getState();
    const notebook = state.notebooks.find((nb) => nb.id === state.activeNotebookId);
    const docs = notebook?.docs ?? (state.activeDoc ? [state.activeDoc] : []);
    if (docs.length === 0) {
      toast.warning('当前知识库没有可导出的文档');
      return;
    }
    const ok = await exportNotebookZip({
      title: notebook?.title || '知识库',
      docs,
    });
    if (ok) toast.success('知识库 ZIP 导出成功');
  } catch (err) {
    console.error('Export notebook zip failed:', err);
    toast.error(`导出知识库 ZIP 失败：${err instanceof Error ? err.message : '未知错误'}`);
  }
}

export async function exportCurrentDocAsPdf(): Promise<void> {
  try {
    const doc = useNotesStore.getState().activeDoc;
    if (!doc) return;
    const ok = await exportPdfDoc({
      title: doc.title,
      content: doc.content || '',
    });
    if (ok) toast.success('PDF 导出成功');
  } catch (err) {
    console.error('Export PDF failed:', err);
    toast.error(`导出 PDF 失败：${err instanceof Error ? err.message : '未知错误'}`);
  }
}
