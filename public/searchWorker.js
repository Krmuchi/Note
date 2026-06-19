interface SearchMessage {
  type: 'search'
  searchText: string
  notebooks: Array<{
    id: string
    title: string
    docs: Array<{
      id: string
      title: string
      content: string
      tags: string[]
    }>
  }>
  options: { caseSensitive?: boolean }
}

interface SearchResult {
  docId: string
  notebookId: string
  titleMatch: boolean
  contentMatches: Array<{
    lineIndex: number
    content: string
  }>
  tagMatches: string[]
  score: number
}

self.onmessage = function (e: MessageEvent<SearchMessage>) {
  const { searchText, notebooks, options = {} } = e.data

  if (!searchText.trim()) {
    self.postMessage({ type: 'results', results: [] })
    return
  }

  const caseSensitive = options.caseSensitive || false
  const searchTerm = caseSensitive ? searchText : searchText.toLowerCase()
  const results: SearchResult[] = []

  for (const notebook of notebooks) {
    for (const doc of notebook.docs) {
      let score = 0
      const contentMatches: SearchResult['contentMatches'] = []
      const tagMatches: string[] = []

      const title = caseSensitive ? doc.title : doc.title.toLowerCase()
      if (title.includes(searchTerm)) {
        score += 100
      }

      const content = caseSensitive ? doc.content : doc.content.toLowerCase()
      if (content) {
        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(searchTerm)) {
            const termCount = (lines[i].match(new RegExp(searchTerm, 'g')) || []).length
            score += termCount * 10
            contentMatches.push({
              lineIndex: i,
              content: lines[i].length > 100 ? lines[i].substring(0, 100) + '...' : lines[i]
            })
          }
        }
      }

      if (doc.tags && Array.isArray(doc.tags)) {
        for (const tag of doc.tags) {
          const tagText = caseSensitive ? tag : tag.toLowerCase()
          if (tagText.includes(searchTerm)) {
            score += 50
            tagMatches.push(tag)
          }
        }
      }

      if (score > 0) {
        results.push({
          docId: doc.id,
          notebookId: notebook.id,
          titleMatch: title.includes(searchTerm),
          contentMatches,
          tagMatches,
          score
        })
      }
    }
  }

  results.sort((a, b) => b.score - a.score)
  self.postMessage({ type: 'results', results })
}