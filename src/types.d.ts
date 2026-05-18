// 搜索相关的类型定义

/**
 * 搜索历史记录
 */
export interface SearchHistory {
  id: string;           // 记录 ID
  query: string;        // 搜索关键词
  timestamp: string;    // 搜索时间
  resultCount: number;  // 搜索结果数量
}

/**
 * 搜索建议项
 */
export interface SearchSuggestion {
  text: string;                              // 建议文本
  type: 'tag' | 'title' | 'content' | 'history'; // 建议类型
  tagId?: string;                            // 标签 ID（如果是标签类型）
  docId?: string;                            // 文档 ID（如果是文档标题类型）
}

/**
 * 搜索筛选条件
 */
export interface SearchFilter {
  dateRange?: { start: string; end: string }; // 日期范围
  type?: 'all' | 'document' | 'notebook';     // 搜索类型
  author?: string;                            // 作者（预留字段）
  tags?: string[];                            // 标签筛选
}

/**
 * 搜索结果
 */
export interface SearchResult {
  type: 'doc' | 'notebook';                  // 结果类型
  id: string;                                // 结果 ID
  notebookId?: string;                       // 知识库 ID
  title: string;                             // 标题
  content?: string;                          // 内容摘要
  tags: string[];                            // 标签列表
  updatedAt: string;                         // 更新时间
  highlights?: { field: string; text: string }[]; // 高亮片段
}

// 标签相关的类型定义

/**
 * 标签接口
 */
export interface Tag {
  id: string;                // 标签 ID
  name: string;              // 标签名称
  color: string;             // 标签颜色
  icon: string;              // 标签图标
  parentId: string | null;   // 父标签 ID（支持层级）
  children?: Tag[];          // 子标签列表
  description?: string;      // 标签描述
  usageCount: number;        // 使用次数
  createdAt: string;         // 创建时间
  updatedAt: string;         // 更新时间
}

/**
 * 标签统计信息
 */
export interface TagStats {
  totalCount: number;                          // 标签总数
  usedCount: number;                           // 已使用标签数
  unusedCount: number;                         // 未使用标签数
  topTags: { tag: Tag; count: number }[];     // 热门标签列表
  tagDistribution: { category: string; count: number }[]; // 使用分布
}

// 分享相关的类型定义

/**
 * 分享链接
 */
export interface ShareLink {
  id: string;                                  // 链接 ID
  docId: string;                               // 文档 ID
  notebookId: string;                          // 知识库 ID
  url: string;                                 // 分享链接地址
  permission: 'view' | 'comment' | 'edit' | 'manage'; // 访问权限
  password: string | null;                     // 密码（可选）
  expiresAt: string | null;                    // 过期时间（可选）
  createdAt: string;                           // 创建时间
  createdBy?: string;                          // 创建者（预留字段）
  accessCount: number;                         // 访问次数
  lastAccessedAt: string | null;               // 最后访问时间
}

/**
 * 分享设置
 */
export interface ShareSettings {
  enabled: boolean;                            // 是否启用分享
  defaultPermission: 'view' | 'comment' | 'edit' | 'manage'; // 默认权限
  allowPassword: boolean;                      // 是否允许设置密码
  allowExpiration: boolean;                    // 是否允许设置过期时间
}

// 版本历史类型定义

/**
 * 文档版本
 */
export interface DocVersion {
  id: string;                // 版本 ID
  docId: string;             // 所属文档 ID
  notebookId: string;        // 所属知识库 ID
  title: string;             // 版本标题
  content: string;           // 版本内容
  tags: string[];            // 标签列表
  createdAt: string;         // 创建时间
  updatedAt: string;         // 更新时间
  versionTag?: string;       // 版本标签（如 v1.0.0）
  comment?: string;          // 版本备注
  type: 'auto' | 'manual' | 'published'; // 版本类型
}

// 更新现有的类型定义

/**
 * 笔记文档
 */
export interface NoteDoc {
  id: string;                // 文档 ID
  title: string;             // 文档标题
  content: string;           // 文档内容（Markdown格式）
  parentId: string | null;   // 父文档 ID（支持层级）
  tags: string[];            // 标签 ID 列表
  favorite: boolean;         // 是否收藏
  pinned: boolean;           // 是否置顶
  updatedAt: string;         // 更新时间
  shareLinks?: ShareLink[];  // 分享链接列表
  shareSettings?: ShareSettings; // 分享设置
  versions?: DocVersion[];   // 版本历史
}

/**
 * 回收站文档
 */
export interface TrashDoc extends NoteDoc {
  notebookId: string;        // 原知识库 ID
  notebookTitle: string;     // 原知识库标题
  originalParentId: string | null; // 原父文档 ID
}

/**
 * 知识库
 */
export interface Notebook {
  id: string;                // 知识库 ID
  title: string;             // 知识库标题
  docs: NoteDoc[];           // 文档列表
}

/**
 * 应用状态存储
 */
export interface AppStore {
  notebooks: Notebook[];     // 知识库列表
  trash: TrashDoc[];         // 回收站文档列表
  tags: Tag[];               // 标签列表
  searchHistory: SearchHistory[]; // 搜索历史
}

// 全局类型声明

declare global {
  interface Window {
    notesApi: {
      load: () => Promise<AppStore>;                                         // 加载数据
      save: (payload: AppStore) => Promise<AppStore>;                        // 保存数据
      exportDoc: (payload: { title: string; content: string }) => Promise<boolean>; // 导出文档
      exportNotebook: (payload: { title: string; docs: NoteDoc[] }) => Promise<boolean>; // 导出知识库
      exportNotebookZip: (payload: { title: string; docs: NoteDoc[] }) => Promise<boolean>; // 导出知识库为 ZIP
      saveImage: (payload: { name: string; data: string }) => Promise<string>; // 保存图片
    };
  }
}