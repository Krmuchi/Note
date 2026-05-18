// 搜索结果面板组件
import React from 'react';
import type { SearchResult } from '../utils/advancedSearchUtils';
import { useNotesStore } from '../store/notesStore';

/**
 * 搜索结果面板属性接口
 */
interface SearchResultsPanelProps {
  searchResults: SearchResult[];                    // 搜索结果列表
  searchText: string;                               // 搜索关键词
  onClose: () => void;                              // 关闭回调
  onItemClick: (docId: string, notebookId: string) => void; // 点击结果项回调
}

/**
 * 搜索结果面板组件
 */
const SearchResultsPanel: React.FC<SearchResultsPanelProps> = ({ 
  searchResults, 
  searchText, 
  onClose, 
  onItemClick 
}) => {
  const { notebooks } = useNotesStore();
  
  // 如果搜索关键词为空，返回 null
  if (!searchText.trim()) {
    return null;
  }
  
  return (
    <div className="search-results-panel">
      <div className="search-results-header">
        <h3>搜索结果</h3>
        <button className="btn-ghost" onClick={onClose}>关闭</button>
      </div>
      {searchResults.length === 0 ? (
        <div className="search-results-empty">没有找到匹配的结果</div>
      ) : (
        <div className="search-results-list">
          {searchResults.map(result => {
            // 获取结果对应的知识库和文档
            const notebook = notebooks.find(nb => nb.id === result.notebookId);
            const doc = notebook?.docs.find(d => d.id === result.docId);
            
            return (
              <div 
                key={`${result.notebookId}-${result.docId}`} 
                className="search-result-item"
                onClick={() => onItemClick(result.docId, result.notebookId)}
              >
                <div className="search-result-title">
                  <span className="search-result-doc-title">{doc?.title || '未知文档'}</span>
                  <span className="search-result-notebook-title">{notebook?.title || '未知知识库'}</span>
                </div>
                <div className="search-result-snippet" 
                     dangerouslySetInnerHTML={{__html: result.snippet}} />
                <div className="search-result-meta">
                  <span className="search-result-score">相关度: {result.score}</span>
                  <span className="search-result-matches">匹配项: {result.contentMatches.length}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default SearchResultsPanel;