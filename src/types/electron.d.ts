import type { AppStore, NoteDoc } from './notebook'
import type {
  AiConfigPatch,
  AiConfigView,
  AiFailure,
  AiRequestPayload,
  AiResponse,
  AiStreamEvent,
  AiTestResult,
} from './ai'

/** 配置类通道：成功返回视图，失败返回信封 */
export type AiConfigResult = AiConfigView | AiFailure
/** 连通性测试：成功返回结果，失败返回信封 */
export type AiTestResultOrFailure = AiTestResult | AiFailure
/** 批量：成功返回结果数组，失败返回信封 */
export type AiBatchResult = { ok: true; results: AiResponse[] } | AiFailure
/** 流式启动：成功返回 requestId，失败返回信封 */
export type AiStreamStartResult = { ok: true; requestId: string } | AiFailure
/** 取消：ok 表示调用本身成功，cancelled 表示确实取消到了一个在途请求 */
export type AiCancelResult = { ok: true; cancelled: boolean } | AiFailure

declare global {
  interface Window {
    notesApi: {
      load: () => Promise<AppStore>
      save: (payload: AppStore) => Promise<AppStore>
      exportDoc: (payload: { title: string; content: string }) => Promise<boolean>
      exportNotebook: (payload: { title: string; docs: NoteDoc[] }) => Promise<boolean>
      exportNotebookZip: (payload: { title: string; docs: NoteDoc[] }) => Promise<boolean>
      exportAll: (payload: AppStore) => Promise<boolean>
      exportHtml: (payload: { title: string; content: string }) => Promise<boolean>
      exportPdf: (payload: { title: string; content: string }) => Promise<boolean>
      importMd: () => Promise<{ title: string; content: string }[] | null>
      importBackup: () => Promise<AppStore | null>
      saveImage: (payload: { name: string; data: string }) => Promise<string>

      /* AI 能力 */
      aiConfigGet: () => Promise<AiConfigResult>
      aiConfigSet: (patch: AiConfigPatch) => Promise<AiConfigResult>
      aiConfigClear: () => Promise<AiConfigResult>
      aiConfigTest: (patch?: AiConfigPatch) => Promise<AiTestResultOrFailure>
      aiGenerate: (payload: AiRequestPayload & { bypassCache?: boolean }) => Promise<AiResponse>
      aiBatch: (payloads: AiRequestPayload[]) => Promise<AiBatchResult>
      aiStreamStart: (payload: AiRequestPayload) => Promise<AiStreamStartResult>
      aiCancel: (requestId: string) => Promise<AiCancelResult>
      /** 注册流事件回调；返回取消订阅函数 */
      aiStreamSubscribe: (requestId: string, onEvent: (event: AiStreamEvent) => void) => () => void
      aiStreamUnsubscribe: (requestId: string) => void
    }
  }
}

export {}