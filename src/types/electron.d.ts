import type {
  AppAction,
  AppInfoResult,
  AppSettings,
  AppSettingsResult,
  AppStore,
  BackupResult,
  CrashLogResult,
  FileAssociationState,
  ImportFilesResult,
  ImportKind,
  LoadStoreResult,
  MigrateDataDirResult,
  NoteDoc,
  PdfExportOptions,
  PrintResult,
  UpdateCheckResult,
} from './notebook'
import type {
  AiConfigPatch,
  AiConfigView,
  AiFailure,
  AiModelsResult,
  AiRequestPayload,
  AiResponse,
  AiStreamEvent,
  AiTestResult,
} from './ai'

/** 配置类通道：成功返回视图，失败返回信封 */
export type AiConfigResult = AiConfigView | AiFailure
/** 连通性测试：成功返回结果，失败返回信封 */
export type AiTestResultOrFailure = AiTestResult | AiFailure
/** 模型列表：成功返回结果，失败返回信封 */
export type AiModelsResultOrFailure = AiModelsResult | AiFailure
/** 批量：成功返回结果数组，失败返回信封 */
export type AiBatchResult = { ok: true; results: AiResponse[] } | AiFailure
/** 流式启动：成功返回 requestId，失败返回信封 */
export type AiStreamStartResult = { ok: true; requestId: string } | AiFailure
/** 取消：ok 表示调用本身成功，cancelled 表示确实取消到了一个在途请求 */
export type AiCancelResult = { ok: true; cancelled: boolean } | AiFailure

declare global {
  interface Window {
    notesApi: {
      /** 数据加载：失败返回信封（不抛错），由渲染层给出恢复引导 */
      load: () => Promise<LoadStoreResult>
      save: (payload: AppStore) => Promise<AppStore>
      exportDoc: (payload: { title: string; content: string }) => Promise<boolean>
      exportNotebook: (payload: { title: string; docs: NoteDoc[] }) => Promise<boolean>
      exportNotebookZip: (payload: { title: string; docs: NoteDoc[] }) => Promise<boolean>
      exportAll: (payload: AppStore) => Promise<boolean>
      exportHtml: (payload: { title: string; content: string }) => Promise<boolean>
      exportPdf: (payload: { title: string; content: string; options?: PdfExportOptions }) => Promise<boolean>
      /** 系统打印（C5）：信封返回，用户取消不算错误 */
      printDoc: (payload: { title: string; content: string }) => Promise<PrintResult>
      importMd: () => Promise<{ title: string; content: string }[] | null>
      /** P7：系统通知（窗口不在前台时才会真正弹出） */
      notify: (payload: { title: string; body?: string }) => Promise<{ ok: boolean; skipped?: boolean; error?: string }>
      /** P5：读取 .md 文件关联状态（仅 Windows） */
      fileAssociationGet: () => Promise<FileAssociationState>
      /** P5：开启 / 关闭 .md 文件关联（只写 HKCU，关闭时恢复原关联） */
      fileAssociationSet: (enabled: boolean) => Promise<FileAssociationState>
      /** O5：迁移数据目录（会复制数据，重启后生效） */
      migrateDataDir: () => Promise<MigrateDataDirResult>
      /** O5：重启应用 */
      relaunchApp: () => Promise<{ ok: boolean; error?: string }>
      /** 用系统浏览器打开 https 链接（只放行 https） */
      openExternal: (url: string) => Promise<{ ok: boolean; error?: string }>
      /** D5：读取本机崩溃记录 */
      crashLogGet: () => Promise<CrashLogResult>
      /** D5：清空崩溃记录 */
      crashLogClear: () => Promise<{ ok: boolean; error?: string }>
      /** D3：检查更新（只检查与提示，不静默安装） */
      checkUpdate: (payload?: { url?: string }) => Promise<UpdateCheckResult>
      /** P10：把最近文档推给主进程，用于任务栏跳转列表 */
      updateRecents: (docs: { id: string; title: string }[]) => Promise<{ ok: boolean }>
      /** 批量导入文件夹 / zip 包（O4） */
      importFiles: (payload: { kind: ImportKind }) => Promise<ImportFilesResult>
      importBackup: () => Promise<AppStore | null>
      /** 图片/附件落盘：成功返回 file:// URL，失败返回错误信封（不再用空串表达失败） */
      saveImage: (payload: { name: string; data: string }) => Promise<
        { ok: true; path: string } | { ok: false; error: string }
      >

      /* 本地备份（信封返回，不抛错） */
      backupList: () => Promise<BackupResult>
      restoreBackup: (payload: { name: string }) => Promise<
        { ok: true; restoredAt: string } | { ok: false; error: string }
      >
      onBackupCreated: (cb: (info: { at: string; name: string }) => void) => () => void

      /* 应用信息与数据目录（信封返回，不抛错） */
      appInfo: () => Promise<AppInfoResult>
      openDataDir: () => Promise<{ ok: true } | { ok: false; error: string }>

      /* 本机偏好设置（托盘 / 全局快捷键，信封返回） */
      appSettingsGet: () => Promise<AppSettingsResult>
      appSettingsSet: (patch: Partial<AppSettings>) => Promise<AppSettingsResult>
      /** 订阅主进程动作（托盘菜单 / 全局快捷键）；返回取消订阅函数 */
      onAppAction: (cb: (action: AppAction) => void) => () => void

      /* AI 能力 */
      aiConfigGet: () => Promise<AiConfigResult>
      aiConfigSet: (patch: AiConfigPatch) => Promise<AiConfigResult>
      aiConfigClear: () => Promise<AiConfigResult>
      aiConfigTest: (patch?: AiConfigPatch) => Promise<AiTestResultOrFailure>
      aiListModels: (patch?: AiConfigPatch) => Promise<AiModelsResultOrFailure>
      aiGenerate: (payload: AiRequestPayload & { bypassCache?: boolean }) => Promise<AiResponse>
      aiBatch: (payloads: AiRequestPayload[], options?: { bypassCache?: boolean }) => Promise<AiBatchResult>
      aiStreamStart: (payload: AiRequestPayload) => Promise<AiStreamStartResult>
      aiCancel: (requestId: string) => Promise<AiCancelResult>
      /** 注册流事件回调；返回取消订阅函数 */
      aiStreamSubscribe: (requestId: string, onEvent: (event: AiStreamEvent) => void) => () => void
      aiStreamUnsubscribe: (requestId: string) => void
    }
  }
}

export {}