# 桌面笔记

一个基于 Electron + React 的本地优先桌面笔记应用：知识库 → 文档树 → Markdown 编辑，支持搜索、标签、收藏、回收站、版本历史、分享链接与演示模式。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Electron 41（`contextIsolation` 开启，`nodeIntegration` 关闭） |
| UI | React 19 + TypeScript 6 + Vite 8 |
| 状态管理 | Zustand 5 + immer（分片 store：core / version / share / comment / tag / search / undoRedo） |
| 持久化 | Electron 主进程 JSON 文件（`userData/notes-data.json`）+ 渲染层 localStorage 草稿 |
| 测试 | Vitest（单元）+ Playwright（E2E） |

## 快速开始

```bash
# 安装依赖
npm install

# 开发（同时启动 Vite + Electron，HMR）
npm run dev

# 只跑 Web 版（浏览器 http://localhost:5173）
npm run dev:web

# 类型检查
npm run typecheck

# 单元测试
npm run test:unit

# E2E 测试（需先启动 dev server）
npm run test:e2e

# 生产构建（tsc + vite build，产物在 dist/）
npm run build

# 以 Electron 运行生产构建
npm run start
```

## 双运行模式

- **Electron 模式**：主进程通过 IPC（`notes:load` / `notes:save` 等）读写 `notes-data.json`，支持导出 Markdown / ZIP、粘贴图片落盘。渲染进程无 Node 权限，所有文件操作经 `preload.cjs` 暴露的白名单 API。
- **Web 模式**（`npm run dev:web` 或 `vite preview`）：无 IPC，数据落在 localStorage（草稿）与 IndexedDB 兼容层。

## 目录结构

```
electron/          # 主进程：窗口、IPC、存储、备份、CSP
src/
  app/ 组件入口       components/  UI 组件（editor / layout / search / tags / views ...）
  hooks/           业务 hooks（useAutoSave / useDraftSync / useUndoRedo / useKeyboard ...）
  store/slices/    Zustand 分片（core / version / share / comment / tag / search / undoRedo）
  services/        IPC / 存储封装
  shared/          主题、常量
  types/           NoteDoc / Notebook / TrashDoc / AppStore 等类型
  utils/           纯函数工具（debounce / editorTextOps / platform / clipboard ...）
tests/             Vitest 单测 + Playwright E2E
```

## 数据与安全

- 生产构建使用 `base: './'` 相对路径，适配 Electron `file://` 加载；`index.html` 含 meta CSP。
- 主进程对每个 IPC 通道做 payload 结构校验（类型、长度、大小上限），图片导出有扩展名白名单与路径穿越防护。
- `window.open` 新窗口被 `setWindowOpenHandler` 全部拒绝。
- 自动保存 3s 防抖 + 草稿 800ms 防抖 + 版本快照 30s 合并窗口（最多 50 个），备份文件节流为每分钟一次（最多保留 10 份）。
