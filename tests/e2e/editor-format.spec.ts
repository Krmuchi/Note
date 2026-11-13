import { test, expect } from '@playwright/test';

/**
 * 文字颜色 / 高亮插入链路：断言的是 **Markdown 源码** 插入结果，
 * 因此显式切到 textarea 内核（notes-rich-editor='0'）。
 * 富文本内核的对应链路由 scripts/rich-editor-check.mjs 真机覆盖。
 *
 * 注意：工具栏在可用宽度 < 760px 时会把颜色控件收进「更多格式」溢出菜单
 * （ResizeObserver 按工具栏实际宽度判定，与窗口宽度不同）。因此这里先点开
 * 溢出菜单再取颜色按钮；若主栏已直出（宽屏），则直接可见。
 */

async function openTextareaEditor(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('notes-rich-editor', '0'));
  await page.reload();
  await expect(page.locator('.app-shell')).toBeVisible();
  await page.locator('.btn-add-notebook').click();
  await expect(page.locator('.notebook-name').first()).toBeVisible();
  await page.getByRole('button', { name: '新建文档' }).first().click();
  const editor = page.locator('.editor-textarea');
  await expect(editor).toBeVisible();
  return editor;
}

/** 打开颜色面板：宽屏直出，窄屏需先进「更多格式」溢出菜单 */
async function openColorPicker(page: import('@playwright/test').Page, title: '文字颜色' | '高亮颜色') {
  const direct = page.getByTitle(title);
  if ((await direct.count()) === 0) {
    await page.locator('.eh-overflow-btn').click();
  }
  await page.getByTitle(title).first().click();
  await expect(page.locator('.eh-color-picker')).toBeVisible();
}

test('文字颜色插入链路', async ({ page }) => {
  const editor = await openTextareaEditor(page);

  await editor.fill('你好世界');
  // 选中前两个字符"你好"
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(0, 2);
  });

  await openColorPicker(page, '文字颜色');

  // 点击第一个色块
  await page.locator('.eh-color-picker .eh-color-swatch').first().click();
  await page.waitForTimeout(300);

  const value = await editor.inputValue();

  // 预览渲染管线已由组件测试覆盖（MarkdownPreview.pipeline.test.tsx），
  // 此处断言源码插入成功即可（新建文档默认编辑模式，无预览面板）
  expect(value).toContain('<span style="color:');
  expect(value).toContain('你好');
});

test('文字高亮插入链路', async ({ page }) => {
  const editor = await openTextareaEditor(page);

  await editor.fill('你好世界');
  await editor.evaluate((el: HTMLTextAreaElement) => {
    el.focus();
    el.setSelectionRange(0, 2);
  });

  await openColorPicker(page, '高亮颜色');
  await page.locator('.eh-color-picker .eh-color-swatch').first().click();
  await page.waitForTimeout(300);

  const value = await editor.inputValue();
  expect(value).toContain('<mark');
});