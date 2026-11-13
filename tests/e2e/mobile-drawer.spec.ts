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

    // 窄窗口下侧栏整体收进导航抽屉，新建入口需先展开抽屉
    await page.locator('.mobile-nav-toggle').click();
    await page.locator('.btn-add-notebook').click();
    await expect(page.locator('.notebook-name').first()).toBeVisible();

    // 抽屉会遮住主区，进入编辑器前先收起
    await page.keyboard.press('Escape');
    /*
     * 「开始」页不渲染 NotebooksView（MainContent 在 activeLeftMenu==='start' 时
     * 直接返回 StartPage），因此必须点知识库条目切到 notebooks 视图。
     * 新知识库还没有文档，编辑器区不会渲染 —— 先建一篇文档。
     */
    await page.locator('.mobile-nav-toggle').click();
    await page.locator('.notebook-name').first().click();
    await page.getByRole('button', { name: '新建文档' }).first().click();
    await expect(page.locator('.rich-editor')).toBeVisible();

    /*
     * 480px 下 isCompact 为 true 且 compactExpanded 初始为 false，
     * DocsSidebar 走「紧凑收起」分支：渲染 .docs-sidebar-rail（一条窄条 +
     * 「展开文档列表」按钮），此时不渲染搜索框与文档树。
     *
     * 注意：rail 的展开按钮只置 compactExpanded；搜索框由 showBody
     * （!mobile || mobileExpanded）控制，而 mobileExpanded 此时仍为 false，
     * 因此展开后出现的是文档头（排序下拉、新建文档入口），不是搜索框。
     */
    const rail = page.locator('.docs-sidebar-rail');
    await expect(rail).toBeVisible();
    // 折叠态不渲染搜索框与文档树
    await expect(page.locator('.docs-search')).toHaveCount(0);

    await page.getByRole('button', { name: '展开文档列表' }).click();
    await expect(rail).toBeHidden();
    await expect(page.getByRole('combobox', { name: '文档排序方式' })).toBeVisible();
  });
});
