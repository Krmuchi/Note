export interface Tag {
  id: string
  name: string
  color: string
  icon: string
  parentId: string | null
  children?: Tag[]
  description?: string
  usageCount: number
  createdAt: string
  updatedAt: string
}

export interface TagStats {
  totalCount: number
  usedCount: number
  unusedCount: number
  topTags: { tag: Tag; count: number }[]
  tagDistribution: { category: string; count: number }[]
}