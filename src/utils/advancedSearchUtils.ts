/**
 * 搜索结果接口
 */
export interface SearchResult {
  docId: string;                                                          // 文档 ID
  notebookId: string;                                                     // 知识库 ID
  titleMatch: boolean;                                                    // 标题是否匹配
  contentMatches: Array<{ lineIndex: number; content: string; highlighted: string; offset: number }>; // 内容匹配列表
  tagMatches: string[];                                                   // 匹配的标签列表
  score: number;                                                          // 相关度分数
  snippet: string;                                                        // 摘要内容
}

/**
 * 中文分词函数
 * 将中文字符单独分开，保留英文单词作为完整token
 */
const tokenizeChinese = (text: string): string[] => {
  const tokens: string[] = [];
  let currentToken = '';
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    
    // 检查是否为中文字符
    if (/[\u4e00-\u9fff]/.test(char)) {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
      tokens.push(char);
    } 
    // 检查是否为英文字母或数字
    else if (/[a-zA-Z0-9]/.test(char)) {
      currentToken += char;
    }
    // 其他字符（空格、标点等）作为分隔符
    else {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = '';
      }
    }
  }
  
  if (currentToken) {
    tokens.push(currentToken);
  }
  
  return tokens.filter(token => token.trim() !== '');
};

/**
 * 执行高级全文搜索（支持中文分词和模糊搜索）
 * @param searchText 搜索关键词
 * @param notebooks 知识库列表
 * @param options 搜索选项
 * @returns 搜索结果列表（按相关度降序排列）
 */
export const performAdvancedFullTextSearch = (
  searchText: string, 
  notebooks: any[], 
  options: { 
    caseSensitive?: boolean; 
    fuzzy?: boolean;
    includeSnippets?: boolean;
    snippetLength?: number;
  } = {}
): SearchResult[] => {
  if (!searchText.trim()) return [];

  const { 
    caseSensitive = false, 
    fuzzy = false,
    includeSnippets = true,
    snippetLength = 100
  } = options;
  
  // 如果启用模糊搜索，对中文进行分词
  const searchTerms = fuzzy 
    ? tokenizeChinese(caseSensitive ? searchText : searchText.toLowerCase())
    : [caseSensitive ? searchText : searchText.toLowerCase()];
    
  const results: SearchResult[] = [];

  // 遍历所有知识库和文档
  notebooks.forEach(notebook => {
    notebook.docs.forEach((doc: any) => {
      let score = 0;
      let allContentMatches: Array<{ lineIndex: number; content: string; highlighted: string; offset: number }> = [];
      const tagMatches: string[] = [];
      let titleMatch = false;

      // 搜索标题
      const title = caseSensitive ? doc.title : doc.title.toLowerCase();
      searchTerms.forEach(term => {
        if (title.includes(term)) {
          score += 100; // 标题匹配权重更高
          titleMatch = true;
        }
      });

      // 搜索内容
      const content = caseSensitive ? doc.content : doc.content.toLowerCase();
      if (content) {
        const lines = content.split('\n');
        lines.forEach((line: string, index: number) => {
          let lineScore = 0;
          const matches: Array<{ lineIndex: number; content: string; highlighted: string; offset: number }> = [];
          
          searchTerms.forEach(term => {
            let searchStart = 0;
            let matchIndex;
            
            // 在当前行中查找所有匹配项
            while ((matchIndex = line.indexOf(term, searchStart)) !== -1) {
              // 计算相关度分数（根据匹配词长度）
              lineScore += term.length * 10;
              
              // 创建高亮内容
              const highlightPattern = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, caseSensitive ? 'g' : 'gi');
              const highlighted = caseSensitive 
                ? line 
                : line.replace(highlightPattern, '<mark>$1</mark>');
                
              matches.push({
                lineIndex: index,
                content: line.length > snippetLength ? line.substring(0, snippetLength) + '...' : line,
                highlighted,
                offset: matchIndex
              });
              
              searchStart = matchIndex + term.length;
            }
          });
          
          if (lineScore > 0) {
            score += lineScore;
            allContentMatches = [...allContentMatches, ...matches];
          }
        });
      }

      // 搜索标签
      if (doc.tags && Array.isArray(doc.tags)) {
        doc.tags.forEach((tag: string) => {
          const tagText = caseSensitive ? tag : tag.toLowerCase();
          searchTerms.forEach(term => {
            if (tagText.includes(term)) {
              score += 50; // 标签匹配权重较高
              if (!tagMatches.includes(tag)) {
                tagMatches.push(tag);
              }
            }
          });
        });
      }

      // 如果有匹配结果，添加到结果列表
      if (score > 0) {
        const snippet = includeSnippets && allContentMatches.length > 0
          ? allContentMatches[0].content
          : '';

        results.push({
          docId: doc.id,
          notebookId: notebook.id,
          titleMatch,
          contentMatches: allContentMatches,
          tagMatches,
          score,
          snippet
        });
      }
    });
  });

  // 按分数排序（最高分优先）
  return results.sort((a, b) => b.score - a.score);
};

