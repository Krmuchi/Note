# 拾页（PickPage）

[![CI](https://github.com/Krmuch/Note/actions/workflows/ci.yml/badge.svg)](https://github.com/Krmuch/Note/actions/workflows/ci.yml)

<p align="center">
  <img src="build/icon.png" alt="拾页（PickPage）应用图标" width="220">
</p>

> 本地优先的桌面笔记应用 —— 知识库 → 文档树 → Markdown 编辑。
> Electron + React 打造，数据全部落在本地，开箱即用。

## 功能特性

**写作与编辑**

- **双内核 Markdown 编辑器**：富文本内核（默认，所见即所得：斜杠命令、块级手柄、浮动工具栏）与传统 textarea 内核，在「设置 → 编辑器」即时切换
- **多标签页**：像浏览器一样同时打开多篇文档（`Ctrl+W` 关闭、`Ctrl+Tab` 切换、`Ctrl+Shift+T` 重开）
- **文档大纲**：标题结构一目了然，点击跳转、滚动跟随高亮
- **文档内查找替换**：命中位置边栏标记，替换后选区不丢
- **评论**：选中文字锚定批注，文档改动后自动重新定位
- **模板中心**：内置模板快速成文，支持自定义模板
- **小记**：随手速记，随备份一起迁移

**组织与检索**

- **知识库 → 文档树**：拖拽排序/移动、多选批量操作（打标签、导出、收藏、置顶、删除）
- **全局搜索**：支持中文拼音搜索、标签名、日期边界过滤
- **标签 / 收藏 / 最近**：多视角快速回到内容
- **回收站**：删除可恢复，支持批量恢复/清空
- **版本历史**：自动快照 + 手动快照，任意版本预览与恢复

**呈现与分享**

- **演示模式**：一键把文档变成幻灯片放映（含演讲计时）
- **分享链接**：生成本地分享页，管理已分享文档
- **导入 / 导出**：Markdown、HTML、PDF、打印、ZIP 打包、整库备份与恢复（含小记）
- **AI 写作**：「AI 帮你写」与「AI 处理选中文本」（润色 / 改写 / 扩写 / 总结），可配任意 OpenAI 兼容服务

**个性化**

- 8 套主题（亮色 / 暗色 / 护眼绿 / 暖色 / 深邃蓝 / 暗夜紫 / 暗夜绿 / 跟随系统）+ 自定义主色
- 7 种字体（含霞鹜文楷、思源宋黑）
- 快捷键自定义、快速打开（Quick Open）
- 崩溃安全：草稿实时快照，异常退出后可恢复

## 快速开始

```bash
# 安装依赖（必须用 pnpm：仓库用 pnpm 锁文件并依赖 pnpm patch，
# npm 不会应用 patches/ 下的补丁，装出来的依赖是错的）
pnpm install

# 开发（同时启动 Vite + Electron，HMR）
npm run dev

# 只跑 Web 版（浏览器 http://localhost:5173）
npm run dev:web

# 以 Electron 运行生产构建
npm run start
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式（Vite + Electron，HMR） |
| `npm run dev:web` | 仅 Web 版（浏览器调试） |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run lint` | ESLint |
| `npm run test:unit` | Vitest 单元测试 |
| `npm run test:e2e` | Playwright E2E（需 dev server 在 :5173） |
| `npm run build` | 生产构建（tsc + vite，产物 `dist/`） |
| `npm run icons` | 重新生成应用图标（`scripts/build-icons.cjs`） |
| `npm run dist:dir` | 打包免安装目录（快速验证打包链路） |
| `npm run dist` | 打包 Windows 安装包 + 便携版（`release/`） |

## 质量门禁

```bash
# typecheck + lint + 单测 + build（CI 跑同一套）
pnpm verify

# 富文本内核实机验收：真实 Chromium 驱动 37 项交互断言
pnpm verify:editor

# 全量：门禁 + 实机 + E2E（playwright 自带 webServer，无需手工起服务）
pnpm verify:all
```

CI 配置在 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)：push 到 main 与每个 PR 都会跑门禁，
E2E 失败时上传 playwright 报告作为 artifact。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 桌面壳 | Electron 41（`contextIsolation` + `sandbox` 开启，`nodeIntegration` 关闭） |
| UI | React 19 + TypeScript + Vite 8 |
| 状态管理 | Zustand 5 + immer（10 个切片：core / version / share / comment / tag / search / undoRedo / quickNote / keyboard / tab） |
| 持久化 | Electron 主进程 JSON（`userData/notes-data.json`）+ 渲染层 localStorage 草稿 |
| 测试 | Vitest（单元）+ Playwright（E2E）+ 实机脚本（富文本 37 项） |

## 双运行模式

- **Electron 模式**：主进程通过 IPC（`notes:load` / `notes:save` 等）读写 `notes-data.json`，
  支持导出、备份、粘贴图片落盘。渲染进程无 Node 权限，所有文件操作走 `preload.cjs` 暴露的白名单 API。
- **Web 模式**（`npm run dev:web`）：无 IPC，数据走浏览器本地存储，便于纯前端调试与演示。

## 目录结构

```
electron/          # 主进程：窗口壳、CSP、托盘、菜单（handler 全部在 ipc/ 下）
  ipc/             #   handlers-storage / -export / -ai / -integration（依赖注入工厂，可单测）
  ai/              #   AI 主进程代理：prompt 模板 / SSE 解析 / 重试 / 并发（零新增依赖）
src/
  components/      UI 组件（editor / layout / search / tags / views ...）
  hooks/           业务 hooks（useAutoSave / useDraftSync / useUndoRedo / useKeyboard / useUIState ...）
  store/           Zustand 单 store；slices/ 分片，docVersions.ts 是版本快照的唯一写入层
  services/        IPC / 存储封装、toast 发射器、AI 客户端
  shared/          主题、常量
  types/           NoteDoc / Notebook / TrashDoc / AppStore 等类型
  utils/           纯函数工具（debounce / editorTextOps / domOffset / markdownFormat ...）
tests/             Vitest 单测（含分层契约、样式装载契约）+ Playwright E2E
docs/              功能清单、AI 集成文档、富文本内核说明等
```

## 架构要点

几条**改代码前该知道**的约束（完整版见 [`CLAUDE.md`](CLAUDE.md)）：

- **单一真相**：`activeDoc` 由 `selectActiveDoc(state)` 派生，不是 state 字段；版本快照只能经
  `store/docVersions.ts` 写入（数量上限与字节预算都在那里）。
- **分层方向**：`components → hooks → services/utils/types`，`tests/layering-contract.test.ts` 会拦住反向 import。
- **UI 状态用外部 store**：`src/hooks/useUIState.ts`（`useUIState()` / `uiActions`），不逐层透传 props。
- **编辑器双内核**：富文本与 textarea 二选一，`richEditorFlag` 控制；凡读 `selectionStart` 的功能都要有富文本分支。
- **Electron 安全基线**：窗口打开与导航白名单、所有权限请求一律拒绝、IPC payload 全量校验。
  `sandbox: true` 意味着 `preload.cjs` 只能 `require('electron')`。
- **CSS 部分懒加载**：面板专属样式由懒加载组件自己 import（`tests/style-loading-contract.test.ts` 双向把关）。
- **AI 全部走主进程代理**：生产 CSP 不放行外网，渲染层永不直连 API（详见 [`docs/AI-集成文档.md`](docs/AI-集成文档.md)）。

## 打包与分发

打包配置在 `package.json` 的 `build` 字段（electron-builder），产物输出到 `release/`（已 gitignore）。

| 命令 | 产物 | 用途 |
| --- | --- | --- |
| `npm run dist:dir` | `release/win-unpacked/` | 快速验证打包链路，不下载 NSIS 工具链 |
| `npm run dist` | `notes-<版本>-setup.exe`（NSIS）、`notes-<版本>-portable.exe`（便携版） | 分发 |

要点（都是踩过坑的）：

- **依赖分类（重要）**：渲染层依赖全部放 `devDependencies` —— 已由 Vite 打进 `dist/`，
  留在 `dependencies` 会被整棵拷进 asar（实测 7.3MB → 152MB）。`dependencies` **只保留 jszip**。
- **electronDist**：指向 `node_modules/electron/dist`，复用本地 Electron 运行时：不重复下载 120MB、离线可打包。
- **上游补丁**：`patches/app-builder-lib@26.15.3.patch`（由 `pnpm-workspace.yaml` 的 `patchedDependencies` 生效），
  修复 electron-builder 26.15.3 对 `@electron/get@3` 不存在枚举的引用。升级 electron-builder 前先确认上游是否已修复。
- **国内网络**：`dist` 脚本内置 npmmirror 的 electron-builder 二进制镜像，`build.electronDownload.mirror` 指向
  npmmirror 的 Electron 镜像；海外网络删掉这两处即可。
- **图标**：`build/icon.*` 由 `scripts/build-icons.cjs` 纯代码生成；换设计稿替换文件或改脚本常量后重跑 `npm run icons`。
- **未配置**：代码签名（SmartScreen 会提示未知发布者）、自动更新（`latest.yml` 已产出，接 electron-updater 即可）、
  macOS/Linux 目标。

## 数据与安全

- 生产构建使用 `base: './'` 相对路径，适配 Electron `file://`；`index.html` 含 meta CSP。
- 主进程对每个 IPC 通道做 payload 结构校验（类型、长度、大小上限），图片导出有扩展名白名单与路径穿越防护。
- `window.open` 一律拒绝（`setWindowOpenHandler`），导航走白名单，所有权限请求（摄像头/麦克风/地理等）全部拒绝。
- 自动保存 3s 防抖 + 草稿 800ms 防抖 + 版本快照 30s 合并窗口（有数量与字节双上限），
  备份文件节流为每分钟一次（最多保留 10 份）；**小记随备份/导出一起迁移**，换机恢复不丢。

## 发布流程

1. `pnpm verify:all` 全绿（本地跑一遍，别让 CI 替你发现）
2. 更新 [`CHANGELOG.md`](CHANGELOG.md)（把 `[Unreleased]` 收进新版本号）
3. `pnpm version <patch|minor|major>`（创建版本提交与 tag，语义化版本）
4. `pnpm dist` 产出安装包与便携版（`release/`）
5. 推送 tag 与分支；需要自动更新时把 `latest.yml` 与安装包一起上传到发布通道
6. 发布说明附上 `CHANGELOG` 对应段落

1.0.0 起为正式版：数据文件保持向后兼容，破坏性变更会写进 `CHANGELOG` 并提供迁移路径。

## 相关文档

| 文档 | 内容 |
| --- | --- |
| [`CLAUDE.md`](CLAUDE.md) | 完整架构约定与「改代码前必知」清单 |
| [`docs/功能清单.md`](docs/功能清单.md) | 全功能盘点与优化进展 |
| [`docs/AI-集成文档.md`](docs/AI-集成文档.md) | AI 接口规格、供应商表、错误码 |
| [`docs/富文本内核说明.md`](docs/富文本内核说明.md) | 富文本内核设计与双内核注意事项 |
| [`CHANGELOG.md`](CHANGELOG.md) | 版本历史 |
