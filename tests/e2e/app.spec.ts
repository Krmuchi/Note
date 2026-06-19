import { test, expect } from '@playwright/test';

test.describe('笔记应用核心功能', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173');
  });

  test('应用正常加载', async ({ page }) => {
    await expect(page).toHaveTitle(/学习笔记|学习/);
    await expect(page.locator('.app-container')).toBeVisible();
  });

  test('创建新笔记本', async ({ page }) => {
    await page.getByRole('button', { name: /新建笔记本|新建/ }).click();
    await page.getByPlaceholder(/笔记本名称/).fill('测试笔记本');
    await page.getByRole('button', { name: /确定|创建/ }).click();
    await expect(page.locator('.notebook-item')).toContainText('测试笔记本');
  });

  test('创建新笔记', async ({ page }) => {
    await page.getByRole('button', { name: /新建笔记|新建/ }).click();
    await expect(page.locator('.editor-title-input')).toBeVisible();
  });

  test('编辑笔记内容', async ({ page }) => {
    await page.locator('.editor-textarea').fill('# 测试笔记\n这是测试内容');
    await expect(page.locator('.save-status-indicator')).toContainText(/已保存|正在保存/);
  });

  test('搜索功能', async ({ page }) => {
    await page.getByRole('button', { name: /搜索/ }).click();
    await page.locator('.search-input').fill('测试');
    await expect(page.locator('.search-results')).toBeVisible();
  });

  test('主题切换', async ({ page }) => {
    const themeToggle = page.locator('.theme-toggle-btn');
    await expect(themeToggle).toBeVisible();
    await themeToggle.click();
    const html = page.locator('html');
    const theme = await html.getAttribute('data-theme');
    expect(theme).toMatch(/light|dark/);
  });

  test('收藏笔记', async ({ page }) => {
    await page.locator('.title-toolbar-btn.favorited, .title-toolbar-btn').first().click();
    await expect(page.locator('.title-toolbar-btn.favorited')).toBeVisible();
  });

  test('撤销重做功能', async ({ page }) => {
    await page.locator('.editor-textarea').fill('测试内容');
    await page.locator('.toolbar-btn').first().click();
    await expect(page.locator('.editor-textarea')).toHaveValue('');
  });
});