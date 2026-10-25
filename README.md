# 桌面笔记

一个基于 Electron + React 的本地优先桌面笔记应用：知识库 → 文档树 → Markdown 编辑，支持搜索、标签、收藏、回收站、版本历史、分享链接与演示模式。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Electron 41（`contextIsolation` 开启，`nodeIntegration` 关闭） |
| UI | React 19 + TypeScript 6 + Vite 8 |
| 状态管理 | Zustand 5 + immer（10 个切片：core / version / share / comment / tag / search / undoRedo / quickNote / keyboard / tab） |
| 持久化 | Electron 主进程 JSON 文件（`userData/notes-data.json`）+ 渲染层 localStorage 草稿 |
| 测试 | Vitest（单元）+ Playwright（E2E） |

## 快速开始

```bash
# 安装依赖（必须用 pnpm：仓库用 pnpm 锁文件并依赖 pnpm patch，
# npm 不会应用 patches/ 下的补丁，装出来的依赖是错的）
pnpm install

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

# 生成应用图标（scripts/build-icons.cjs → build/icon.ico + build/icon.png）
npm run icons

# 打包：免安装目录（release/win-unpacked），用于快速验证打包是否正常
npm run dist:dir

# 打包：Windows 安装包（NSIS）+ 便携版，产物在 release/
npm run dist
```

## 质量门禁

四道门禁随时可以一条命令跑完：

```bash
# typecheck + lint + 单测 + build
pnpm verify

# 再加上 E2E（playwright 自带 webServer，无需手工起服务）
pnpm verify:all
```

CI 配置在 `.github/workflows/ci.yml`：每次 push 到 main 与每个 PR 都会跑同一套门禁，
E2E 失败时上传 playwright 报告作为 artifact。

## 发布流程

1. `pnpm verify:all` 全绿（本地跑一遍，别让 CI 替你发现）
2. 更新 `CHANGELOG.md`（把 `[Unreleased]` 收进新版本号）
3. `pnpm version <patch|minor|major>`（会创建版本提交与 tag；版本号遵循语义化版本）
4. `pnpm dist` 产出安装包与便携版，产物在 `release/`
5. 推送 tag 与分支；如需自动更新，把 `release/` 里的 `latest.yml` 与安装包一起上传到发布通道
6. 在发布说明里附上 `CHANGELOG` 对应段落

当前版本处于 `0.x`：允许破坏性变更，但同一 minor 内保持数据文件向后兼容。

## 打包与分发

打包配置在 `package.json` 的 `build` 字段（electron-builder），产物输出到 `release/`（已加入 .gitignore）。

| 命令 | 产物 | 用途 |
| --- | --- | --- |
| `npm run dist:dir` | `release/win-unpacked/` | 快速验证打包链路，不下载 NSIS 工具链 |
| `npm run dist` | `release/notes-<版本>-setup.exe`（NSIS 安装包）、`release/notes-<版本>-portable.exe`（便携版） | 分发 |

要点：

- **图标**：`build/icon.ico`（16/24/32/48/64/128/256 七个尺寸）与 `build/icon.png`（512×512）由 `scripts/build-icons.cjs` 纯代码生成，零额外依赖；换正式设计稿时替换 `build/icon.*` 或改脚本里的常量后重跑 `npm run icons`。
- **国内网络**：`dist` 脚本已内置 `ELECTRON_BUILDER_BINARIES_MIRROR`，`build.electronDownload.mirror` 指向 npmmirror 的 Electron 镜像；海外网络可直接删掉这两处。
- **依赖分类（重要）**：渲染层依赖（react / zustand / mermaid / katex / markdown 相关）全部放在 `devDependencies` —— 它们已经由 Vite 打进 `dist/`，若留在 `dependencies` 里会被 electron-builder 再整棵拷进 asar（实测 asar 从 7.3MB 涨到 152MB、安装包从 95MB 涨到 124MB）。`dependencies` 里**只保留 jszip**（主进程 `handlers-export` 的唯一运行时依赖）。新增运行时依赖前先确认主进程是否真的 require 它。
- **electronDist**：`build.electronDist` 指向 `node_modules/electron/dist`，直接复用本地已安装的 Electron 运行时：打包不再重复下载 120MB 运行时、离线可打包，且版本与 devDependencies 中声明的 Electron 完全一致。
- **上游补丁**：`patches/app-builder-lib@26.15.3.patch`（由 `pnpm-workspace.yaml` 的 `patchedDependencies` 生效）。原因：electron-builder 26.15.3 引用了 `@electron/get` 的 `ElectronDownloadCacheMode`，而该枚举在 `@electron/get@3` 中并不存在（上游依赖区间写错），导致任何需要下载的路径（Electron 运行时、NSIS/winCodeSign 工具链）都会抛 `TypeError: Cannot read properties of undefined`。补丁只是内联了等价枚举。升级 electron-builder 前请先确认该问题是否已修复，再决定是否删除补丁。
- **未配置**：代码签名（Windows SmartScreen 会提示「未知发布者」）、自动更新（`release/latest.yml` 已产出，接 electron-updater 即可；还需要一个发布通道）、macOS/Linux 目标（需在对应平台构建并准备 icns/appimage 资源）。

