// 导入 Zustand 状态管理库
import { create } from 'zustand';
// 导入类型定义
import type { AppStore, NoteDoc, Notebook, ShareLink, Tag, TagStats, SearchHistory, SearchSuggestion, SearchFilter, SearchResult, DocVersion } from '../types';

/**
 * 保存状态类型
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * NotesStore 接口定义
 * 扩展自 AppStore，添加状态管理的 actions
 */
interface NotesStore extends AppStore {
  // 核心操作
  loadNotes: () => Promise<void>;   // 加载笔记数据
  saveNotes: () => Promise<void>;   // 保存笔记数据
  updateStore: (store: AppStore) => void; // 更新整个状态

  // 自动保存状态
  saveStatus: SaveStatus;           // 当前保存状态
  lastSavedAt: string | null;       // 最后保存时间
  setSaveStatus: (status: SaveStatus) => void; // 设置保存状态
  
  // 知识库操作
  createNotebook: (title: string) => void;           // 创建知识库
  updateNotebookTitle: (id: string, title: string) => void; // 更新知识库标题
  deleteNotebook: (id: string) => void;              // 删除知识库
  
  // 文档操作
  createDoc: (notebookId: string, parentId: string | null, docData?: Partial<NoteDoc>) => void; // 创建文档
  updateDoc: (notebookId: string, docId: string, updates: Partial<NoteDoc>) => void; // 更新文档
  deleteDoc: (notebookId: string, docId: string) => void; // 删除文档
  moveDocToTrash: (notebookId: string, docId: string) => void; // 移动文档到回收站
  
  // 版本历史操作
  saveVersion: (notebookId: string, docId: string, type: 'auto' | 'manual' | 'published') => void; // 保存版本
  getDocVersions: (notebookId: string, docId: string) => DocVersion[] | undefined; // 获取文档版本
  restoreVersion: (notebookId: string, docId: string, versionId: string) => void; // 恢复版本
  
  // 收藏操作
  toggleFavorite: (notebookId: string, docId: string) => void; // 切换收藏状态
  
  // 回收站操作
  restoreFromTrash: (docId: string) => void; // 从回收站恢复
  deleteFromTrash: (docId: string) => void;  // 彻底删除
  clearTrash: () => void;                     // 清空回收站
  
  // 分享操作
  generateShareLink: (notebookId: string, docId: string, permission: 'view' | 'comment' | 'edit' | 'manage', password: string, expiresAt: string | null) => void; // 生成分享链接
  deleteShareLink: (notebookId: string, docId: string, linkId: string) => void; // 删除分享链接
  
  // 标签操作
  createTag: (name: string, color?: string, icon?: string, parentId?: string | null) => void; // 创建标签
  updateTag: (id: string, updates: Partial<Tag>) => void; // 更新标签
  deleteTag: (id: string) => void; // 删除标签
  addTagToDoc: (notebookId: string, docId: string, tagId: string) => void; // 为文档添加标签
  removeTagFromDoc: (notebookId: string, docId: string, tagId: string) => void; // 从文档移除标签
  updateTagUsageCounts: () => void; // 更新标签使用计数
  getTagStats: () => TagStats; // 获取标签统计
  getRecommendedTags: (docContent: string, limit?: number) => Tag[]; // 获取推荐标签
  batchUpdateTags: (tagIds: string[], updates: Partial<Tag>) => void; // 批量更新标签
  getTagsWithHierarchy: () => Tag[]; // 获取带层级的标签
  
  // 搜索操作
  search: (query: string, filters?: SearchFilter) => SearchResult[]; // 搜索
  getSearchSuggestions: (query: string) => SearchSuggestion[]; // 获取搜索建议
  addSearchHistory: (query: string, resultCount: number) => void; // 添加搜索历史
  clearSearchHistory: () => void; // 清空搜索历史
  removeSearchHistoryItem: (id: string) => void; // 删除搜索历史项
  
  // 活动状态
  activeNotebookId: string;           // 当前活动知识库 ID
  activeDocId: string;                // 当前活动文档 ID
  setActiveNotebookId: (id: string) => void; // 设置活动知识库
  setActiveDocId: (id: string) => void;      // 设置活动文档
  
