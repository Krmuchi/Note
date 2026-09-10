# 语雀编辑区 vs 本项目编辑区：功能对照、差距分析与开发任务拆解

> 文档版本：v1｜生成日期：2026-09-06
> 适用项目：笔记（React 19 + TS + Vite + Electron 41）

## 0. 文档说明与前提

1. **截图未解析**：用户提供的语雀编辑区截图在当前环境中无法被模型解析（图片内容被过滤）。因此本文档的"语雀功能清单"以**语雀编辑器公开功能集 + 用户枚举的维度**（工具栏、快捷键、块级操作、拖拽、复制粘贴、Markdown 快捷输入、内容嵌入、评论、历史版本、导出）为基准建立；若截图含额外特有功能，需人工补录到 §3 对照表。
2. **现状判定均基于源码核实**（逐项给出 `文件:行号` 佐证），不做臆测。
3. 本文档不改动业务代码，仅作为开发任务拆解依据；实现计划见 §6。

### 差距等级定义

| 等级 | 含义 |
|---|---|
| ✅ 已有 | 功能已实现且可用 |
| ⚠️ 部分 | 已实现但有明显缺陷、路径过深、体验不完整 |
| ❌ 缺失 | 完全没有实现 |

---

## 1. 根本架构差异（先决认知）

| 项 | 语雀 | 本项目 |
|---|---|---|
| 编辑器形态 | 块级所见即所得（Luckysheet 自研 Doc 引擎），实时渲染 | **纯 `textarea` Markdown 源码编辑**（`EditorContent.tsx:327`），另有分屏预览 |
| 数据模型 | 结构化块树（JSON） | `NoteDoc.content: string`（`types/notebook.ts:52`）纯字符串 |
| 块概念 | 一等公民：每块有手柄、菜单、可拖拽 | 无块抽象，仅有"行"操作（`EditorContent.tsx:131-263`） |
| 光标/选区 | 富文本 Range | `selectionStart/selectionEnd` 字符偏移 |

**结论**：语雀相当一部分"块级能力"（块手柄、块拖拽排序、块背景色、块菜单）在当前 textarea 架构下**无法原生实现**，只能通过"行级近似"或"替换编辑器内核"两条路径解决（见 §5）。

---

## 2. 功能维度总览

| # | 维度 | 等级 | 一句话结论 |
|---|---|---|---|
| 1 | 编辑内核 | ⚠️ | 源码编辑 + 分屏预览可用，但无语法高亮/行号/块装饰 |
| 2 | 工具栏 | ⚠️ | 按钮覆盖度约 70%，缺格式刷/上下标/表格选择器/附件/公式/图表；清除格式沉在二级行 |
| 3 | 快捷键 | ⚠️ | 有基础行内格式与行操作，缺标题/列表/引用类块快捷键；键位表三处硬编码漂移 |
| 4 | 块级操作 | ❌ | 完全无块抽象；仅有多行/单行文本操作（复制行、移动行、缩进） |
| 5 | 拖拽 | ⚠️ | 仅支持图片文件拖入；无块拖拽、无附件拖入 |
| 6 | 复制粘贴 | ❌ | 仅识别剪贴板图片；无 HTML→Markdown、无纯文本粘贴、无复制为 Markdown |
| 7 | Markdown 快捷输入 | ❌ | 无 `/` 斜杠命令、无 Enter 自动续列表/引用/任务、无 Tab 缩进、无空列表项退出 |
| 8 | 内容嵌入 | ⚠️ | 预览侧支持 Mermaid/KaTeX/行内 HTML；插入侧仅图片与代码块 |
| 9 | 评论 | ⚠️ | 文档级留言+回复可用；**无划词锚定**（`Comment` 无 anchor/quote 字段） |
| 10 | 历史版本 | ✅ | 自动快照 + LCS 行级 diff + 版本对比 + 标签备注 + 恢复，能力较完整 |
| 11 | 导出 | ⚠️ | 编辑器内仅 HTML/PDF；IPC 层已具备 Markdown/知识库/Zip/备份，**UI 未接入** |
| 12 | 辅助（大纲/状态栏） | ✅ | 大纲跳转、字数/字符/行列/阅读时长统计齐备 |

---

## 3. 分维度逐项对照

### 3.1 编辑内核与编辑器形态

| 语雀功能 | 优先级 | 现状 | 证据 | 差距 | 补全/优化点 |
|---|---|---|---|---|---|
| 所见即所得实时渲染 | P1 | ⚠️ 部分 | `MarkdownPreview.tsx:383` 分屏/仅预览；`Editor.tsx:70` `previewMode: edit/split/preview` | 源码区无高亮/无装饰，需切预览才见效果 | 见 §5-B 层：CodeMirror 6 + markdown 装饰；短期可优化分屏默认态与同步精度 |
| Markdown 语法高亮 | P1 | ❌ | `EditorContent.tsx:327` 裸 textarea | 源码态无视觉层次 | B 层内核升级；短期低优先级 |
| 行号 / 段落折叠 | P2 | ❌ | 同上 | — | B 层 gutter 能力 |
| 大文档性能 | P1 | ⚠️ | `Editor.tsx:113-129` 逐字符 `updateDoc` + immer；`MarkdownPreview.tsx:201` 200ms 防抖全量重解析 | 长文档击键有全量重解析成本 | 新增逻辑必须 O(当前行)，禁止全文档正则（已有先例：`EditorStatusBar` 300ms 防抖） |
| 专注/全屏/演示 | P2 | ✅ | `Editor.tsx:66-69`；`PresentationMode.tsx` | 已有，且优于语雀（本地演示模式） | 保持 |

