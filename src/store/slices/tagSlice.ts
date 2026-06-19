import type { StateCreator } from 'zustand'
import type { Tag, TagStats } from '@/types'
import type { NotesStore } from '@/store/types'
import { TAG_DEFAULT_COLORS } from '@/shared/constants'
import { newId } from '@/store/storeUtils'

export interface TagSlice {
  tags: Tag[]
  createTag: (name: string, color?: string, icon?: string, parentId?: string | null) => void
  updateTag: (id: string, updates: Partial<Tag>) => void
  deleteTag: (id: string) => void
  addTagToDoc: (notebookId: string, docId: string, tagId: string) => void
  removeTagFromDoc: (notebookId: string, docId: string, tagId: string) => void
  updateTagUsageCounts: () => void
  getTagStats: () => TagStats
  getRecommendedTags: (docContent: string, limit?: number) => Tag[]
  batchUpdateTags: (tagIds: string[], updates: Partial<Tag>) => void
  getTagsWithHierarchy: () => Tag[]
}

type TagSliceCreator = StateCreator<
  NotesStore,
  [['zustand/immer', never]],
  [],
  TagSlice
>

export const createTagSlice: TagSliceCreator = (set, get) => ({
  tags: [],

  createTag: (name, color = TAG_DEFAULT_COLORS[0], icon = '🏷️', parentId = null) => {
    const newTag: Tag = {
      id: newId(),
      name,
      color,
      icon,
      parentId,
      usageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    set((state) => {
      state.tags.push(newTag)
    })
  },

  updateTag: (id, updates) => {
    set((state) => {
      const tag = state.tags.find(t => t.id === id)
      if (tag) {
        Object.assign(tag, updates, { updatedAt: new Date().toISOString() })
      }
    })
  },

  deleteTag: (id) => {
    set((state) => {
      state.tags = state.tags.filter(tag => tag.id !== id)
      state.notebooks.forEach(nb => {
        nb.docs.forEach(doc => {
          doc.tags = doc.tags.filter(tagId => tagId !== id)
        })
      })
    })
  },

  addTagToDoc: (notebookId, docId, tagId) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc && !doc.tags.includes(tagId)) {
        doc.tags.push(tagId)
      }

      const tag = state.tags.find(t => t.id === tagId)
      if (tag) tag.usageCount++
    })
  },

  removeTagFromDoc: (notebookId, docId, tagId) => {
    set((state) => {
      const notebook = state.notebooks.find(nb => nb.id === notebookId)
      const doc = notebook?.docs.find(d => d.id === docId)
      if (doc) {
        doc.tags = doc.tags.filter(id => id !== tagId)
      }

      const tag = state.tags.find(t => t.id === tagId)
      if (tag) tag.usageCount = Math.max(0, tag.usageCount - 1)
    })
  },

  updateTagUsageCounts: () => {
    set((state) => {
      const usageMap: Record<string, number> = {}
      state.tags.forEach(tag => {
        usageMap[tag.id] = 0
      })

      state.notebooks.forEach(nb => {
        nb.docs.forEach(doc => {
          doc.tags.forEach(tagId => {
            if (usageMap[tagId] !== undefined) {
              usageMap[tagId]++
            }
          })
        })
      })

      state.tags.forEach(tag => {
        tag.usageCount = usageMap[tag.id] || 0
      })
    })
  },

  getTagStats: () => {
    const { notebooks, tags } = get()

    const usageMap: Record<string, number> = {}
    notebooks.forEach(nb => {
      nb.docs.forEach(doc => {
        doc.tags.forEach(tagId => {
          usageMap[tagId] = (usageMap[tagId] || 0) + 1
        })
      })
    })

    const usedCount = tags.filter(tag => usageMap[tag.id] > 0).length
    const unusedCount = tags.filter(tag => usageMap[tag.id] === 0).length

    const topTags = tags
      .map(tag => ({ tag, count: usageMap[tag.id] || 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const tagDistribution = [
      { category: '高频标签', count: tags.filter(t => usageMap[t.id] >= 10).length },
      { category: '中频标签', count: tags.filter(t => usageMap[t.id] > 2 && usageMap[t.id] < 10).length },
      { category: '低频标签', count: tags.filter(t => usageMap[t.id] > 0 && usageMap[t.id] <= 2).length },
      { category: '未使用', count: unusedCount },
    ]

    return {
      totalCount: tags.length,
      usedCount,
      unusedCount,
      topTags,
      tagDistribution,
    }
  },

  getRecommendedTags: (docContent, limit = 5) => {
    const { tags } = get()
    const contentWords = docContent.toLowerCase().split(/\s+/)

    const scoreMap: Record<string, number> = {}
    tags.forEach(tag => {
      const tagWords = tag.name.toLowerCase().split(/\s+/)
      let score = 0
      tagWords.forEach(word => {
        if (contentWords.includes(word)) {
          score += 1
        }
      })
      if (tag.description) {
        const descWords = tag.description.toLowerCase().split(/\s+/)
        descWords.forEach(word => {
          if (contentWords.includes(word)) {
            score += 0.5
          }
        })
      }
      if (score > 0) {
        scoreMap[tag.id] = score
      }
    })

    return tags
      .filter(tag => scoreMap[tag.id] !== undefined)
      .sort((a, b) => (scoreMap[b.id] || 0) - (scoreMap[a.id] || 0))
      .slice(0, limit)
  },

  batchUpdateTags: (tagIds, updates) => {
    set((state) => {
      state.tags.forEach(tag => {
        if (tagIds.includes(tag.id)) {
          Object.assign(tag, updates, { updatedAt: new Date().toISOString() })
        }
      })
    })
  },

  getTagsWithHierarchy: () => {
    const { tags } = get()
    const tagMap = new Map(tags.map(tag => [tag.id, { ...tag, children: [] as Tag[] }]))
    const rootTags: Tag[] = []

    tags.forEach(tag => {
      const mappedTag = tagMap.get(tag.id)!
      if (tag.parentId && tagMap.has(tag.parentId)) {
        tagMap.get(tag.parentId)!.children = tagMap.get(tag.parentId)!.children || []
        tagMap.get(tag.parentId)!.children!.push(mappedTag)
      } else {
        rootTags.push(mappedTag)
      }
    })

    return rootTags
  },
})