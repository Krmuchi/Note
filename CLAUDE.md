# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

笔记 (Notes) — A desktop note-taking application built with **React 19 + TypeScript + Vite + Electron 41**. Uses **Zustand 5 + immer** for state management and persists data via an Electron IPC bridge (`window.notesApi`). Supports knowledge bases → document trees → Markdown editing, plus search, tags, favorites, trash, version history, share links, and presentation mode.

## Commands

```bash
npm run dev          # Start dev server (Vite + Electron concurrently)
npm run dev:web      # Vite only (no Electron)
npm run typecheck    # tsc --noEmit
npm run build        # tsc -b + Vite production build (output to dist/)
npm run lint         # ESLint
npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright E2E (requires dev server on :5173)
npm run start        # Run built Electron app
```

## Architecture

### Entry & Shell
- `src/main.tsx` — App entry: lazy-loads `App.tsx` inside `ErrorBoundary` + `Suspense`
- `src/App.tsx` — Root component (~330 lines). Owns layout, panels wiring, keyboard shortcuts, auto-save/draft hooks; no per-view routing (see below)
- `src/components/app/MainContent.tsx` — Picks the active view (Start / QuickNote / Tags / Trash / Favorite / Notebooks)

### State Management (`src/store/`)
- Single Zustand store (`useNotesStore`) built from **slices** in `src/store/slices/`:
  - `coreSlice.ts` — notebooks/docs CRUD, trash, active ids, persistence (load/save)
  - `versionSlice.ts` — version restore helpers (`getDocVersions` / `restoreVersion`)
  - `shareSlice.ts` / `commentSlice.ts` / `tagSlice.ts` / `searchSlice.ts` / `undoRedoSlice.ts`
- **Auto version snapshots** are written inside `coreSlice.updateDoc` (30s merge window, max 50 versions) — `versionSlice.saveVersion` was removed as dead code; do NOT re-add a second writer
- Persistence via `window.notesApi.load()` / `.save()` (IPC `notes:load` / `notes:save`) — defined in `electron/main.cjs` + `electron/preload.cjs`
- ID generation: `newId()` in `src/store/storeUtils.ts`

### Type Definitions (`src/types/`)
- Core types: `NoteDoc`, `Notebook`, `Tag`, `TrashDoc`, `ShareLink`, `DocVersion`, `SearchResult`, etc.
- `AppStore` is defined in `src/types/notebook.ts`; `src/types/electron.d.ts` re-imports it and declares the global `window.notesApi`

### Component Structure (`src/components/`)
Panels are lazy-loaded in `MainContent.tsx` / `App.tsx` via `React.lazy` + `<LazyLoader>`:

| Component | Purpose |
|-----------|---------|
| `StartPage` | Landing page with recent views & quick actions (template center is internal) |
| `SharePanel` | Share link generation/management dialog |
| `TagPanel` | Tag management panel |
| `SearchPanel` | Full-text search with filters & suggestions |
| `VersionHistoryPanel` | Document version history browser |
| `EditorHeader` | Editor toolbar (splits into `EditorHeaderIcon` / `EditorHeaderColorPicker`) |
| `DocTree` | Document tree with drag-drop, context menu, virtualization |
| `Toast` / `Loading` / `Skeleton` | Common UI primitives |

### Utilities (`src/utils/`)
- `editorTextOps.ts` — Textarea manipulation helpers (wrap/insert/indent/align/clear formatting), extracted from `Editor.tsx`
- `autoSaveUtils.ts` — Draft save/load/clear to localStorage (crash recovery)
- `debounce.ts` — Debounce with `cancel()` / `flush()` (used by draft sync & search)
- `platform.ts` — `isMac` / `modKey` for platform-aware shortcut labels
- `clipboard.ts`, `sanitize.ts` (`escapeRegExp` only) — misc helpers

### Electron Layer (`electron/`)
- `main.cjs` — Main process: window creation (CSP headers, `will-navigate` guard, `setWindowOpenHandler` deny), IPC handlers with payload validation, JSON store write queue, throttled backups (1/min, keep 10)
- `preload.cjs` — Context bridge exposing a whitelisted `notesApi`

### Data Flow
1. User edits → `EditorContent` → `updateDocContent` → `coreSlice.updateDoc` (immer) → auto version snapshot + `updatedAt` bump
2. `useDraftSync` (800ms debounce) writes full snapshot to localStorage; `useAutoSave` (3s debounce) → `saveNotes()` → `window.notesApi.save()` → Electron writes `notes-data.json`
3. On load: `useAppInit` → `loadNotes()` → normalize missing fields → set state; draft recovery compares localStorage draft vs loaded data

### Key Patterns
- **No routing** — all views managed by `activeLeftMenu` / `activeView` state (UI state lives in `src/hooks/useUIState.ts`)
- **Document hierarchy** — `parentId` field enables tree structure; `DocTree` renders nested items
- **Undo/redo** — `undoRedoSlice` snapshot stacks (max 200, 1s merge window) via `src/hooks/useUndoRedo.ts`; global Ctrl+Z/Y wired in `App.tsx`, editor Ctrl+B/I handled in `EditorContent`
- **Version history** — auto `type: 'auto'` snapshots on content/title/tags change (30s merge, max 50)
- **Vite config** — `base: './'`, manual chunks: react-vendor / zustand / jszip / immer / vendor

## Conventions
- UI text is in Chinese (zh-CN)
- All dates use `toISOString()`; display via `toLocaleString('zh-CN')`
- No CSS framework — plain CSS in `src/App.css`, `src/index.css`, `src/styles/*.css`
- Keep IPC payloads validated in `main.cjs` (see `assertStorePayload` / `assertExportPayload`) — never trust the renderer
