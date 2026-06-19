import type { NoteDoc, Notebook } from '@/types'

export interface SearchResult {
  docId: string
  notebookId: string
  titleMatch: boolean
  contentMatches: Array<{ lineIndex: number; content: string; highlighted: string; offset: number }>
  tagMatches: string[]
  score: number
  snippet: string
}

const tokenizeChinese = (text: string): string[] => {
  const tokens: string[] = []
  let currentToken = ''
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    
    if (/[\u4e00-\u9fff]/.test(char)) {
      if (currentToken) {
        tokens.push(currentToken)
        currentToken = ''
      }
      tokens.push(char)
    } else if (/[a-zA-Z0-9]/.test(char)) {
      currentToken += char
    } else {
      if (currentToken) {
        tokens.push(currentToken)
        currentToken = ''
      }
    }
  }
  
  if (currentToken) {
    tokens.push(currentToken)
  }
  
  return tokens.filter(token => token.trim() !== '')
}

export const performAdvancedFullTextSearch = (
  searchText: string, 
  notebooks: Notebook[], 
  options: { 
    caseSensitive?: boolean
    fuzzy?: boolean
    includeSnippets?: boolean
    snippetLength?: number
  } = {}
): SearchResult[] => {
  if (!searchText.trim()) return []

  const { 
    caseSensitive = false, 
    fuzzy = false,
    includeSnippets = true,
    snippetLength = 100
  } = options
  
  const searchTerms = fuzzy 
    ? tokenizeChinese(caseSensitive ? searchText : searchText.toLowerCase())
    : [caseSensitive ? searchText : searchText.toLowerCase()]
    
  const results: SearchResult[] = []

  notebooks.forEach(notebook => {
    notebook.docs.forEach((doc: NoteDoc) => {
      let score = 0
      let allContentMatches: Array<{ lineIndex: number; content: string; highlighted: string; offset: number }> = []
      const tagMatches: string[] = []
      let titleMatch = false

      const title = caseSensitive ? doc.title : doc.title.toLowerCase()
      searchTerms.forEach(term => {
        if (title.includes(term)) {
          score += 100
          titleMatch = true
        }
      })

      const content = caseSensitive ? doc.content : doc.content.toLowerCase()
      if (content) {
        const lines = content.split('\n')
        lines.forEach((line: string, index: number) => {
          let lineScore = 0
          const matches: Array<{ lineIndex: number; content: string; highlighted: string; offset: number }> = []
          
          searchTerms.forEach(term => {
            let searchStart = 0
            let matchIndex
            
            while ((matchIndex = line.indexOf(term, searchStart)) !== -1) {
              lineScore += term.length * 10
              
              const highlightPattern = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, caseSensitive ? 'g' : 'gi')
              const highlighted = caseSensitive 
                ? line 
                : line.replace(highlightPattern, '<mark>$1</mark>')
                
              matches.push({
                lineIndex: index,
                content: line.length > snippetLength ? line.substring(0, snippetLength) + '...' : line,
                highlighted,
                offset: matchIndex
              })
              
              searchStart = matchIndex + term.length
            }
          })
          
          if (lineScore > 0) {
            score += lineScore
            allContentMatches = [...allContentMatches, ...matches]
          }
        })
      }

      if (doc.tags && Array.isArray(doc.tags)) {
        doc.tags.forEach((tag: string) => {
          const tagText = caseSensitive ? tag : tag.toLowerCase()
          searchTerms.forEach(term => {
            if (tagText.includes(term)) {
              score += 50
              if (!tagMatches.includes(tag)) {
                tagMatches.push(tag)
              }
            }
          })
        })
      }

      if (score > 0) {
        const snippet = includeSnippets && allContentMatches.length > 0
          ? allContentMatches[0].content
          : ''

        results.push({
          docId: doc.id,
          notebookId: notebook.id,
          titleMatch,
          contentMatches: allContentMatches,
          tagMatches,
          score,
          snippet
        })
      }
    })
  })

  return results.sort((a, b) => b.score - a.score)
}

export const getSuggestions = (
  searchText: string,
  notebooks: Notebook[],
  maxSuggestions: number = 5
): string[] => {
  if (!searchText.trim()) return []
  
  const suggestions: string[] = []
  const lowerSearchText = searchText.toLowerCase()
  
  notebooks.forEach(notebook => {
    notebook.docs.forEach((doc: NoteDoc) => {
      if (doc.title.toLowerCase().includes(lowerSearchText) && 
          !suggestions.includes(doc.title) && 
          doc.title.toLowerCase() !== lowerSearchText) {
        suggestions.push(doc.title)
      }
      
      if (doc.tags && Array.isArray(doc.tags)) {
        doc.tags.forEach((tag: string) => {
          if (tag.toLowerCase().includes(lowerSearchText) && 
              !suggestions.includes(tag)) {
            suggestions.push(tag)
          }
        })
      }
    })
  })
  
  return suggestions.slice(0, maxSuggestions)
}