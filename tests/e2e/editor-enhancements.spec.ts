import { test, expect } from '@playwright/test';

async function openEditor(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.getByRole('button', { name: '新建知识库' }).click();
  await expect(page.locator('.notebook-name').first()).toBeVisible();
  await page.getByRole('button', { name: '新建文档' }).first().click();
  const editor = page.locator('.editor-textarea');
  await expect(editor).toBeVisible();
  return editor;
}

test('行内标记自动补全：反引号成对并居中', async ({ page }) => {
  const editor = await openEditor(page);
  await editor.click();

  await editor.press('`');
  expect(await editor.inputValue()).toBe('``');

  await editor.pressSequentially('code', { delay: 20 });
  expect(await editor.inputValue()).toBe('`code`');
});

test('行内标记自动补全：双星号生成加粗标记', async ({ page }) => {
  const editor = await openEditor(page);
  await editor.click();

  await editor.press('*');
  await editor.press('*');
  expect(await editor.inputValue()).toBe('****');
});

test('表格尺寸选择器插入指定行列', async ({ page }) => {
  const editor = await openEditor(page);

  // 二级工具栏需先展开
  await page.locator('.eh-expand-btn').click();
  await page.getByTitle('表格（可选择行列数）').click();
  await expect(page.locator('.eh-table-menu')).toBeVisible();

  // 选择 2 行 3 列
  await page
    .locator('.eh-table-menu .eh-table-grid-row:nth-child(2) .eh-table-cell:nth-child(3)')
    .click();
  await page.waitForTimeout(200);

  const value = await editor.inputValue();
  expect(value).toContain('| 列1 | 列2 | 列3 |');
  expect(value.split('\n').filter((line) => line.startsWith('| 内容')).length).toBe(1);
});

test('代码块语言下拉插入带语言围栏', async ({ page }) => {
  const editor = await openEditor(page);

  await page.locator('.eh-expand-btn').click();
  await page.getByTitle('代码块（可选择语言）').click();
  await expect(page.locator('.eh-codelang-menu')).toBeVisible();
  await page.locator('.eh-codelang-menu').getByText('Python', { exact: true }).click();
  await page.waitForTimeout(200);

  expect(await editor.inputValue()).toContain('```python');
});
