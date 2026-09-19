import { test, expect } from '@playwright/test';

// 临时诊断测试：文字颜色/高亮插入链路
test('文字颜色插入链路', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();

  await page.getByRole('button', { name: '新建知识库' }).click();
  await expect(page.locator('.notebook-name').first()).toBeVisible();
  await page.getByRole('button', { name: '新建文档' }).first().click();
  const editor = page.locator('.editor-textarea');
  await expect(editor).toBeVisible();

  await editor.fill('你好世界');
  // 选中前两个字符"你好"
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(0, 2);
  });

  // 打开文字颜色色板
  await page.getByTitle('文字颜色').click();
  await expect(page.locator('.eh-color-picker')).toBeVisible();

  // 点击第一个色块
  await page.locator('.eh-color-picker .eh-color-swatch').first().click();
  await page.waitForTimeout(300);

  const value = await editor.inputValue();
  console.log('TEXTAREA VALUE:', JSON.stringify(value));

  // 预览渲染管线已由组件测试覆盖（MarkdownPreview.pipeline.test.tsx），
  // 此处断言源码插入成功即可（新建文档默认编辑模式，无预览面板）
  expect(value).toContain('<span style="color:');
  expect(value).toContain('你好');
});

test('文字高亮插入链路', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.app-shell')).toBeVisible();

  await page.getByRole('button', { name: '新建知识库' }).click();
  await expect(page.locator('.notebook-name').first()).toBeVisible();
  await page.getByRole('button', { name: '新建文档' }).first().click();
  const editor = page.locator('.editor-textarea');
  await expect(editor).toBeVisible();

  await editor.fill('你好世界');
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(0, 2);
  });

  await page.getByTitle('高亮颜色').click();
  await expect(page.locator('.eh-color-picker')).toBeVisible();
  await page.locator('.eh-color-picker .eh-color-swatch').first().click();
  await page.waitForTimeout(300);

  const value = await editor.inputValue();
  console.log('HIGHLIGHT TEXTAREA VALUE:', JSON.stringify(value));
  expect(value).toContain('<mark');
});
