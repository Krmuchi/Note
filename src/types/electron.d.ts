import type { AppStore, NoteDoc } from './notebook'

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
    }
  }
}

export {}