### 3.2 工具栏

**已实现（源码：`EditorHeader.tsx`）**

- 一级行（`:255-525`）：添加内容菜单 `+`（H1/H2、无序列表、任务列表、引用、代码块、分割线、表格，`:269-299`）、撤销/重做（`:303-319`）、插入链接（`:325`）、段落样式下拉 正文/H1/H2/H3（`:335-360`）、字号下拉 12–20px（`:362-391`）、粗体/斜体/删除线/下划线/行内代码（`:395-426`）、文字颜色（`:428-440`）、高亮颜色（`:442-457`）、对齐 左/中/右（`:461-490`）、列表 无序/有序/任务（`:492-524`）
- 二级行（默认收起，需点展开，`:586-666`）：任务列表、增/减缩进、引用块、代码块、插入图片、表格、分割线、清除格式
- 右侧（`:527-583`）：预览模式切换、专注模式、展开/收起工具栏
- 标题栏（`EditorHeaderTitleBar.tsx`）：标题输入、保存状态、收藏、历史版本、分享、全屏、主题、大纲、评论、更多菜单（复制链接 / 导出 HTML / 导出 PDF / 演示）

**格式化能力**：`FormatType` 共 25 种（`useEditorFormatting.ts:15-25`）；`applyFormat` 基于选区包裹/行首标记（`useEditorFormatting.ts:195-310`）；底层纯函数在 `utils/editorTextOps.ts`（`wrapSelection` / `insertBlockMark` / `insertAtLine` / `changeIndent` / `clearFormatting` / `setAlignment`）。

