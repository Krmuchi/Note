import type { Notebook, NoteDoc } from '../types';

interface SearchIndex {
  [key: string]: Array<{ notebookId: string; docId: string; score: number }>;
}

class FullTextSearch {
  private index: SearchIndex = {};
  private docCache = new Map<string, { notebookId: string; doc: NoteDoc }>();

  buildIndex(notebooks: Notebook[]) {
    this.index = {};
    this.docCache.clear();

    notebooks.forEach(notebook => {
      notebook.docs.forEach(doc => {
        const docKey = `${notebook.id}-${doc.id}`;
        this.docCache.set(docKey, { notebookId: notebook.id, doc });

        const text = `${doc.title} ${doc.content || ''}`.toLowerCase();
        const words = this.tokenize(text);
        
        words.forEach(word => {
          if (!this.index[word]) {
            this.index[word] = [];
          }
          this.index[word].push({
            notebookId: notebook.id,
            docId: doc.id,
            score: this.calculateScore(word, text),
          });
        });
      });
    });
  }

  private tokenize(text: string): string[] {
    return text.split(/\W+/).filter(word => word.length > 2);
  }

  private calculateScore(word: string, text: string): number {
    const occurrences = (text.match(new RegExp(word, 'g')) || []).length;
    const position = text.indexOf(word);
    return occurrences * (1 - position / text.length);
  }

  search(query: string): Array<{ notebookId: string; docId: string; score: number }> {
    const words = this.tokenize(query.toLowerCase());
    if (words.length === 0) return [];

    const results = new Map<string, number>();

    words.forEach(word => {
      if (this.index[word]) {
        this.index[word].forEach(entry => {
          const key = `${entry.notebookId}-${entry.docId}`;
          results.set(key, (results.get(key) || 0) + entry.score);
        });
      }
    });

    return Array.from(results.entries())
      .map(([key, score]) => {
        const [notebookId, docId] = key.split('-');
        return { notebookId, docId, score };
      })
      .sort((a, b) => b.score - a.score);
  }

  getDoc(docKey: string): { notebookId: string; doc: NoteDoc } | undefined {
    return this.docCache.get(docKey);
  }
}

export const searchIndex = new FullTextSearch();