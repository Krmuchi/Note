/**
 * 视觉基线截图（visual baseline）。
 *
 * 用途：在做视觉改造前后各跑一次，对比"有没有真的变好看"，
 * 而不是凭感觉判断。上一轮改 mermaid 分块时就是因为没做视觉验证才翻了车。
 *
 * 跑法：先 `npm run preview`，再 `node scripts/visual-baseline.mjs`。
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE_URL = process.env.PREVIEW_URL || 'http://127.0.0.1:5215/'
const OUT_DIR = resolve(process.cwd(), 'artifacts/visual')

mkdirSync(OUT_DIR, { recursive: true })

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
})
const page = await context.newPage()

async function shot(name) {
  await page.screenshot({ path: `${OUT_DIR}/${name}.png` })
  console.log(`captured ${name}.png`)
}

await page.goto(BASE_URL, { waitUntil: 'networkidle' })
// 让 React 完成首帧 + 主题应用
await page.waitForTimeout(1200)
await shot('01-start-page')

// 空库时点「新建文档」进入编辑器（有文档时则直接点侧栏第一篇）
const newDocBtn = page.locator('button:has-text("新建文档")').first()
const firstDoc = page.locator('[data-doc-id]').first()
if (await firstDoc.count() > 0) {
  await firstDoc.click()
} else if (await newDocBtn.count() > 0) {
  await newDocBtn.click()
}
await page.waitForTimeout(1200)
await shot('02-editor')

// 输入多行文字，验证正文居中限宽的排版效果（空文档看不出行长）
const ta = page.locator('.editor-textarea, textarea').first()
if (await ta.count() > 0) {
  await ta.click()
  await ta.fill([
    '# 正文排版验证',
    '',
    '这一段用来观察正文的内容栏宽度与左右留白是否对称。',
    '如果文字区是居中的，那么左右两侧的空白应当大致相等，',
    '而不是全部堆在右边 —— 后者是"贴左边缘 + 右侧大片空白"的排版。',
    '',
    '第二段继续填充，观察段落之间的节奏与整体行长是否舒适。',
    '中文正文一行大约 30 到 40 字比较合适，过宽会让眼睛回扫时找错行。',
    '',
    '- 列表项也要落在同一个内容栏内',
    '- 不能因为是列表就顶到左边',
  ].join('\n'))
  await page.waitForTimeout(600)
  await shot('02b-editor-typed')
  console.log('captured 02b-editor-typed.png')
}

// 打开编辑器「更多」菜单验证菜单图标
const moreBtn = page.locator('.eh-dropdown button, button[title="更多"]').first()
if (await moreBtn.count() > 0) {
  await moreBtn.click()
  await page.waitForTimeout(500)
  await shot('04-more-menu')
  console.log('captured 04-more-menu.png')
} else {
  console.log('未找到「更多」菜单按钮，跳过 04-more-menu')
}

// 深色主题
await page.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'dark')
})
await page.waitForTimeout(400)
await shot('03-dark')

// 回到浅色
await page.evaluate(() => {
  document.documentElement.setAttribute('data-theme', 'light')
})
await page.waitForTimeout(300)

await browser.close()
console.log(`\nbaseline written to ${OUT_DIR}`)
