# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

笔记 (Notes) — A desktop note-taking application built with **React 19 + TypeScript + Vite + Electron**. Uses **Zustand** for state management and persists data via an Electron IPC bridge (`window.notesApi`).

## Commands

```bash
npm run dev          # Start dev server (Vite + Electron concurrently)
npm run dev:web      # Vite only (no Electron)
npm run build        # TypeScript check + Vite production build
npm run lint         # ESLint
npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright E2E tests
npm run start        # Run built Electron app
```

## Architecture

### Entry & Shell
- `src/main.tsx` — App entry: lazy-loads `App.tsx` inside `ErrorBoundary` + `Suspense`
- `src/App.tsx` — Root component (~1700 lines). Contains the full layout (sidebar nav, editor panel, context menus, panels) and most business logic including undo/redo history, auto-save, draft recovery, and keyboard shortcuts

### State Management (`src/store/notesStore.ts`)
- Single Zustand store (`useNotesStore`) holds all state: notebooks, trash, tags, searchHistory, activeNotebookId/DocId
- All CRUD operations live here (notebooks, docs, tags, share links, versions, search)
- Persistence via `window.notesApi.load()` / `.save()` — defined in `electron/preload.cjs`
- ID generation: `${Date.now()}-${random hex}` via internal `newId()`

### Type Definitions (`src/types.d.ts`)
- Core types: `NoteDoc`, `Notebook`, `Tag`, `TrashDoc`, `ShareLink`, `DocVersion`, `SearchResult`, etc.
- Global `window.notesApi` declaration for Electron IPC bridge

### Component Structure (`src/components/`)
All panel/dialog components are **lazy-loaded** in `App.tsx` via `React.lazy` + `<LazyLoader>` wrapper:

| Component | Purpose |
|-----------|---------|
| `StartPage` | Landing page with recent views & quick actions |
| `SharePanel` | Share link generation/management dialog |
| `TagPanel` | Tag management sidebar |
| `DocTagSelector` | Tag assignment for current document |
| `SearchPanel` | Full-text search with filters & suggestions |
| `VersionHistoryPanel` | Document version history browser |
| `Toast` | Toast notification system |
| `Loading` | Spinner/loading indicator |
| `VirtualScroll`, `PaginatedContent`, `LazyImage`, `LazyLoadingExamples` | Performance utilities |

### Utilities (`src/utils/`)
- `editorUtils.ts` — Textarea manipulation helpers (insert wrapped text, headings, links, images, code blocks)
- `autoSaveUtils.ts` — Draft save/load/clear to localStorage (crash recovery)
- `searchUtils.ts` / `advancedSearchUtils.ts` — Search logic

### Electron Layer (`electron/`)
- `main.cjs` — Electron main process
- `preload.cjs` — Context bridge exposing `notesApi` to renderer

### Data Flow
1. User edits → `updateDocContent()` in App.tsx → Zustand store mutation → 2s debounce auto-save → `saveNotes()` → `window.notesApi.save()` → Electron writes to disk
2. On load: `loadNotes()` → `window.notesApi.load()` → normalize missing fields → set state
3. Draft recovery: on mount, compare localStorage draft vs loaded data; prompt user if divergent

### Key Patterns
- **No routing** — all views managed by `activeLeftMenu` / `activeView` state strings
- **Document hierarchy** — `parentId` field enables tree structure; `docDepthMap` computes indentation
- **Undo/redo** — client-side snapshot stack (max 200 entries, 1s merge window) in App.tsx, not in store
- **Version history** — auto-created on every `updateDoc()` call (max 50 versions per doc)
- **Vite config** — manual chunks split react-vendor, zustand, marked, dompurify, jszip

## Conventions
- UI text is in Chinese (zh-CN)
- All dates use `toISOString()` format; display via `toLocaleString('zh-CN')`
- No CSS framework — plain CSS in `App.css` / `index.css`
