import type { Notebook, TrashDoc, Tag, SearchHistory } from './notebook'

export interface AppStore {
  notebooks: Notebook[]
  trash: TrashDoc[]
  tags: Tag[]
  searchHistory: SearchHistory[]
  activeNotebookId?: string
  activeDocId?: string
}

declare global {
  interface Window {
    notesApi: {
      load: () => Promise<AppStore>
      save: (payload: AppStore) => Promise<AppStore>
      exportDoc: (payload: { title: string; content: string }) => Promise<boolean>
      exportNotebook: (payload: { title: string; docs: import('./notebook').NoteDoc[] }) => Promise<boolean>
      exportNotebookZip: (payload: { title: string; docs: import('./notebook').NoteDoc[] }) => Promise<boolean>
      saveImage: (payload: { name: string; data: string }) => Promise<string>
    }
  }
}