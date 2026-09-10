import type { Tag } from './tag'
import type { SearchHistory } from './search'

export interface ShareLink {
  id: string
  docId: string
  notebookId: string
  url: string
  permission: 'view' | 'comment' | 'edit' | 'manage'
  password: string | null
  expiresAt: string | null
  createdAt: string
  createdBy?: string
  accessCount: number
  lastAccessedAt: string | null
}

export interface ShareSettings {
  enabled: boolean
  defaultPermission: 'view' | 'comment' | 'edit' | 'manage'
  allowPassword: boolean
  allowExpiration: boolean
}

export interface Comment {
  id: string
  docId: string
  author: string
  content: string
  createdAt: string
  updatedAt?: string
  replies?: Comment[]
  /** 划词评论：关联的引用文本 */
  quote?: string
  /** 引用文本在文档全文中的起止偏移（可选，用于后续跳转定位） */
  anchorStart?: number
  anchorEnd?: number
}

export interface DocVersion {
  id: string
  docId: string
  notebookId: string
  title: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
  versionTag?: string
  comment?: string
  type: 'auto' | 'manual' | 'published'
}

export interface NoteDoc {
  id: string
  title: string
  content: string
  parentId: string | null
  tags: string[]
  favorite: boolean
  pinned: boolean
  createdAt: string
  updatedAt: string
  shareLinks?: ShareLink[]
  shareSettings?: ShareSettings
  versions?: DocVersion[]
  comments?: Comment[]
}

export interface TrashDoc extends NoteDoc {
  notebookId: string
  notebookTitle: string
  originalParentId: string | null
  deletedAt: string
}

export interface Notebook {
  id: string
  title: string
  docs: NoteDoc[]
}

export interface RecentView {
  docId: string
  notebookId: string
  viewedAt: string
}

export interface FavoriteDocItem {
  notebook: Notebook
  doc: NoteDoc
}

export interface AppStore {
  notebooks: Notebook[]
  trash: TrashDoc[]
  tags: Tag[]
  searchHistory: SearchHistory[]
  activeNotebookId?: string
  activeDocId?: string
}