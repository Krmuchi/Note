# 测试-E2E选择器随内核与布局漂移

## 触发条件
`npm run test:e2e` 大面积失败（本项目一次 11/17 失败），但应用功能正常——典型是测试仍按旧内核/旧布局写选择器。

## 首选姿势
- **先判断是产品缺陷还是测试过期**：看失败断言指向的元素在当前 UI 里到底该不该存在。本项目 11 条失败里 9 条是测试过期（`.editor-textarea` → `.rich-editor`、`.eh-title-input` → `.editor-doc-title`、工具栏主题按钮 → 更多菜单），2 条是真实缺陷。
- 富文本已是默认内核：核心流程断言 `.rich-editor`；**断言 Markdown 源码形态**的用例（自动配对、颜色/高亮插入）显式切旧内核：`localStorage.setItem('notes-rich-editor','0')` 后 reload。
- 选择器歧义要收窄作用域：页脚与编辑器头部都有「更多」按钮 → `page.locator('.eh-header').getByRole(...)`；`getByTitle('更多')` 还会命中「更多格式」→ 用 `getByRole('button',{name:'更多',exact:true})`。
- 工具栏会按**可用宽度**（ResizeObserver，<760px）把颜色/对齐/列表/链接收进「更多格式」溢出菜单：宽屏直出，窄屏要先点 `.eh-overflow-btn`。
- 「开始」页不渲染 NotebooksView（`MainContent` 在 `activeLeftMenu==='start'` 直接返回 StartPage）：要进文档列表必须先点知识库条目；新库没有文档时编辑器不渲染，需先「新建文档」。
- 480px 下 `isCompact` 为 true 且 `compactExpanded` 初始 false → `DocsSidebar` 走 `.docs-sidebar-rail` 提前返回分支，`.docs-sidebar-mobile` 与 `.docs-search` 都不存在；展开按钮只置 compactExpanded，搜索框仍受 `showBody`（`!mobile || mobileExpanded`）控制。
- 保存状态是瞬时态：`saving` 只短暂出现，稳定可断言的是侧栏 `.save-indicator`。

## 反面清单
- 看到 E2E 失败就改产品代码迁就测试。
- 用 `fireEvent`/`dispatchEvent` 合成悬停（elementFromPoint 走真实指针，用 `page.mouse.move`）。
- 前台跑整批 E2E（>10min 易被会话中断）——用后台 job 收集结果。

## 验证方式
逐条跑失败用例确认根因分类（产品 vs 测试），修完跑整批。本项目最终 17/17 通过，其中暴露并修复了 2 个真实缺陷（主题菜单项漏关、下拉菜单状态竞态）。