| 语雀功能 | 优先级 | 现状 | 差距说明与补全点 |
|---|---|---|---|
| 撤销 / 重做 | P0 | ✅ | 已有。窗口 <1000px 隐藏重做（`EditorHeader.tsx:207`），属合理响应式取舍 |
| 格式刷 | P2 | ❌ | 新增 `formatPainter`：首次点击采集当前行/选区的标记集合，二次点击应用到目标。实现于 `editorTextOps.ts` |
| 清除格式 | P0 | ⚠️ | 已实现（`clearFormatting`），但**沉在二级行且需先展开工具栏**，可发现性差 → 上提到一级行 |
| 标题切换（正文/H1–H6） | P0 | ⚠️ | 仅 H1–H3（`EditorHeader.tsx:50`、`useEditorFormatting.ts:18`）→ 补齐 H4–H6（`FormatType` 扩展 + `insertBlockMark`） |
| 字号 | P1 | ⚠️ | **语义混乱**：有选区时插入 `<span style="font-size">`，无选区时改全局基础字号（`Editor.tsx:180-187`）→ UI 拆分为"基础字号"与"选中文字大小"两个控件 |
| 粗体/斜体/删除线/下划线 | P0 | ✅ | 已有（下划线/强调色走 `<u>`/`<mark>`/`<span>`，预览侧 `rehype-raw` 可解析） |
| 行内代码 | P0 | ✅ | 已有 |
| 上标 / 下标 | P2 | ❌ | 新增 `superscript`/`subscript` → `<sup>`/`<sub>`，预览侧 `rehype-raw` 天然支持 |
| 字体颜色 / 高亮（背景色） | P0 | ✅ | 已有（`EditorHeaderColorPicker.tsx`） |
| 对齐（左/中/右/两端） | P1 | ⚠️ | 缺"两端对齐"；当前对齐实现为整行包裹 `<div style="text-align">`（`editorTextOps.ts:124-137`），块首标记会失效 → 优化为保留行内标记 |
| 无序/有序/任务列表 | P0 | ✅ | 已有（`ulist`/`olist`/`tasklist`） |
| 缩进 / 减少缩进 | P0 | ✅ | 已有（`changeIndent`，2 空格） |
| 引用块 | P0 | ✅ | 已有（二级行） |
| 代码块（含语言选择） | P0 | ⚠️ | 仅插入空 ```` ``` ```` 块（`useEditorFormatting.ts:279-290`），**无语言选择** → 改为带下拉的组合按钮（js/ts/python/java/go/sql/bash/json/mermaid） |
| 表格（尺寸选择器） | P0 | ⚠️ | 固定插入 3×3（`useEditorFormatting.ts:273-275`）→ 改为行列数选择器（hover 网格，最大 8×10）+ 表头开关 |
| 分割线 | P1 | ✅ | 已有（`insertAtLine(ta,'---')`） |
| 图片插入 | P0 | ✅ | 已有（文件选择 + 压缩 + 落盘 + dataURL 兜底） |
| 附件插入 | P1 | ❌ | 新增 `attachment`：扩展 `saveImage` 为通用 `saveFile`（`services/storage.ts:129`），落盘后插入 `[文件名](file://…)` |
| 链接 | P0 | ✅ | 已有，且带 `LinkDialog` 弹窗（`Editor.tsx:132-162`）优于语雀 |
| 日期插入 | P2 | ❌ | 新增 `date`：插入 `YYYY-MM-DD` |
| 目录（TOC） | P2 | ❌ | 新增 `toc`：在光标处插入 `[TOC]` 占位，预览侧渲染为目录 |
| 公式（LaTeX） | P2 | ⚠️ | 预览侧已支持（`MarkdownPreview.tsx:4-8` remark-math + rehype-katex），**编辑器无插入入口** → 工具栏/斜杠命令新增，插入 `$$…$$` |
| 图表（Mermaid） | P2 | ⚠️ | 预览侧已支持（`MarkdownPreview.tsx:125-126` Mermaid 组件），**无插入入口** → 新增，插入 ```` ```mermaid ```` 块 + 模板 |
| 素材库（本地素材管理） | P2 | ❌ | 需新增素材面板 + `saveFile` 复用；建议 P2 后置 |
| 更多菜单收纳低频项 | P1 | ⚠️ | 二级行需手动展开且低频项堆积 → 引入"更多 `⋯`"下拉收纳（附件/日期/目录/公式/图表/上下标） |

### 3.3 快捷键

**已实现**

| 键位 | 功能 | 证据 |
|---|---|---|
| Ctrl/Cmd + B / I / U | 粗体 / 斜体 / 下划线 | `EditorContent.tsx:57-71` |
| Ctrl/Cmd + Shift + X | 删除线 | `EditorContent.tsx:72-76` |
| Ctrl/Cmd + E | 行内代码 | `EditorContent.tsx:77-81` |
| Ctrl/Cmd + D | 复制当前行 | `EditorContent.tsx:84-88` |
| Alt + ↑/↓ | 上/下移动行 | `EditorContent.tsx:89-93` |
| Ctrl/Cmd + Shift + K | 删除当前行 | `EditorContent.tsx:94-98` |
| Ctrl/Cmd + ] / [ | 增/减缩进 | `EditorContent.tsx:99-108` |
| Ctrl/Cmd + Enter / Shift+Enter | 下方/上方插入行 | `EditorContent.tsx:109-117` |
| Ctrl/Cmd + Shift + P | 切换预览模式 | `Editor.tsx:280-283` |
| Ctrl/Cmd + Shift + E | 专注模式 | `Editor.tsx:284-287` |
| Esc | 退出专注模式 | `Editor.tsx:288-291` |
| Ctrl/Cmd + Z / Y | 撤销/重做（全局） | `keyboardSlice.ts:36-37` |
| Ctrl/Cmd + K | 搜索 | `keyboardSlice.ts:29` |
| Ctrl/Cmd + / | 快捷键帮助 | `keyboardSlice.ts:35` |
| Ctrl/Cmd + N / Shift+N | 新建文档 / 知识库 | `keyboardSlice.ts:31-32` |
| Ctrl/Cmd + Shift + F | 收藏 | `keyboardSlice.ts:34` |
| Ctrl/Cmd + \ | 切换侧边栏 | `keyboardSlice.ts:33` |

| 语雀功能 | 优先级 | 现状 | 差距说明与补全点 |
|---|---|---|---|
| Ctrl+1~6 标题 | P0 | ❌ | 新增；`EditorContent.onKeyDown` 拦截数字键（注意与浏览器标签切换冲突，需 `preventDefault`） |
| Ctrl+Shift+8/9 无序/有序列表 | P0 | ❌ | 新增 |
| Ctrl+Shift+. 任务列表 | P1 | ❌ | 新增 |
| Ctrl+Shift+Q / > 引用 | P1 | ❌ | 新增（注意 Ctrl+Shift+> 在部分输入法下不可靠，备选 Ctrl+Alt+Q） |
| Tab / Shift+Tab 缩进 | P0 | ❌ | **当前 Tab 用于焦点切换，编辑区会跳走** → 在 textarea 内拦截 Tab 插入 2 空格、多行选区整块缩进 |
| Ctrl+Shift+V 纯文本粘贴 | P1 | ❌ | 需配合 §3.6 粘贴改造 |
| Ctrl+Alt+C 复制为 Markdown 片段 | P2 | ❌ | 需配合 §3.6 |
| Ctrl+Shift+L 插入链接 | P1 | ❌ | 注意 **Ctrl+K 已被搜索占用**（`keyboardSlice.ts:29`），链接必须用 Ctrl+Shift+L |
| 快捷键帮助面板 | P1 | ⚠️ | 面板存在（`ShortcutHelp.tsx`）但**键位表硬编码第二份**（`ShortcutHelp.tsx:8-29`），与 `keyboardSlice.DEFAULT_SHORTCUTS`（`keyboardSlice.ts:28-40`）已不一致（帮助面板缺"快捷键帮助""新建知识库"等项）→ 统一由 `keyboardSlice` 驱动 |
| 键位自定义 | P2 | ⚠️ | `keyboardSlice` 已有 `updateShortcut/resetShortcuts/load/saveCustomShortcuts`（`:14-17`），但**编辑器内 15 个快捷键是硬编码的**，自定义后不生效 → 编辑器内键位改从 `shortcuts` 读取 |

**风险点（实现前必读）**

- 键位表存在**三处漂移源**：`EditorContent.tsx`（编辑区硬编码）、`keyboardSlice.ts`（全局）、`ShortcutHelp.tsx`（展示）。新增键位必须统一落到 `keyboardSlice.DEFAULT_SHORTCUTS`，由编辑器读取。
- 已占用冲突：Ctrl+K（搜索）、Ctrl+Shift+F（收藏）、Ctrl+Shift+N（新建知识库）、Ctrl+Shift+P（预览）、Ctrl+Shift+E（专注）、Ctrl+Shift+X（删除线）、Ctrl+Shift+K（删除行）、Ctrl+E（行内代码）。

### 3.4 块级操作

| 语雀功能 | 优先级 | 现状 | 差距说明与补全点 |
|---|---|---|---|
| 块拖拽手柄（左侧六点） | P1 | ❌ | textarea 无块 DOM。**B 层（CodeMirror gutter）** 才可实现；A 层可用"行悬停手柄"近似（镜像层定位） |
| 块菜单（复制/剪切/删除/上移/下移/转换类型/背景色） | P1 | ❌ | A 层可用：右键菜单 + 行级命令（上移/下移已有 `Alt+↑/↓`，复制行已有 `Ctrl+D`，缺"转换块类型"与"块背景色"） |
| 块拖拽排序（跨层级） | P2 | ❌ | 需块模型，B/C 层 |
| 块转换（段落↔标题↔列表↔引用↔代码） | P1 | ❌ | A 层可低成本实现：`transformBlock(ta, targetType)` 纯函数替换当前行前缀 |
| 块背景色 / 高亮块 | P2 | ❌ | 可用 `<div style="background:…">` 包裹行（与对齐同思路），预览侧 `rehype-raw` 已支持 |

### 3.5 拖拽

| 语雀功能 | 优先级 | 现状 | 差距说明与补全点 |
|---|---|---|---|
| 拖入图片自动上传并插入 | P0 | ✅ | `EditorContent.tsx:266-308` 拖放检测 + 遮罩；`useEditorFormatting.ts:141-174` 压缩（最长边 1200）→ `saveImage` 落盘 → 失败回落 dataURL + toast 提示 |
| 拖入附件（非图片文件） | P1 | ❌ | 当前过滤 `type.startsWith('image/')`，非图片直接放行默认行为（`:297`）→ 新增通用落盘 `saveFile`，插入链接语法 |
| 块拖拽排序 | P1 | ❌ | 见 §3.4 |
| 拖拽时的插入位置指示线 | P2 | ❌ | A 层可近似：拖拽过程中依据鼠标 Y 换算行号，在 textarea 上叠加一条 CSS 指示线 |

### 3.6 复制粘贴

| 语雀功能 | 优先级 | 现状 | 差距说明与补全点 |
|---|---|---|---|
| 粘贴图片（截图直粘） | P0 | ✅ | `useEditorFormatting.ts:177-192` |
| 粘贴富文本 → 自动转 Markdown | P0 | ❌ | **最大体验缺口**：从网页/Word/其他笔记复制的内容会原样塞入 HTML 源码。新增 `utils/htmlToMarkdown.ts`，覆盖 h1–h6 / p / ul / ol / blockquote / pre / table / a / img / strong / em / code；超大输入（>1MB）降级为纯文本 + toast |
| 纯文本粘贴（去格式） | P1 | ❌ | 新增 Ctrl+Shift+V 与"粘贴为纯文本"菜单项 |
| 复制为 Markdown 片段 | P2 | ❌ | 新增 Ctrl+Alt+C：将选中行的 Markdown 源码原样写入剪贴板 |
| 粘贴外链图片自动转存本地 | P2 | ❌ | 粘贴 HTML 时抽取 `<img src>`，尝试下载后走 `saveImage`；失败保留外链 |
| 剪切/复制整行（无选区时） | P2 | ❌ | 无选区时 Ctrl+C/X 作用于整行 |

### 3.7 Markdown 快捷输入

| 语雀功能 | 优先级 | 现状 | 差距说明与补全点 |
|---|---|---|---|
| `/` 斜杠命令面板 | P0 | ❌ | **第二大体验缺口**。新增 `SlashCommandMenu.tsx`：空行或行首输入 `/` 唤出，模糊搜索（中英文别名）、↑↓/Enter/Esc 导航、分组（块 / 媒体 / 高级）；定位沿用 `Editor.tsx:299-308` 的"行号 × lineHeight"换算思路，避免新依赖 |
| Enter 自动续列表/任务/引用 | P0 | ❌ | 新增 `continueBlockOnEnter(ta)`：识别 `- ` / `* ` / `1. ` / `> ` / `- [ ] `；`- [x]` 续写为 `- [ ]`；序号自动 +1 |
| 空列表项再按 Enter 退出列表 | P0 | ❌ | 清空当前行标记并移除行首缩进 |
| Tab / Shift+Tab 列表层级 | P0 | ❌ | 见 §3.3；需与续写联动（子项缩进 2 空格） |
| Markdown 标记自动补全（`**`、`、`` `） | P1 | ❌ | 输入左侧标记自动补右侧并置光标于中间；选中文本输入标记则包裹 |
| 表格输入辅助（管道对齐） | P2 | ❌ | 输入 `|` 后自动补齐分隔行 |
| 标题语法即时识别（`#` + 空格） | P2 | ❌ | 依赖语法高亮，B 层一并解决 |

### 3.8 内容嵌入

| 语雀功能 | 优先级 | 现状 | 差距说明与补全点 |
|---|---|---|---|
| 图片（本地上传/粘贴/拖拽） | P0 | ✅ | 三种入口齐备 |
| 代码块（语言 + 高亮） | P0 | ⚠️ | 预览侧高亮可用；缺语言选择（见 §3.2） |
| 表格 | P0 | ⚠️ | 固定 3×3，缺尺寸选择 |
| 数学公式（LaTeX） | P1 | ⚠️ | 预览支持（`MarkdownPreview.tsx:4-8`），缺插入入口 |
| 流程图/时序图（Mermaid） | P1 | ⚠️ | 预览支持（`:125-126`），缺插入入口 |
| 附件 / 本地文件 | P1 | ❌ | 见 §3.2 / §3.5 |
| 视频 / 网页卡片（iframe 嵌入） | P2 | ⚠️ | 预览侧 `rehype-raw` 允许原始 HTML，理论上可写 `<iframe>`；**无插入入口且 CSP 需评估** |
| 画板 / 思维导图 | P2 | ❌ | 需独立编辑器，不建议短期做 |
| 目录（TOC 块） | P2 | ❌ | 见 §3.2 |
| 子文档 / 双链引用 | P2 | ❌ | 需数据模型扩展（`[[文档标题]]` 语法 + 解析），可列为远期项 |

### 3.9 评论

| 语雀功能 | 优先级 | 现状 | 差距说明与补全点 |
|---|---|---|---|
| 文档级评论列表 + 回复 | P1 | ✅ | `CommentsPanel.tsx`、`commentSlice.ts`；`Comment` 含 `replies`（`types/notebook.ts:25-33`） |
| 划词评论（锚定到文本片段） | P1 | ❌ | `Comment` **无 anchor/quote/位置字段**，`CommentsPanel` 无任何选区读取（`getSelection` 零命中）→ 扩展 `Comment` 增加 `quote?: string; anchorStart?: number; anchorEnd?: number;`，评论入口从"仅侧栏"扩展到"选中文本后出现浮动按钮" |
| 评论气泡 / 侧边高亮联动 | P2 | ❌ | 依赖上一项；预览侧需对锚定区间加 `<mark class="comment-anchor">` |
| 评论解决状态（resolve） | P2 | ❌ | `Comment` 增加 `resolved?: boolean` |

### 3.10 历史版本（本项目强项）

| 语雀功能 | 优先级 | 现状 | 证据 | 差距说明与补全点 |
|---|---|---|---|---|
| 自动快照 | P0 | ✅ | `coreSlice.updateDoc` 内自动写入，30s 合并窗口，上限 50 | — |
| 版本时间轴 / 列表 | P0 | ✅ | `VersionHistoryPanel.tsx:382-390` | — |
| 版本 diff 对比 | P0 | ✅ | `:147-243` 自实现 LCS 行级 diff，双栏展示 | 可优化为**词级 diff**（当前为行级） |
| 版本恢复 | P0 | ✅ | `versionSlice.restoreVersion` | — |
| 手动保存版本 + 命名/备注 | P1 | ✅ | `:90-98` 打标签 + 备注；`DocVersion.type` 含 `'manual'`（`types/notebook.ts:46`） | 需在编辑器内暴露"保存当前版本"入口（当前仅能从面板内对已选版本补标签） |
| 版本数量上限策略 | P2 | ⚠️ | 固定 50 | 可在设置中开放配置 |
| 版本时间轴可视化 | P2 | ⚠️ | 列表式 | 可增时间轴视图 |

### 3.11 导出

**编辑器内已接入**：导出 HTML、导出 PDF（`editorHeaderExports.ts:10-38`，入口在 `EditorHeaderTitleBar` 更多菜单）。

**IPC 层已具备但 UI 未接入**（`services/storage.ts:92-257` + `electron/ipc/handlers-export.cjs`）：

| 能力 | IPC | 落盘格式 | 现状 |
|---|---|---|---|
| 单文档导出 | `notes:export-doc` | `.md`（`handlers-export.cjs:22-30`） | ❌ UI 未接入 |
| 知识库导出（合并） | `notes:export-notebook` | `.md`（`:35-43`） | ❌ UI 未接入 |
| 知识库导出 Zip | `notes:export-notebook-zip` | `.zip`（`:51-70`） | ❌ UI 未接入 |
| 全量数据备份 | `notes:export-all` | `.json`（`handlers-storage.cjs:179-185`） | ❌ 编辑器未接入（疑似侧栏有入口，需确认） |
| Markdown 导入 | `notes:import-md` | — | ❌ 编辑器未接入 |
| 备份导入 | `notes:import-backup` | — | ❌ 编辑器未接入 |

| 语雀功能 | 优先级 | 现状 | 补全点 |
|---|---|---|---|
| 导出 Markdown | P0 | ❌ | 复用 `exportDoc`，接编辑器更多菜单 |
| 导出 PDF / HTML | P0 | ✅ | 已有 |
| 导出知识库 Zip | P1 | ❌ | 复用 `exportNotebookZip` |
| 导出长图 | P2 | ❌ | 需 html2canvas（新依赖）或 Electron `capturePage`，需评估 |
| 导出 Word / 图片 | P2 | ❌ | 不在近期范围 |

### 3.12 辅助能力

| 语雀功能 | 优先级 | 现状 | 证据 | 说明 |
|---|---|---|---|---|
| 文档目录 / 大纲 | P0 | ✅ | `outline/DocumentOutline.tsx`；`Editor.tsx:299-308` 跳转按行号换算 | 已有 |
| 字数统计 / 阅读时长 | P1 | ✅ | `EditorStatusBar.tsx:24-48,164-202`：字数、字符数（含/不含空格）、中文字符、英文词数、行数、段落数、选区字符、行列号、阅读时长，300ms 防抖 | 已有且强于语雀 |
| 自动保存状态提示 | P0 | ✅ | `saveStatus` + 标题栏展示 | 已有 |
| 全屏 / 专注 / 演示 | P2 | ✅ | `Editor.tsx:66-69,74-103` | 已有 |
| 模板中心 | P2 | ✅ | `templates/TemplateCenter.tsx` | 已有（语雀为付费能力） |
| AI 写作 | P2 | ✅ | `ai/AiWriter.tsx` | 已有 |
| 分享链接 | P1 | ✅ | `share/SharePanel.tsx` + `shareSlice` | 已有 |

---

## 4. 关键缺口 Top 5（按投入产出比排序）

| 排名 | 缺口 | 影响 | 成本 |
|---|---|---|---|
| 1 | 粘贴富文本不转换（§3.6） | 从网页/其他笔记复制内容后需手工清理 HTML，日常高频痛点 | 中（自研转换器 ~250 行） |
| 2 | 无 Enter 自动续列表 / Tab 缩进（§3.7） | 写列表体验断崖式低于语雀 | 低（纯函数 ~120 行） |
| 3 | 无 `/` 斜杠命令（§3.7） | 块插入全靠鼠标点两级菜单，效率与可发现性差 | 中（新组件 + 定位逻辑） |
| 4 | 工具栏缺项 + 二级行埋没（§3.2） | 格式刷/上下标/表格选择器/附件/公式/图表无入口 | 中（增量按钮 + 下拉） |
| 5 | 导出能力已就绪但 UI 未接入（§3.11） | 用户拿不到 `.md`，与"Markdown 笔记"定位不符 | 低（复用现有 IPC） |

---

## 5. 架构路径建议：三层递进

### A 层（本次实施）— textarea 增强，不换内核

- 复用 `editorTextOps.ts` ＋ `useEditorFormatting.ts` 的"纯函数 + 选区操作"模式补齐输入体验层。
- **不改动** `coreSlice.updateDoc` 与版本快照逻辑；改动面集中在 `src/components/editor/*`、`src/utils/editorTextOps.ts`、`src/hooks/useEditorFormatting.ts`。
- 风险低、可增量发布、无需数据迁移。

### B 层（中期建议）— 升级为 CodeMirror 6

- 引入 `codemirror` + `@codemirror/lang-markdown` + `@codemirror/view`（decoration / gutter）。
- 保留 Markdown 源码语义与 `NoteDoc.content: string` 数据模型（**零数据迁移**），同时获得：语法高亮、行号 gutter、块级装饰、块手柄（gutter 点击）、更好的撤销栈、大文档虚拟化。
- 相比 Tiptap 更契合"Markdown 源码优先"的产品定位，是本项目正确的中期方向。

### C 层（不建议短期做）— Tiptap/ProseMirror 所见即所得

- 需重建文档数据模型（字符串 → 块树 JSON），迁移历史版本、分享链接、演示模式、搜索索引、导入导出全链路。
- 成本与回归面极大，仅在产品明确转向"语雀式块编辑"时才启动。

---

## 6. 开发任务拆解

优先级：**P0 = 本次必做**；工作量单位：人日（含自测）。

### 6.1 P0 任务

| ID | 功能点 | 涉及文件 | 实现要点 | 工作量 | 依赖 |
|---|---|---|---|---|---|
| **T1** | Enter 自动续写（列表/任务/引用）+ 空项退出 | `utils/editorTextOps.ts`（新增 `continueBlockOnEnter`）、`components/editor/EditorContent.tsx:51-118` | 纯函数返回 `{content, cursor}` 或 null；支持 `- ` / `* ` / `+ ` / `N. `（序号+1）/ `> ` / `- [ ] `（`- [x]`→`- [ ]`）；空列表项 Enter 清除标记；仅 O(当前行) | 1.0 | — |
| **T2** | Tab / Shift+Tab 缩进与反缩进 | `EditorContent.tsx:51`（新增分支）、`editorTextOps.ts`（`changeIndent` 复用） | 无选区：当前行插入/删除 2 空格；有选区：整块缩进（复用现有 `changeIndent`）；`preventDefault` 阻止焦点跳走 | 0.5 | — |
| **T3** | 粘贴富文本 → Markdown | `utils/htmlToMarkdown.ts`（新）、`hooks/useEditorFormatting.ts:177-192` | 优先 `clipboardData.getData('text/html')`；DOMParser 解析后按节点映射；覆盖 h1-6/p/ul/ol/li/blockquote/pre/code/table/thead/tbody/tr/th/td/a/img/strong/em/del/code/br；递归深度上限 + 输入 >1MB 降级纯文本 + toast；图片走现有 `handleInsertImage` | 2.0 | — |
| **T4** | 纯文本粘贴 + 复制为 Markdown 片段 | `useEditorFormatting.ts`、`EditorContent.tsx`、`services/storage.ts`（无需改） | Ctrl+Shift+V 取 `text/plain` 插入；Ctrl+Alt+C 复制当前行/选区原样源码 | 0.5 | T3 |
| **T5** | `/` 斜杠命令面板 | `components/editor/SlashCommandMenu.tsx`（新）、`Editor.tsx`、`EditorContent.tsx`、`styles/editor.css` | 空行/行首输入 `/` 触发；浮层宽 280px、最大高 320px、分组（块/媒体/高级）；模糊匹配（中文名 + 英文别名）；↑↓/Enter/Esc；定位复用 `Editor.tsx:299-308` 行号×行高换算；状态提到 `Editor.tsx`（与 `LinkDialog` 同层）避免击键重渲染；打开期间才绑键盘 | 2.5 | T1 |
| **T6** | 编辑类快捷键补齐 | `components/editor/EditorContent.tsx`、`store/slices/keyboardSlice.ts:28-40`、`components/common/ShortcutHelp.tsx:8-29` | 新增 Ctrl+1~6（标题）、Ctrl+Shift+8/9（无序/有序）、Ctrl+Shift+. （任务）、Ctrl+Alt+Q（引用）、Ctrl+Shift+L（链接，**避开已占用的 Ctrl+K**）、Ctrl+Shift+V、Ctrl+Alt+C；**统一由 `keyboardSlice.DEFAULT_SHORTCUTS` 单一数据源驱动**，编辑器与帮助面板均从 store 读取，消除三处漂移 | 1.5 | T1、T5 |
| **T7** | 导出 Markdown / 知识库 Zip 接入 | `components/editor/editorHeaderExports.ts`、`EditorHeaderTitleBar.tsx` | 新增 `exportCurrentDocAsMarkdown`（复用 `exportDoc`）、`exportNotebookAsZip`（复用 `exportNotebookZip`）；保持零依赖函数 + toast 反馈风格 | 0.5 | — |
| **T8** | 非图片附件拖入 / 粘贴 | `services/storage.ts:129`（新增 `saveFile`）、`EditorContent.tsx:292-308`、`useEditorFormatting.ts` | `saveImage` 泛化为 `saveFile`（保留 `saveImage` 兼容）；拖入非图片文件插入 `[文件名](file://…)` 并 toast | 1.0 | — |

### 6.2 P1 任务

| ID | 功能点 | 涉及文件 | 实现要点 | 工作量 | 依赖 |
|---|---|---|---|---|---|
| T9 | 工具栏补齐（H4–H6、清除格式上提、格式刷、上下标、更多 `⋯` 菜单收纳附件/日期/目录） | `EditorHeader.tsx`、`useEditorFormatting.ts:15-25`（扩展 `FormatType`）、`editorTextOps.ts` | 沿用现有 `IconBtn` + `eh-dropdown-menu` 结构；`formatPainter` 状态放 `Editor.tsx` | 2.0 | T5 |
| T10 | 表格尺寸选择器 + 代码块语言下拉 | `EditorHeader.tsx`、`editorTextOps.ts`（`insertTable(rows,cols,header)`）、`useEditorFormatting.ts:273-290` | 表格 hover 网格最大 8×10；代码块组合按钮 + 语言下拉（js/ts/python/java/go/sql/bash/json/mermaid） | 1.5 | T9 |
| T11 | 公式 / 图表插入入口 | `EditorHeader.tsx`、`useEditorFormatting.ts` | 公式插入 `$$\n…\n$$`；图表插入 ```` ```mermaid ```` + 模板；预览侧已支持 | 0.5 | T9 |
| T12 | 块转换（段落↔标题↔列表↔引用） | `editorTextOps.ts`（`transformBlock`）、右键菜单或斜杠命令 | 纯函数替换行前缀；接入 T5 命令与编辑器右键菜单 | 1.0 | T5 |
| T13 | 字号语义拆分（基础字号 / 选中文字大小） | `EditorHeader.tsx:362-391`、`Editor.tsx:180-187` | 拆为两个控件，消除"有选区/无选区行为不一致"的困惑 | 0.5 | T9 |
| T14 | 评论划词锚定 | `types/notebook.ts:25-33`、`store/slices/commentSlice.ts`、`components/comments/CommentsPanel.tsx`、`EditorContent.tsx` | `Comment` 增加 `quote?`/`anchorStart?`/`anchorEnd?`；选中文本后浮动"评论"按钮；兼容旧数据（字段可选） | 2.0 | — |
| T15 | 编辑器内"保存当前版本"入口 | `EditorHeaderTitleBar.tsx`、`store/slices/versionSlice.ts` | 存为 `type:'manual'` + 可选命名/备注 | 0.5 | — |
| T16 | 粘贴外链图片转存本地 | `utils/htmlToMarkdown.ts`、`useEditorFormatting.ts` | 抽取 `<img src>` → 下载 → `saveImage`；失败保留外链 | 1.0 | T3 |

### 6.3 P2 任务（远期 / 待评估）

| ID | 功能点 | 说明 | 工作量 |
|---|---|---|---|
| T17 | 块背景色 | 行包裹 `<div style="background">`，预览侧 `rehype-raw` 已支持 | 0.5 |
| T18 | Markdown 标记自动补全 | 输入 `**`/`` ` ``/`` ` 自动补右半 | 1.0 |
| T19 | 版本 diff 词级化 | 现为行级 LCS（`VersionHistoryPanel.tsx:147`） | 1.0 |
| T20 | 导出长图 | html2canvas 新依赖 或 Electron `capturePage` | 2.0 |
| T21 | 素材库面板 | 复用 `saveFile` + 资产索引 | 3.0 |
| T22 | 双链 `[[文档]]` | 需解析层 + 跳转 + 反向链接面板 | 3.0 |
| T23 | **B 层：CodeMirror 6 内核升级** | 语法高亮 / 行号 / 块装饰 / gutter 块手柄 / 大文档虚拟化 | 8.0+ |

---

## 7. 验收标准（A 层）

| 任务 | 验收要点 |
|---|---|
| T1 | 在 `- 项目` 后回车生成 `- `；`1.` 序号递增；`- [x]` 续写为 `- [ ]`；空列表项回车退出列表并还原缩进；光标位置正确 |
| T2 | Tab 插入 2 空格不跳焦点；多行选区整块缩进/反缩进 |
| T3 | 从网页复制含标题/列表/表格/链接/代码块的内容，粘贴后得到合法 Markdown，图片走落盘流程；1MB 以上 HTML 降级为纯文本且不卡死 |
| T4 | Ctrl+Shift+V 去格式；Ctrl+Alt+C 复制源码片段 |
| T5 | 空行输入 `/` 唤出面板；输入 `tabl` 命中"表格"；↑↓/Enter/Esc 正常；浮层定位不脱锚；关闭后焦点回到 textarea 且选区正确 |
| T6 | 新增键位生效；`ShortcutHelp` 与 `keyboardSlice` 展示一致；自定义键位后编辑器行为同步 |
| T7 | 导出 `.md` / `.zip` 成功并 toast |
| T8 | 拖入 .pdf/.zip 等附件插入链接语法并落盘 |
| 回归 | 撤销/重做、版本快照、草稿恢复、分屏预览滚动同步、专注/全屏/演示均不受影响 |

**测试补充**：在 `src/components/editor/__tests__/` 增加 Vitest 用例（续写、斜杠命令过滤、HTML→MD 转换），风格参照现有 `MarkdownPreview.pipeline.test.tsx`；E2E 参照 `tests/` 下 Playwright 用例。

---

## 8. 性能与风险约束

1. **禁止全文档扫描**：新增的续写/斜杠检测必须在 `keydown` 内做 O(当前行) 计算（先例：`EditorStatusBar` 全量统计已用 300ms 防抖）。
2. **浮层定位零依赖**：沿用 `Editor.tsx:299-308` 的"行号 × lineHeight"换算，不引入定位库。
3. **超大输入保护**：HTML→Markdown 转换 >1MB 降级，避免主线程长任务卡死输入。
4. **不触碰核心链路**：不动 `coreSlice.updateDoc`、版本快照、`useUndoRedo`；A 层改动集中在编辑器目录与两个工具/hook 文件。
5. **键位单一数据源**：新增键位一律落到 `keyboardSlice.DEFAULT_SHORTCUTS`，禁止在组件内硬编码第三份。
6. **视觉一致性**：浮层与新增控件沿用现有 CSS 变量与 `LinkDialog` / `DocumentOutline` 的圆角、阴影、悬浮反馈；<768px 沿用现有收起策略。

---

## 9. 实现记录（A 层 P0 已落地）

以下任务已实现并通过回归（typecheck 通过、ESLint 0 errors、Vitest 119/119 通过）：

| 任务 | 状态 | 说明 |
|---|---|---|
| T1 Enter 自动续写 | ✅ | `editorTextOps.continueBlockOnEnter`（列表/任务/引用续写、空项退出、行中拆分、嵌套缩进保留）；`EditorContent` keydown 接入 |
| T2 Tab/Shift+Tab 缩进 | ✅ | `EditorContent` 拦截 Tab，复用 `changeIndent`（多行整块缩进） |
| T3 粘贴富文本→Markdown | ✅ | `utils/htmlToMarkdown.ts`（自研，覆盖标题/列表嵌套/表格/代码块/引用/链接/图片/上下标/高亮，script/style 剥离）；>1MB 降级纯文本 + toast |
| T4 纯文本粘贴 / 复制为 Markdown | ✅ | Ctrl+Shift+V（`plainTextPasteRef` + onPaste 分支）、Ctrl+Alt+C（onCopy 写入源码） |
| T5 `/` 斜杠命令 | ✅ | `SlashCommandMenu.tsx`（模糊搜索、↑↓/Enter/Esc、分组、canvas 光标定位 `getCaretPixelPosition`）；执行时先删除 `/query` 再复用 `applyFormat` |
| T6 快捷键补齐 + 单一数据源 | ✅ | `keyboardSlice.DEFAULT_SHORTCUTS` 扩至 33 项；`EditorContent` 经 `resolveShortcut` 从 store 解析（历史硬编码保留为兜底）；`useKeyboard`/`ShortcutHelp` 共用 `utils/shortcuts.ts`；H4–H6（`FormatType` 扩展）；新增测试 `src/utils/__tests__/editorTextOps.test.ts` |
| T7 导出 Markdown / 知识库 Zip | ✅ | `editorHeaderExports.ts` 新增两个导出函数，接入标题栏"更多"菜单 |
| T8 附件拖入 | ✅ | `storage.saveFile`（复用 save-image IPC）；拖入非图片文件插入 `[文件名](file://…)` |

工具栏增量：段落菜单补齐 H4–H6；"清除格式"上提到一级行。

**待办（P1/P2）**：T9–T23 见 §6.2/§6.3，含格式刷、表格尺寸选择器、代码块语言下拉、公式/图表插入入口、划词评论锚定、CodeMirror 6 内核升级等。
