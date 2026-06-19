import { useMemo } from 'react'
import { useNotesStore } from '@/store'
import type { Notebook, NoteDoc, FavoriteDocItem } from '@/types'

export const useFavoriteDocs = (): FavoriteDocItem[] => {
  const notebooks = useNotesStore(state => state.notebooks)

  return useMemo(() => {
    const favorites: FavoriteDocItem[] = []
    notebooks.forEach((notebook: Notebook) => {
      notebook.docs.forEach((doc: NoteDoc) => {
        if (doc.favorite) {
          favorites.push({ notebook, doc })
        }
      })
    })
    return favorites.sort(
      (a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime()
    )
  }, [notebooks])
}