/**
 * 获取搜索建议
 * @param searchText 当前输入的搜索词
 * @param notebooks 知识库列表
 * @param maxSuggestions 最大建议数量
 * @returns 建议词列表
 */
export const getSuggestions = (
  searchText: string,
  notebooks: any[],
  maxSuggestions: number = 5
): string[] => {
  if (!searchText.trim()) return [];
  
  const suggestions: string[] = [];
  const lowerSearchText = searchText.toLowerCase();
  
  // 在文档标题和标签中查找相似内容
  notebooks.forEach(notebook => {
    notebook.docs.forEach((doc: any) => {
      // 匹配标题
      if (doc.title.toLowerCase().includes(lowerSearchText) && 
          !suggestions.includes(doc.title) && 
          doc.title.toLowerCase() !== lowerSearchText) {
        suggestions.push(doc.title);
      }
      
      // 匹配标签
      if (doc.tags && Array.isArray(doc.tags)) {
        doc.tags.forEach((tag: string) => {
          if (tag.toLowerCase().includes(lowerSearchText) && 
              !suggestions.includes(tag)) {
            suggestions.push(tag);
          }
        });
      }
    });
  });
  
  return suggestions.slice(0, maxSuggestions);
};

/**
 * 高亮搜索结果中的匹配文本
 * @param text 原始文本
 * @param searchTerm 搜索关键词
 * @param caseSensitive 是否大小写敏感
 * @returns 高亮后的文本（使用 <mark> 标签）
 */
export const highlightText = (text: string, searchTerm: string, caseSensitive: boolean = false): string => {
  if (!searchTerm) return text;
  
  const flags = caseSensitive ? 'g' : 'gi';
  const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedTerm})`, flags);
  
  return text.replace(regex, '<mark>$1</mark>');
};

/**
 * 获取搜索结果摘要
 * @param content 完整内容
 * @param searchTerm 搜索关键词
 * @param length 摘要长度
 * @returns 摘要文本
 */
export const getSearchResultSnippet = (content: string, searchTerm: string, length: number = 100): string => {
  if (!searchTerm) return content.substring(0, length) + (content.length > length ? '...' : '');
  
  const lowerContent = content.toLowerCase();
  const lowerSearchTerm = searchTerm.toLowerCase();
  const index = lowerContent.indexOf(lowerSearchTerm);
  
  if (index === -1) {
    // 如果找不到精确匹配，返回开头部分
    return content.substring(0, length) + (content.length > length ? '...' : '');
  }
  
  // 在匹配位置周围截取摘要
  const start = Math.max(0, index - Math.floor(length / 2));
  const end = Math.min(content.length, start + length);
  
  let snippet = content.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < content.length) snippet += '...';
  
  return snippet;
};