/**
 * 搜索结果接口
 */
export interface SearchResult {
  docId: string;                                   // 文档 ID
  notebookId: string;                              // 知识库 ID
  titleMatch: boolean;                             // 标题是否匹配
  contentMatches: Array<{                          // 内容匹配列表
    lineIndex: number;                             // 匹配行索引
    content: string;                               // 匹配内容
    highlighted: string;                           // 高亮内容
  }>;
  tagMatches: string[];                            // 匹配的标签列表
  score: number;                                   // 相关度分数
}

/**
 * 执行全文搜索
 * @param searchText 搜索关键词
 * @param notebooks 知识库列表
 * @param options 搜索选项（大小写敏感、模糊搜索）
 * @returns 搜索结果列表（按相关度降序排列）
 */
export const performFullTextSearch = (
  searchText: string, 
  notebooks: any[], 
  options: { caseSensitive?: boolean; fuzzy?: boolean } = {}
): SearchResult[] => {
  // 如果搜索关键词为空，返回空数组
  if (!searchText.trim()) return [];

  const { caseSensitive = false } = options;
  const searchTerm = caseSensitive ? searchText : searchText.toLowerCase();
  const results: SearchResult[] = [];

  // 遍历所有知识库
  notebooks.forEach(notebook => {
    // 遍历知识库中的所有文档
    notebook.docs.forEach((doc: any) => {
      let score = 0;
      const contentMatches: Array<{ lineIndex: number; content: string; highlighted: string }> = [];
      const tagMatches: string[] = [];

      // 在标题中搜索
      const title = caseSensitive ? doc.title : doc.title.toLowerCase();
      if (title.includes(searchTerm)) {
        score += 100; // 标题匹配权重最高
      }

      // 在内容中搜索
      const content = caseSensitive ? doc.content : doc.content.toLowerCase();
      if (content) {
        const lines = content.split('\n');
        lines.forEach((line: string, index: number) => {
          if (line.includes(searchTerm)) {
            // 根据词频计算相关性
            const termCount = (line.match(new RegExp(searchTerm, 'g')) || []).length;
            score += termCount * 10;

            // 创建高亮内容
            const highlightPattern = new RegExp(`(${searchTerm})`, caseSensitive ? 'g' : 'gi');
            const highlighted = caseSensitive 
              ? line 
              : line.replace(highlightPattern, '<mark>$1</mark>');

            contentMatches.push({
              lineIndex: index,
              content: line.length > 100 ? line.substring(0, 100) + '...' : line,
              highlighted
            });
          }
        });
      }

      // 在标签中搜索
      if (doc.tags && Array.isArray(doc.tags)) {
        doc.tags.forEach((tag: string) => {
          const tagText = caseSensitive ? tag : tag.toLowerCase();
          if (tagText.includes(searchTerm)) {
            score += 50; // 标签匹配权重次之
            tagMatches.push(tag);
          }
        });
      }

      // 只有分数大于 0 的结果才加入列表
      if (score > 0) {
        results.push({
          docId: doc.id,
          notebookId: notebook.id,
          titleMatch: title.includes(searchTerm),
          contentMatches,
          tagMatches,
          score
        });
      }
    });
  });

  // 按分数降序排序（相关度从高到低）
  return results.sort((a, b) => b.score - a.score);
};