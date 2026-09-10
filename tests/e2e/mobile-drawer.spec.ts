import { test, expect } from '@playwright/test';

// 窄窗口下的导航可用性：此前 ≤768px 会隐藏全部导航入口，导致无法切换视图
test.describe('移动端导航抽屉', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 860 });
    await page.goto('/');
    await expect(page.locator('.app-shell')).toBeVisible();
  });

  test('通过抽屉切换视图并自动关闭', async ({ page }) => {
    const toggle = page.locator('.mobile-nav-toggle');
    await expect(toggle).toBeVisible();

    await toggle.click();
    const panel = page.locator('.mobile-nav-panel');
    await expect(panel).toBeVisible();
    await expect(page.locator('.mobile-nav-backdrop')).toBeVisible();

    // 视图切换入口在窄窗口下应可用
    await expect(panel.getByRole('menuitem', { name: '开始' })).toBeVisible();
    await expect(panel.getByRole('menuitem', { name: '收藏' })).toBeVisible();

    await panel.getByRole('menuitem', { name: '收藏' }).click();
    await expect(panel).toBeHidden();
  });

  test('Esc 可关闭抽屉', async ({ page }) => {
    await page.locator('.mobile-nav-toggle').click();
    const panel = page.locator('.mobile-nav-panel');
    await expect(panel).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  });
});

test.describe('移动端文档列表', () => {
  test('默认折叠，点击标题栏展开', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 860 });
    await page.goto('/');
    await expect(page.locator('.app-shell')).toBeVisible();

    // 新建知识库与文档，进入编辑器视图
    await page.getByRole('button', { name: '新建知识库' }).click();
    await expect(page.locator('.notebook-name').first()).toBeVisible();
    await page.getByRole('button', { name: '新建文档' }).first().click();
    await expect(page.locator('.editor-textarea')).toBeVisible();

    const docsSidebar = page.locator('.docs-sidebar-mobile');
    await expect(docsSidebar).toBeVisible();
    // 折叠态不渲染搜索框与文档树
    await expect(docsSidebar.locator('.docs-search')).toHaveCount(0);

    await docsSidebar.locator('.docs-mobile-toggle').click();
    await expect(docsSidebar.locator('.docs-search')).toBeVisible();
  });
});
