import { test, expect } from '@playwright/test';

/**
 * 主题切换 E2E。
 *
 * 主题入口在编辑器「更多」菜单内（语雀式顶栏精简后）。
 * 注意：切换主题会触发整树重渲染，菜单随之收起；
 * 因此每次都重新打开菜单再点，并等待 data-theme 落定。
 */
test('主题切换', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();

  await page.locator('.btn-add-notebook').click();
  await page.getByRole('button', { name: '新建文档' }).first().click();
  await expect(page.locator('.eh-header')).toBeVisible();

  // 页脚也有「更多」按钮 → 限定在编辑器头部内查找
  const moreBtn = page.locator('.eh-header').getByRole('button', { name: '更多', exact: true });

  await moreBtn.click();
  await expect(page.locator('.eh-header .eh-dropdown-menu')).toBeVisible();
  await page.getByRole('button', { name: '夜间模式' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  // 主题切换会重渲染，菜单已收起；重新打开再切回日间
  await moreBtn.click();
  await expect(page.locator('.eh-header .eh-dropdown-menu')).toBeVisible();
  await page.getByRole('button', { name: '日间模式' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});