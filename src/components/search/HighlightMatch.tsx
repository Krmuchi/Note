/**
 * 搜索高亮文本：把命中的关键词在文本中包成 <mark>。
 * 组件定义在模块层（不能挪进任何组件函数体）：一旦定义在渲染它的组件内部，
 * 每次渲染都会重建组件类型，导致整棵高亮子树卸载重挂载（历史上就是这样出问题的）。
 * 分词逻辑与 searchSlice 的 tokenizeChinese 保持一致，保证中文搜索结果的高亮与命中匹配。
 */
import { memo, useMemo } from 'react';
import { tokenizeChinese } from '@/store/slices/searchSlice';
import { escapeRegExp } from '@/utils/sanitize';

export const HighlightMatch = memo(function HighlightMatch({ text, query }: { text: string; query: string }) {
  const highlightTerms = useMemo(() => {
    if (!query.trim()) return [];
    // 与搜索逻辑一致：先按空格拆词，再对每个词做中文分词
    return query.split(/\s+/).filter(Boolean).flatMap(term => {
      const tokens = tokenizeChinese(term);
      return tokens.length > 0 ? tokens : [term];
    });
  }, [query]);

  const parts = useMemo(() => {
    if (highlightTerms.length === 0) return null;
    const pattern = Array.from(new Set(highlightTerms.map(t => t.toLowerCase())))
      .map(escapeRegExp)
      .join('|');
    return text.split(new RegExp(`(${pattern})`, 'gi'));
  }, [text, highlightTerms]);

  if (!parts) return <>{text}</>;

  const lowerTerms = new Set(highlightTerms.map(t => t.toLowerCase()));
  return (
    <>
      {parts.map((part, i) =>
        lowerTerms.has(part.toLowerCase()) ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
      )}
    </>
  );
});