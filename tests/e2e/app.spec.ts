import { test, expect } from '@playwright/test';

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
    await page.getByRole('button', { name: '新建知识库' }).click();
    await expect(page.locator('.notebook-name').first()).toContainText('新建知识库');
  });

  test('创建新文档并进入编辑器', async ({ page }) => {
    // 先建知识库（文档需要挂在知识库下）
    await page.getByRole('button', { name: '新建知识库' }).click();
    await expect(page.locator('.notebook-name').first()).toBeVisible();
    // 再建文档
    await page.getByRole('button', { name: '新建文档' }).first().click();
    await expect(page.locator('.editor-textarea')).toBeVisible();
    await expect(page.locator('.eh-title-input')).toBeVisible();
  });

  test('编辑笔记内容并显示同步状态', async ({ page }) => {
    await page.getByRole('button', { name: '新建知识库' }).click();
    await page.getByRole('button', { name: '新建文档' }).first().click();
    const editor = page.locator('.editor-textarea');
    await editor.fill('# 测试笔记\n这是测试内容');
    await expect(page.locator('.eh-sync-status')).toBeVisible();
    await expect(editor).toHaveValue('# 测试笔记\n这是测试内容');
  });

  test('搜索面板', async ({ page }) => {
    await page.locator('.sidebar-search').click();
    await expect(page.locator('.search-panel')).toBeVisible();
    await page.locator('.search-panel .search-input').fill('测试');
    await expect(page.locator('.search-suggestions')).toBeVisible();
  });

  test('主题切换', async ({ page }) => {
    // 需要编辑器头部（主题按钮在编辑器工具栏）
    await page.getByRole('button', { name: '新建知识库' }).click();
    await page.getByRole('button', { name: '新建文档' }).first().click();
    await expect(page.locator('.eh-header')).toBeVisible();
    await page.getByTitle('切换到夜间模式').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByTitle('切换到日间模式').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('收藏文档', async ({ page }) => {
    await page.getByRole('button', { name: '新建知识库' }).click();
    await page.getByRole('button', { name: '新建文档' }).first().click();
    const favBtn = page.getByTitle('收藏');
    await expect(favBtn).toBeVisible();
    await favBtn.click();
    await expect(favBtn).toHaveClass(/active/);
  });

  test('撤销重做', async ({ page }) => {
    await page.getByRole('button', { name: '新建知识库' }).click();
    await page.getByRole('button', { name: '新建文档' }).first().click();
    const editor = page.locator('.editor-textarea');
    await editor.fill('测试内容');
    const undoBtn = page.getByTitle(/撤销/);
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();
    await expect(editor).not.toHaveValue('测试内容');
    await page.getByTitle(/重做/).click();
    await expect(editor).toHaveValue('测试内容');
  });
});