## 双运行模式

- **Electron 模式**：主进程通过 IPC（`notes:load` / `notes:save` 等）读写 `notes-data.json`，支持导出 Markdown / ZIP、粘贴图片落盘。渲染进程无 Node 权限，所有文件操作经 `preload.cjs` 暴露的白名单 API。
- **Web 模式**（`npm run dev:web` 或 `vite preview`）：无 IPC，数据落在 localStorage（草稿）与 IndexedDB 兼容层。

## 目录结构

```
electron/          # 主进程：窗口壳、CSP、托盘、菜单（handler 全部在 ipc/ 下）
  ipc/             #   handlers-storage / -export / -ai / -integration（均为依赖注入工厂，可单测）
src/
  components/      UI 组件（editor / layout / search / tags / views ...）
  hooks/           业务 hooks（useAutoSave / useDraftSync / useUndoRedo / useKeyboard / useUIState ...）
  store/           Zustand 单 store；slices/ 分片，docVersions.ts 是版本快照的唯一写入层
  services/        IPC / 存储封装、toast 发射器、AI 客户端
  shared/          主题、常量
  types/           NoteDoc / Notebook / TrashDoc / AppStore 等类型
  utils/           纯函数工具（debounce / editorTextOps / platform / clipboard ...）
tests/             Vitest 单测（含分层契约、样式装载契约）+ Playwright E2E
```

## 架构要点

几条**改代码前该知道**的约束（完整版见 `CLAUDE.md`）：

- **单一真相**：`activeDoc` 由 `selectActiveDoc(state)` 从 `notebooks + activeDocId` 派生，不是 state 字段；版本快照只能经 `store/docVersions.ts` 写入（上限与字节预算都在那里）。
- **分层方向**：`components → hooks → services/utils/types`。`tests/layering-contract.test.ts` 会拦住 hooks/utils/store/services 反向 import `@/components/*`。
- **UI 状态用外部 store**：`src/hooks/useUIState.ts`（`useUIState()` / `uiActions`）。视图开关不再逐层透传 props。
- **编辑器双内核**：富文本（默认）与 textarea 二选一，可在「设置 → 编辑器」即时切换；旧内核是 `React.lazy`，不进首屏。
- **Electron 安全基线**：`contextIsolation` + `sandbox` 开启、`nodeIntegration` 关、窗口打开与导航白名单、所有权限请求一律拒绝。`sandbox: true` 意味着 `preload.cjs` 只能 `require('electron')`。
- **富文本实机验收进门禁**：`pnpm verify:editor` 在真实 Chromium 里驱动编辑器（26 项交互 + 11 项无损），CI 单列一个 job 跑它。

## 数据与安全

- 生产构建使用 `base: './'` 相对路径，适配 Electron `file://` 加载；`index.html` 含 meta CSP。
- 主进程对每个 IPC 通道做 payload 结构校验（类型、长度、大小上限），图片导出有扩展名白名单与路径穿越防护。
- `window.open` 新窗口被 `setWindowOpenHandler` 全部拒绝。
- 自动保存 3s 防抖 + 草稿 800ms 防抖 + 版本快照 30s 合并窗口（最多 50 个），备份文件节流为每分钟一次（最多保留 10 份）。
