import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const nb = page.getByRole('button', { name: '新建知识库' }).first();
if (await nb.count()) await nb.click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: '新建文档' }).last().click();
await page.waitForTimeout(600);
const ed = page.locator('.rich-editor');
await ed.click();
await page.locator('.eh-toolbar button[title="展开工具栏"]').first().click();
await page.locator('.eh-toolbar button[title="表格（可选择行列数）"]').first().click();
await page.locator('.eh-table-cell').nth(12).click();
await page.waitForTimeout(500);
const state = async () => page.evaluate(() => {
  const t = document.querySelector('.rich-editor table');
  if (!t) return null;
  return { rows: t.rows.length, cols: t.rows[0].cells.length, md: t.getAttribute('data-md') };
});
console.log('1 INSERT:', JSON.stringify(await state()));
// click a body cell to show the table bar
await page.locator('.rich-editor tbody td').first().click();
await page.waitForTimeout(400);
console.log('2 BAR:', await page.locator('.table-toolbar').count());
await page.locator('.table-toolbar button[title="在下方插入行"]').click();
await page.waitForTimeout(400);
console.log('3 +ROW:', JSON.stringify(await state()));
await page.locator('.table-toolbar button[title="在右侧插入列"]').click();
await page.waitForTimeout(400);
console.log('4 +COL:', JSON.stringify(await state()));
// Tab navigation
await page.locator('.rich-editor tbody td').first().click();
await page.keyboard.press('Tab');
await page.waitForTimeout(200);
console.log('5 TAB FOCUS:', await page.evaluate(() => {
  const s = window.getSelection();
  const cell = s?.anchorNode?.nodeType === 1 ? s.anchorNode : s?.anchorNode?.parentElement;
  const td = cell?.closest?.('td,th');
  return td ? Array.from(td.parentElement.cells).indexOf(td) : null;
}));
await page.locator('.table-toolbar button[title="删除当前列"]').click();
await page.waitForTimeout(400);
console.log('6 -COL:', JSON.stringify(await state()));
await page.screenshot({ path: 'artifacts/_table.png' });
console.log('ERR', errors.slice(0,3));
await browser.close();
