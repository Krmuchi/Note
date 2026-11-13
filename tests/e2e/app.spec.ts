import { test, expect } from '@playwright/test';

/**
 * 核心流程 E2E。
 *
 * 注意：应用默认使用富文本内核（.rich-editor），标题在正文（.editor-doc-title），
 * 主题切换收进「更多」菜单。旧断言（.editor-textarea / .eh-title-input /
 * 工具栏主题按钮）针对的是已非默认的 textarea 内核，2026-11-13 已更新。
 */

test.describe('笔记应用核心功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.app-shell')).toBeVisible();
  });

  test('应用正常加载', async ({ page }) => {
    await expect(page).toHaveTitle(/笔记/);
    await expect(page.locator('.main-sidebar')).toBeVisible();
  });

  test('创建新知识库', async ({ page }) => {
    await page.locator('.btn-add-notebook').click();
    await expect(page.locator('.notebook-name').first()).toContainText('新建知识库');
  });

  test('创建新文档并进入编辑器', async ({ page }) => {
    // 先建知识库（文档需要挂在知识库下）
    await page.locator('.btn-add-notebook').click();
    await expect(page.locator('.notebook-name').first()).toBeVisible();
    // 再建文档：默认富文本内核，标题在正文
    await page.getByRole('button', { name: '新建文档' }).first().click();
    await expect(page.locator('.rich-editor')).toBeVisible();
    await expect(page.locator('.editor-doc-title')).toBeVisible();
  });

  test('编辑笔记内容并显示同步状态', async ({ page }) => {
    await page.locator('.btn-add-notebook').click();
    await page.getByRole('button', { name: '新建文档' }).first().click();
    const editor = page.locator('.rich-editor');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('测试内容');
    await expect(editor).toContainText('测试内容');
    // 保存状态：saving 是瞬时态（3s 防抖 + IPC），稳定可见的是落定后的侧栏 SaveIndicator
    await expect(page.locator('.save-indicator')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.save-indicator')).toContainText(/已保存|保存/);
  });

  test('搜索面板', async ({ page }) => {
    await page.locator('.sidebar-search').click();
    await expect(page.locator('.search-panel')).toBeVisible();
    await page.locator('.search-panel .search-input').fill('测试');
    // 输入后经防抖触发搜索，进入结果视图（空库时展示空态）。
    // 不断言 .search-suggestions：它只在"有匹配的文档/标签/历史"且搜索结果返回前短暂出现，
    // 依赖预置数据 + 时序窗口，属不稳定断言
    await expect(page.locator('.search-results')).toBeVisible();
  });

  // 主题切换已拆到 tests/e2e/theme.spec.ts（需要更多菜单交互细节）

  test('收藏文档', async ({ page }) => {
    await page.locator('.btn-add-notebook').click();
    await page.getByRole('button', { name: '新建文档' }).first().click();
    const favBtn = page.getByTitle('收藏');
    await expect(favBtn).toBeVisible();
    await favBtn.click();
    await expect(favBtn).toHaveClass(/active/);
  });

  test('撤销重做', async ({ page }) => {
    await page.locator('.btn-add-notebook').click();
    await page.getByRole('button', { name: '新建文档' }).first().click();
    const editor = page.locator('.rich-editor');
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.type('测试内容');
    await expect(editor).toContainText('测试内容');
    const undoBtn = page.getByTitle(/撤销/);
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await expect(editor).not.toContainText('测试内容');
    await page.getByTitle(/重做/).click();
    await expect(editor).toContainText('测试内容');
  });
});