  // 搜索文本
  searchText: string;                 // 当前搜索文本
  setSearchText: (text: string) => void; // 设置搜索文本
}

/**
 * 生成唯一 ID
 * 使用时间戳 + 随机数组合
 */
const newId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * 生成分享链接 URL
 */
const generateShareUrl = (docId: string, linkId: string) => {
  return `${window.location.origin}/share/${docId}/${linkId}`;
};

/**
 * 默认标签颜色列表
 */
const defaultColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

/**
 * 创建 NotesStore 状态管理
 */
export const useNotesStore = create<NotesStore>((set, get) => ({
  // 初始状态
  notebooks: [],        // 知识库列表
  trash: [],           // 回收站
  tags: [],            // 标签列表
  searchHistory: [],   // 搜索历史
  activeNotebookId: '', // 当前活动知识库 ID
  activeDocId: '',      // 当前活动文档 ID
  searchText: '',      // 搜索文本
  saveStatus: 'idle',  // 保存状态
  lastSavedAt: null,   // 最后保存时间
  setSaveStatus: (status) => set({ saveStatus: status }), // 设置保存状态

  /**
   * 加载笔记数据
   * 从 window.notesApi 加载并标准化数据
   */
  loadNotes: async () => {
    try {
      const loaded = await window.notesApi.load();
      // 标准化数据格式，处理可能缺失的字段
      const normalized: AppStore = {
        notebooks: loaded.notebooks.map((notebook) => ({
          ...notebook,
          docs: notebook.docs.map((doc) => ({
            ...doc,
            parentId: doc.parentId ?? null,
            tags: doc.tags ?? [],
            favorite: doc.favorite ?? false,
            pinned: doc.pinned ?? false,
            shareLinks: doc.shareLinks ?? [],
            shareSettings: doc.shareSettings ?? {
              enabled: false,
              defaultPermission: 'view',
              allowPassword: true,
              allowExpiration: true,
            },
          })),
        })),
        trash: (loaded.trash ?? []).map((doc) => ({
          ...doc,
          parentId: doc.parentId ?? null,
          tags: doc.tags ?? [],
          favorite: doc.favorite ?? false,
          pinned: doc.pinned ?? false,
          notebookId: doc.notebookId ?? "",
          notebookTitle: doc.notebookTitle ?? "未归类知识库",
          originalParentId: doc.originalParentId ?? doc.parentId ?? null,
        })),
        tags: (loaded.tags ?? []).map(tag => ({
          ...tag,
          parentId: tag.parentId ?? null,
          usageCount: tag.usageCount ?? 0,
        })),
        searchHistory: loaded.searchHistory ?? [],
      };
      
      const now = new Date().toISOString();
      set({ ...normalized, lastSavedAt: now, saveStatus: 'saved' });

      // 设置默认活动状态
      if (normalized.notebooks.length > 0) {
        const firstNotebook = normalized.notebooks[0];
        set({ activeNotebookId: firstNotebook.id });
        
        if (firstNotebook.docs.length > 0) {
          set({ activeDocId: firstNotebook.docs[0].id });
        }
      }
    } catch (error) {
      console.error('Failed to load notes:', error);
    }
  },

  /**
   * 保存笔记数据到持久化存储
   */
  saveNotes: async () => {
    const { notebooks, trash, tags } = get();
    set({ saveStatus: 'saving' });
    try {
      await window.notesApi.save({ notebooks, trash, tags, searchHistory: get().searchHistory });
      set({ saveStatus: 'saved', lastSavedAt: new Date().toISOString() });
    } catch (error) {
      console.error('Failed to save notes:', error);
      set({ saveStatus: 'error' });
    }
  },

  /**
   * 直接更新整个状态存储
   */
  updateStore: (store) => set({ ...store }),

  /**
   * 创建新知识库
   */
  createNotebook: (title) => {
    const { notebooks } = get();
    const newNotebook: Notebook = { 
      id: newId(), 
      title: title || "新建知识库", 
      docs: [] 
    };
    
    const updatedNotebooks = [...notebooks, newNotebook];
    set({ 
      notebooks: updatedNotebooks,
      activeNotebookId: newNotebook.id
    });
  },

  /**
   * 更新知识库标题
   */
  updateNotebookTitle: (id, title) => {
    const { notebooks } = get();
    const updatedNotebooks = notebooks.map(nb => 
      nb.id === id ? { ...nb, title } : nb
    );
    set({ notebooks: updatedNotebooks });
  },

  /**
   * 删除知识库
   * 将知识库中的所有文档移到回收站
   */
  deleteNotebook: (id) => {
    const { notebooks, activeNotebookId } = get();
    const target = notebooks.find(nb => nb.id === id);
    
    if (!target) return;
    
    // 将所有文档移到回收站
    const docsToTrash = target.docs.map(doc => ({
      ...doc,
      parentId: null,
      originalParentId: doc.parentId ?? null,
      updatedAt: new Date().toISOString(),
      notebookId: target.id,
      notebookTitle: target.title,
    }));
    
    const updatedNotebooks = notebooks.filter(nb => nb.id !== id);
    const updatedTrash = [...get().trash, ...docsToTrash];
    
    set({ 
      notebooks: updatedNotebooks, 
      trash: updatedTrash,
      // 如果删除的是当前活动知识库，切换到第一个知识库
      ...(activeNotebookId === id ? { 
        activeNotebookId: updatedNotebooks[0]?.id || '',
        activeDocId: ''
      } : {})
    });
  },

  /**
   * 创建新文档
   */
  createDoc: (notebookId, parentId, docData = {}) => {
    const { notebooks } = get();
    const newDoc: NoteDoc = {
      id: newId(),
      title: docData.title || "未命名文档",
      content: docData.content || "",
      parentId: parentId || null,
      tags: docData.tags || [],
      favorite: docData.favorite || false,
      pinned: docData.pinned || false,
      updatedAt: new Date().toISOString(),
      shareLinks: [],
      shareSettings: {
        enabled: false,
        defaultPermission: 'view',
        allowPassword: true,
        allowExpiration: true,
      },
      ...docData
    };

    const updatedNotebooks = notebooks.map(nb => 
      nb.id === notebookId 
        ? { ...nb, docs: [...nb.docs, newDoc] } 
        : nb
    );
    
    set({ 
      notebooks: updatedNotebooks,
      activeNotebookId: notebookId,
      activeDocId: newDoc.id
    });
  },

  /**
   * 更新文档内容
   * 同时自动保存版本历史
   */
  updateDoc: (notebookId, docId, updates) => {
    const { notebooks } = get();
    const notebook = notebooks.find(nb => nb.id === notebookId);
    const doc = notebook?.docs.find(d => d.id === docId);
    
    // 更新文档
    const updatedNotebooks = notebooks.map(nb => {
      if (nb.id !== notebookId) return nb;
      
      return {
        ...nb,
        docs: nb.docs.map(d => 
          d.id === docId 
            ? { ...d, ...updates, updatedAt: new Date().toISOString() } 
            : d
        )
      };
    });
    
    set({ notebooks: updatedNotebooks });
    
    // 创建自动保存版本
    if (doc) {
      const newVersion: DocVersion = {
        id: newId(),
        docId: doc.id,
        notebookId: notebookId,
        title: doc.title,
        content: doc.content,
        tags: doc.tags,
        createdAt: new Date().toISOString(),
        updatedAt: doc.updatedAt,
        type: 'auto',
      };
      
      const withVersion = updatedNotebooks.map(nb => {
        if (nb.id !== notebookId) return nb;
        return {
          ...nb,
          docs: nb.docs.map(d => {
            if (d.id !== docId) return d;
            const versions = d.versions || [];
            return {
              ...d,
              versions: [newVersion, ...versions].slice(0, 50), // 最多保留50个版本
            };
          }),
        };
      });
      
      set({ notebooks: withVersion });
    }
  },

  /**
   * 手动保存版本
   */
  saveVersion: (notebookId, docId, type) => {
    const { notebooks } = get();
    const notebook = notebooks.find(nb => nb.id === notebookId);
    const doc = notebook?.docs.find(d => d.id === docId);
    
    if (!doc) return;
    
    const newVersion: DocVersion = {
      id: newId(),
      docId: doc.id,
      notebookId: notebookId,
      title: doc.title,
      content: doc.content,
      tags: doc.tags,
      createdAt: new Date().toISOString(),
      updatedAt: doc.updatedAt,
      type,
    };
    
    const updatedNotebooks = notebooks.map(nb => {
      if (nb.id !== notebookId) return nb;
      
      return {
        ...nb,
        docs: nb.docs.map(d => {
          if (d.id !== docId) return d;
          const versions = d.versions || [];
          return {
            ...d,
            versions: [newVersion, ...versions].slice(0, 50),
          };
        }),
      };
    });
    
    set({ notebooks: updatedNotebooks });
  },

  /**
   * 获取文档的版本历史
   */
  getDocVersions: (notebookId, docId) => {
    const { notebooks } = get();
    const notebook = notebooks.find(nb => nb.id === notebookId);
    const doc = notebook?.docs.find(d => d.id === docId);
    return doc?.versions;
  },

  /**
   * 恢复到指定版本
   */
  restoreVersion: (notebookId, docId, versionId) => {
    const { notebooks } = get();
    const notebook = notebooks.find(nb => nb.id === notebookId);
    const doc = notebook?.docs.find(d => d.id === docId);
    const version = doc?.versions?.find(v => v.id === versionId);
    
    if (!version) return;
    
    const updatedNotebooks = notebooks.map(nb => {
      if (nb.id !== notebookId) return nb;
      
      return {
        ...nb,
        docs: nb.docs.map(d => {
          if (d.id !== docId) return d;
          return {
            ...d,
            title: version.title,
            content: version.content,
            tags: version.tags,
            updatedAt: new Date().toISOString(),
          };
        }),
      };
    });
    
    set({ notebooks: updatedNotebooks });
  },

  /**
   * 切换文档收藏状态
   */
  toggleFavorite: (notebookId, docId) => {
    const { notebooks } = get();
    const updatedNotebooks = notebooks.map(nb => {
      if (nb.id !== notebookId) return nb;
      
      return {
        ...nb,
        docs: nb.docs.map(doc => 
          doc.id === docId 
            ? { ...doc, favorite: !doc.favorite, updatedAt: new Date().toISOString() } 
            : doc
        )
      };
    });
    
    set({ notebooks: updatedNotebooks });
  },

  /**
   * 直接删除文档（不经过回收站）
   */
  deleteDoc: (notebookId, docId) => {
    const { notebooks, activeDocId } = get();
    const updatedNotebooks = notebooks.map(nb => {
      if (nb.id !== notebookId) return nb;
      
      return {
        ...nb,
        docs: nb.docs.filter(doc => doc.id !== docId)
      };
    });
    
    set({ 
      notebooks: updatedNotebooks,
      ...(activeDocId === docId ? { activeDocId: '' } : {})
    });
  },

  /**
   * 将文档移动到回收站
   */
  moveDocToTrash: (notebookId, docId) => {
    const { notebooks, trash } = get();
    const notebook = notebooks.find(nb => nb.id === notebookId);
    const doc = notebook?.docs.find(d => d.id === docId);
    
    if (!doc) return;
    
    // 更新知识库：移除文档，并处理子文档的父级引用
    const updatedNotebooks = notebooks.map(nb => {
      if (nb.id !== notebookId) return nb;
      
      return {
        ...nb,
        docs: nb.docs
          .filter(d => d.id !== docId)
          .map(d => d.parentId === docId ? { ...d, parentId: doc.parentId } : d)
      };
    });
    
    // 添加到回收站
    const updatedTrash = [...trash, {
      ...doc,
      updatedAt: new Date().toISOString(),
      parentId: null,
      originalParentId: doc.parentId ?? null,
      notebookId: notebookId,
      notebookTitle: notebook!.title,
    }];
    
    set({ 
      notebooks: updatedNotebooks, 
      trash: updatedTrash,
      ...(get().activeDocId === docId ? { activeDocId: '' } : {})
    });
  },

  /**
   * 从回收站恢复文档
   */
  restoreFromTrash: (docId) => {
    const { trash, notebooks, activeNotebookId } = get();
    const target = trash.find(item => item.id === docId);
    
    if (!target) return;
    
    // 创建恢复后的文档
    const restoredDoc: NoteDoc = {
      id: target.id,
      title: target.title,
      content: target.content,
      parentId: target.originalParentId,
      tags: target.tags,
      favorite: target.favorite,
      updatedAt: target.updatedAt,
      pinned: false,
      shareLinks: [],
      shareSettings: {
        enabled: false,
        defaultPermission: 'view',
        allowPassword: true,
        allowExpiration: true,
      },
    };
    
    const targetNotebookId = target.notebookId || activeNotebookId;
    if (!targetNotebookId) return;
    
    // 将文档恢复到原知识库
    const updatedNotebooks = notebooks.map(nb =>
      nb.id === targetNotebookId
        ? { ...nb, docs: [...nb.docs, restoredDoc] }
        : nb
    );
    
    const updatedTrash = trash.filter(item => item.id !== docId);
    
    set({
      notebooks: updatedNotebooks,
      trash: updatedTrash,
      activeNotebookId: targetNotebookId,
      activeDocId: target.id
    });
  },

  /**
   * 从回收站彻底删除
   */
  deleteFromTrash: (docId) => {
    const { trash } = get();
    const updatedTrash = trash.filter(item => item.id !== docId);
    set({ trash: updatedTrash });
  },

  /**
   * 清空回收站
   */
  clearTrash: () => {
    set({ trash: [] });
  },

  /**
   * 生成分享链接
   */
  generateShareLink: (notebookId, docId, permission, password, expiresAt) => {
    const { notebooks } = get();
    const linkId = newId();
    const newLink: ShareLink = {
      id: linkId,
      docId,
      notebookId,
      url: generateShareUrl(docId, linkId),
      permission,
      password: password || null,
      expiresAt,
      createdAt: new Date().toISOString(),
      accessCount: 0,
      lastAccessedAt: null,
    };

    const updatedNotebooks = notebooks.map(nb => {
      if (nb.id !== notebookId) return nb;
      
      return {
        ...nb,
        docs: nb.docs.map(doc =>
          doc.id === docId
            ? {
                ...doc,
                shareLinks: [...(doc.shareLinks || []), newLink],
                shareSettings: {
                  ...doc.shareSettings,
                  enabled: true,
                } as NoteDoc['shareSettings'],
              }
            : doc
        ),
      };
    });
    
    set({ notebooks: updatedNotebooks });
  },

  /**
   * 删除分享链接
   */
  deleteShareLink: (notebookId, docId, linkId) => {
    const { notebooks } = get();
    const updatedNotebooks = notebooks.map(nb => {
      if (nb.id !== notebookId) return nb;
      
      return {
        ...nb,
        docs: nb.docs.map(doc => {
          if (doc.id !== docId) return doc;
          
          const updatedLinks = (doc.shareLinks || []).filter(link => link.id !== linkId);
          return {
            ...doc,
            shareLinks: updatedLinks,
            shareSettings: {
              ...doc.shareSettings,
              enabled: updatedLinks.length > 0,
            } as NoteDoc['shareSettings'],
          };
        }),
      };
    });
    
    set({ notebooks: updatedNotebooks });
  },

  // 设置活动状态
  setActiveNotebookId: (id) => set({ activeNotebookId: id }),
  setActiveDocId: (id) => set({ activeDocId: id }),
  setSearchText: (text) => set({ searchText: text }),

  // ========== 标签操作 ==========
  
  /**
   * 创建标签
   */
  createTag: (name, color = defaultColors[0], icon = '🏷️', parentId = null) => {
    const { tags } = get();
    const newTag: Tag = {
      id: newId(),
      name,
      color,
      icon,
      parentId,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set({ tags: [...tags, newTag] });
  },

  /**
   * 更新标签
   */
  updateTag: (id, updates) => {
    const { tags } = get();
    const updatedTags = tags.map(tag =>
      tag.id === id ? { ...tag, ...updates, updatedAt: new Date().toISOString() } : tag
    );
    set({ tags: updatedTags });
  },

  /**
   * 删除标签
   * 同时从所有文档中移除该标签引用
   */
  deleteTag: (id) => {
    const { tags, notebooks } = get();
    const updatedTags = tags.filter(tag => tag.id !== id);
    
    const updatedNotebooks = notebooks.map(nb => ({
      ...nb,
      docs: nb.docs.map(doc => ({
        ...doc,
        tags: doc.tags.filter(tagId => tagId !== id),
      })),
    }));
    
    set({ tags: updatedTags, notebooks: updatedNotebooks });
  },

  /**
   * 为文档添加标签
   */
  addTagToDoc: (notebookId, docId, tagId) => {
    const { notebooks, tags } = get();
    
    const updatedNotebooks = notebooks.map(nb => {
      if (nb.id !== notebookId) return nb;
      return {
        ...nb,
        docs: nb.docs.map(doc => {
          if (doc.id !== docId) return doc;
          if (doc.tags.includes(tagId)) return doc;
          return { ...doc, tags: [...doc.tags, tagId] };
        }),
      };
    });
    
    // 更新标签使用计数
    const updatedTags = tags.map(tag =>
      tag.id === tagId ? { ...tag, usageCount: tag.usageCount + 1 } : tag
    );
    
    set({ notebooks: updatedNotebooks, tags: updatedTags });
  },

  /**
   * 从文档移除标签
   */
  removeTagFromDoc: (notebookId, docId, tagId) => {
    const { notebooks, tags } = get();
    
    const updatedNotebooks = notebooks.map(nb => {
      if (nb.id !== notebookId) return nb;
      return {
        ...nb,
        docs: nb.docs.map(doc => {
          if (doc.id !== docId) return doc;
          return { ...doc, tags: doc.tags.filter(id => id !== tagId) };
        }),
      };
    });
    
    // 更新标签使用计数
    const updatedTags = tags.map(tag =>
      tag.id === tagId ? { ...tag, usageCount: Math.max(0, tag.usageCount - 1) } : tag
    );
    
    set({ notebooks: updatedNotebooks, tags: updatedTags });
  },

  /**
   * 重新计算所有标签的使用计数
   */
  updateTagUsageCounts: () => {
    const { notebooks, tags } = get();
    
    const usageMap: Record<string, number> = {};
    tags.forEach(tag => {
      usageMap[tag.id] = 0;
    });
    
    notebooks.forEach(nb => {
      nb.docs.forEach(doc => {
        doc.tags.forEach(tagId => {
          if (usageMap[tagId] !== undefined) {
            usageMap[tagId]++;
          }
        });
      });
    });
    
    const updatedTags = tags.map(tag => ({
      ...tag,
      usageCount: usageMap[tag.id] || 0,
    }));
    
    set({ tags: updatedTags });
  },

  /**
   * 获取标签统计信息
   */
  getTagStats: () => {
    const { notebooks, tags } = get();
    
    const usageMap: Record<string, number> = {};
    notebooks.forEach(nb => {
      nb.docs.forEach(doc => {
        doc.tags.forEach(tagId => {
          usageMap[tagId] = (usageMap[tagId] || 0) + 1;
        });
      });
    });
    
    const usedCount = tags.filter(tag => usageMap[tag.id] > 0).length;
    const unusedCount = tags.filter(tag => usageMap[tag.id] === 0).length;
    
    // 获取使用最多的前10个标签
    const topTags = tags
      .map(tag => ({ tag, count: usageMap[tag.id] || 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    
    // 标签分布统计
    const tagDistribution = [
      { category: '高频标签', count: tags.filter(t => usageMap[t.id] >= 10).length },
      { category: '中频标签', count: tags.filter(t => usageMap[t.id] > 2 && usageMap[t.id] < 10).length },
      { category: '低频标签', count: tags.filter(t => usageMap[t.id] > 0 && usageMap[t.id] <= 2).length },
      { category: '未使用', count: unusedCount },
    ];
    
    return {
      totalCount: tags.length,
      usedCount,
      unusedCount,
      topTags,
      tagDistribution,
    };
  },

  /**
   * 根据文档内容推荐标签
   */
  getRecommendedTags: (docContent, limit = 5) => {
    const { tags } = get();
    
    const contentWords = docContent.toLowerCase().split(/\s+/);
    
    const scoreMap: Record<string, number> = {};
    tags.forEach(tag => {
      const tagWords = tag.name.toLowerCase().split(/\s+/);
      let score = 0;
      tagWords.forEach(word => {
        if (contentWords.includes(word)) {
          score += 1;
        }
      });
      // 如果标签有描述，也参与匹配
      if (tag.description) {
        const descWords = tag.description.toLowerCase().split(/\s+/);
        descWords.forEach(word => {
          if (contentWords.includes(word)) {
            score += 0.5;
          }
        });
      }
      if (score > 0) {
        scoreMap[tag.id] = score;
      }
    });
    
    return tags
      .filter(tag => scoreMap[tag.id] !== undefined)
      .sort((a, b) => (scoreMap[b.id] || 0) - (scoreMap[a.id] || 0))
      .slice(0, limit);
  },

  /**
   * 批量更新标签
   */
  batchUpdateTags: (tagIds, updates) => {
    const { tags } = get();
    const updatedTags = tags.map(tag =>
      tagIds.includes(tag.id) ? { ...tag, ...updates, updatedAt: new Date().toISOString() } : tag
    );
    set({ tags: updatedTags });
  },

  /**
   * 获取带层级关系的标签列表
   */
  getTagsWithHierarchy: () => {
    const { tags } = get();
    
    const tagMap = new Map(tags.map(tag => [tag.id, { ...tag, children: [] as Tag[] }]));
    const rootTags: Tag[] = [];
    
    tags.forEach(tag => {
      const mappedTag = tagMap.get(tag.id)!;
      if (tag.parentId && tagMap.has(tag.parentId)) {
        tagMap.get(tag.parentId)!.children = tagMap.get(tag.parentId)!.children || [];
        tagMap.get(tag.parentId)!.children!.push(mappedTag);
      } else {
        rootTags.push(mappedTag);
      }
    });
    
    return rootTags;
  },

  // ========== 搜索操作 ==========
  
  /**
   * 执行搜索
   */
  search: (query, filters) => {
    const { notebooks, tags } = get();
    const results: SearchResult[] = [];

    // 解析搜索查询
    const parseQuery = (q: string) => {
      const terms: { term: string; isNot: boolean; isExact: boolean }[] = [];
      const parts = q.split(/\s+/);
      
      parts.forEach(part => {
        let isNot = false;
        let isExact = false;
        let term = part;
        
        // 处理排除项（以 - 开头）
        if (term.startsWith('-')) {
          isNot = true;
          term = term.slice(1);
        }
        
        // 处理精确匹配（用引号包裹）
        if (term.startsWith('"') && term.endsWith('"')) {
          isExact = true;
          term = term.slice(1, -1);
        }
        
        terms.push({ term: term.toLowerCase(), isNot, isExact });
      });
      
      return terms;
    };

    const terms = parseQuery(query);

    // 检查文本是否匹配查询
    const matchesQuery = (text: string | undefined): boolean => {
      if (!text) return false;
      const lowerText = text.toLowerCase();
      
      return terms.every(({ term, isNot, isExact }) => {
        const found = isExact 
          ? lowerText.includes(term) 
          : term.split('').every(char => lowerText.includes(char));
        
        return isNot ? !found : found;
      });
    };

    // 检查标签过滤
    const matchesTagFilter = (docTags: string[]) => {
      if (!filters?.tags || filters.tags.length === 0) return true;
      return filters.tags.some(tagId => docTags.includes(tagId));
    };

    // 检查日期过滤
    const matchesDateFilter = (updatedAt: string) => {
      if (!filters?.dateRange) return true;
      const docDate = new Date(updatedAt);
      const startDate = new Date(filters.dateRange.start);
      const endDate = new Date(filters.dateRange.end);
      return docDate >= startDate && docDate <= endDate;
    };

    // 搜索知识库
    notebooks.forEach(notebook => {
      if (filters?.type === 'all' || filters?.type === 'notebook') {
        if (matchesQuery(notebook.title)) {
          results.push({
            type: 'notebook',
            id: notebook.id,
            title: notebook.title,
            tags: [],
            updatedAt: notebook.docs[0]?.updatedAt || new Date().toISOString(),
          });
        }
      }

      // 搜索文档
      if (filters?.type === 'all' || filters?.type === 'document') {
        notebook.docs.forEach(doc => {
          const tagNames = doc.tags.map(tagId => tags.find(t => t.id === tagId)?.name || '').join(' ');
          const fullText = `${doc.title} ${doc.content || ''} ${tagNames}`;
          
          if (matchesQuery(fullText) && matchesTagFilter(doc.tags) && matchesDateFilter(doc.updatedAt)) {
            const highlights: { field: string; text: string }[] = [];
            
            // 提取高亮片段
            if (doc.title && terms.some(t => doc.title.toLowerCase().includes(t.term))) {
              highlights.push({ field: 'title', text: doc.title });
            }
            if (doc.content) {
              terms.forEach(t => {
                const idx = doc.content.toLowerCase().indexOf(t.term);
                if (idx !== -1) {
                  const start = Math.max(0, idx - 20);
                  const end = Math.min(doc.content.length, idx + t.term.length + 20);
                  highlights.push({ 
                    field: 'content', 
                    text: doc.content.slice(start, end) 
                  });
                }
              });
            }

            results.push({
              type: 'doc',
              id: doc.id,
              notebookId: notebook.id,
              title: doc.title,
              content: doc.content,
              tags: doc.tags,
              updatedAt: doc.updatedAt,
              highlights: highlights.slice(0, 3), // 最多显示3个高亮
            });
          }
        });
      }
    });

    // 按更新时间排序
    return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  /**
   * 获取搜索建议
   */
  getSearchSuggestions: (query) => {
    const { notebooks, tags, searchHistory } = get();
    const suggestions: SearchSuggestion[] = [];
    const lowerQuery = query.toLowerCase();

    // 标签建议
    tags.forEach(tag => {
      if (tag.name.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          text: tag.name,
          type: 'tag',
          tagId: tag.id,
        });
      }
    });

    // 文档标题建议
    notebooks.forEach(notebook => {
      notebook.docs.forEach(doc => {
        if (doc.title.toLowerCase().includes(lowerQuery)) {
          suggestions.push({
            text: doc.title,
            type: 'title',
            docId: doc.id,
          });
        }
      });
    });

    // 搜索历史建议
    searchHistory.forEach(history => {
      if (history.query.toLowerCase().includes(lowerQuery)) {
        suggestions.push({
          text: history.query,
          type: 'history',
        });
      }
    });

    return suggestions.slice(0, 8); // 最多返回8个建议
  },

  /**
   * 添加搜索历史
   */
  addSearchHistory: (query, resultCount) => {
    const { searchHistory } = get();
    const existing = searchHistory.find(h => h.query === query);
    
    let updatedHistory: SearchHistory[];
    if (existing) {
      // 更新已有记录的时间戳
      updatedHistory = searchHistory.map(h =>
        h.query === query 
          ? { ...h, timestamp: new Date().toISOString(), resultCount }
          : h
      );
    } else {
      // 添加新记录
      const newHistory: SearchHistory = {
        id: newId(),
        query,
        timestamp: new Date().toISOString(),
        resultCount,
      };
      updatedHistory = [newHistory, ...searchHistory].slice(0, 20); // 最多保留20条
    }
    
    set({ searchHistory: updatedHistory });
  },

  /**
   * 清空搜索历史
   */
  clearSearchHistory: () => {
    set({ searchHistory: [] });
  },

  /**
   * 删除单条搜索历史
   */
  removeSearchHistoryItem: (id) => {
    const { searchHistory } = get();
    set({ searchHistory: searchHistory.filter(h => h.id !== id) });
  },
}));