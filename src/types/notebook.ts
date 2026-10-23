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

/**
 * 评论锚点（划词评论）：记录评论对应的正文片段。
 *
 * 为什么同时存"区间"与"引用文本"：
 * - 区间（start/end）足以精确定位并跳转；
 * - 文档被编辑后区间会漂移，此时用引用文本在附近重新查找，
 *   能救回大部分被"挤歪"的锚点，而不是直接失效。
 */
export interface CommentAnchor {
  /** 选区起始字符偏移 */
  start: number
  /** 选区结束字符偏移 */
  end: number
  /** 选区原文（区间失效后的模糊重定位 + 界面展示） */
  quote: string
}

export interface Comment {
  id: string
  docId: string
  author: string
  content: string
  createdAt: string
  updatedAt?: string
  replies?: Comment[]
  /**
   * 划词锚点。可选：旧数据与"文档级评论"没有锚点，
   * 缺失时按文档级评论展示（与改造前行为一致）。
   */
  anchor?: CommentAnchor
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
  /**
   * 知识库图标（emoji）。可选：旧数据没有该字段，缺失时回退到默认的文件夹图标。
   * 用 emoji 而不是图片文件：无需管理图片资源与落盘路径，与项目的"零新增依赖"一致。
   */
  icon?: string
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
  /** 模板真实使用次数（模板 id → 次数），与内置模板 baseUsageCount 冷启动权重相加排序 */
  templateUsage?: Record<string, number>
  /**
   * 便签（小记）。
   *
   * 便签平时存在独立的 localStorage 键里（`notes-quick-notes`），
   * 不写进 notes-data.json —— 那是高频编辑的轻量数据，没必要跟着全量保存。
   * 但它**必须进入导出/备份**：否则用户点「导出全部」时以为带走了全部内容，
   * 实际丢掉了所有便签。导出时由 UI 层填入，导入时再写回 localStorage。
   */
  quickNotes?: QuickNoteData[]
}

/** 便签的数据形状（与 quickNoteSlice.QuickNote 一致；此处避免 types 反向依赖 store） */
export interface QuickNoteData {
  id: string
  content: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

/** 数据加载结果：主进程 notes:load 永不抛错，失败时返回信封而非异常 */
export type LoadStoreResult =
  | { ok: true; data: AppStore }
  | { ok: false; error: string }

/** 应用信息（版本与数据目录），供失败恢复引导与关于页使用 */
export interface AppInfo {
  version: string
  dataPath: string
  dataDir: string
  backupDir: string
}

export type AppInfoResult =
  | { ok: true; info: AppInfo }
  | { ok: false; error: string }

/** 主进程侧的本机偏好（<userData>/app-settings.json）：托盘行为、全局快捷键、平台集成 */
export interface AppSettings {
  /** 关闭窗口时最小化到托盘而不是退出 */
  closeToTray: boolean
  /** 启用全局速记快捷键（Ctrl+Alt+N 唤起便签） */
  globalQuickNote: boolean
  /** 开机自启（P9）；读取时以系统真实状态为准 */
  autoLaunch: boolean
  /** 窗口不在前台时用系统通知提醒（P7） */
  notifyWhenBackground: boolean
  /** 界面缩放（P8），0.75 ~ 2 */
  zoomFactor: number
}

/** 设置写入失败时会带回"当前实际生效的值"，便于界面回滚到真实状态 */
export type AppSettingsResult =
  | { ok: true; settings: AppSettings }
  | { ok: false; error: string; settings?: AppSettings }

/** 导出 PDF 的可配置项（C4）；取值需与 electron/ipc/export-options.cjs 保持一致 */
export type PdfPageSize = 'A4' | 'A3' | 'A5' | 'Letter'
export type PdfMarginPreset = 'narrow' | 'normal' | 'wide'

export interface PdfExportOptions {
  pageSize: PdfPageSize
  margin: PdfMarginPreset
  /** 页眉显示文档标题、页脚显示"第 x / y 页" */
  headerFooter: boolean
}

/** 批量导入结果（O4）：文件夹 / zip 包 */
export type ImportKind = 'folder' | 'zip'

export interface ImportedDoc {
  title: string
  content: string
  /** 导入时在源目录/压缩包里的相对路径（仅用于展示与排查） */
  sourcePath: string
}

export type ImportFilesResult =
  | { ok: true; docs: ImportedDoc[]; skipped: number; imageCount: number }
  | { ok: false; canceled?: boolean; error?: string }

/** .md 文件关联状态（P5，仅 Windows） */
export interface FileAssociationState {
  ok: boolean
  supported: boolean
  enabled: boolean
  previous?: string
  error?: string
}

/** 数据目录迁移结果（O5）：迁移后必须重启才生效 */
export type MigrateDataDirResult =
  | { ok: true; dataDir: string; copiedDataFile: boolean; copiedBackups: number }
  | { ok: false; canceled?: boolean; error?: string }

/** 崩溃记录（D5）：只存本机，由用户决定是否复制出去 */
export interface CrashEntry {
  type: 'main-uncaught' | 'main-rejection' | 'renderer-gone' | 'child-process-gone'
  at: string
  message: string
  stack: string
  appVersion: string
  platform: string
}

export interface CrashLogResult {
  ok: boolean
  entries?: CrashEntry[]
  latest?: CrashEntry | null
  summary?: string
  file?: string
  error?: string
}

/** 更新检查结果（D3）：只检查与提示，不静默安装 */
export interface UpdateCheckResult {
  ok: boolean
  current?: string
  hasUpdate?: boolean
  latest?: string
  url?: string
  notes?: string
  error?: string
}

/** 系统打印结果（C5）：取消不是错误 */
export type PrintResult =
  | { ok: true }
  | { ok: false; cancelled?: boolean; error?: string }

/** 主进程 → 渲染的动作（托盘菜单 / 全局快捷键 / 任务栏最近文档触发） */
export type AppActionType = 'quickNote' | 'quickOpen' | 'openDoc' | 'openFile' | 'openFileFailed'

export interface AppAction {
  /** openDoc 时带的目标文档 id（P10 任务栏最近文档） */
  docId?: string
  /** openFile 时的文件内容与来源路径（P5 双击 .md） */
  title?: string
  content?: string
  sourcePath?: string
  /** openFileFailed 时的原因 */
  reason?: string
  type: AppActionType
}

/** 本地备份文件描述（userData/backups/*.json） */
export interface BackupInfo {
  name: string
  size: number
  createdAt: string
  /** 常规自动备份；false 表示"恢复前自动留存的快照" */
  auto: boolean
}

/** 备份相关通道统一信封 */
export type BackupResult =
  | { ok: true; backups: BackupInfo[] }
  | { ok: false; error: string }