import { describe, it, expect } from 'vitest'
import { performAdvancedFullTextSearch } from '@/utils/advancedSearchUtils'
import type { Notebook } from '@/types'

const mockNotebooks: Notebook[] = [
  {
    id: 'nb1',
    title: 'Test Notebook',
    docs: [
      {
        id: 'doc1',
        title: 'Hello World',
        content: 'This is a test document about programming',
        parentId: null,
        tags: ['tag1'],
        favorite: false,
        pinned: false,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      },
      {
        id: 'doc2',
        title: 'JavaScript Guide',
        content: 'Learn JavaScript programming language',
        parentId: null,
        tags: ['tag2'],
        favorite: false,
        pinned: false,
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z'
      }
    ]
  }
]

describe('performAdvancedFullTextSearch', () => {
  it('should find documents by title', () => {
    const results = performAdvancedFullTextSearch('Hello', mockNotebooks)
    expect(results).toHaveLength(1)
    expect(results[0].docId).toBe('doc1')
  })

  it('should find documents by content', () => {
    const results = performAdvancedFullTextSearch('programming', mockNotebooks)
    expect(results.length).toBeGreaterThanOrEqual(1)
  })

  it('should return empty results for non-matching query', () => {
    const results = performAdvancedFullTextSearch('xyz123', mockNotebooks)
    expect(results).toHaveLength(0)
  })

  it('should handle empty query', () => {
    const results = performAdvancedFullTextSearch('', mockNotebooks)
    expect(results).toHaveLength(0)
  })
})