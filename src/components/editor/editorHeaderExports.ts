import { useNotesStore } from '@/store';
import { exportHtmlDoc, exportPdfDoc } from '@/services/storage';
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
