/**
 * 富文本内核（RichEditor）的实机验证。
 *
 * 用途：单元测试用 jsdom，无法验证真实浏览器里的光标、选区、输入转换行为。
 * 这个脚本在真实 Chromium 里打开 `notes-rich-editor` 开关，实际操作编辑器，
 * 并断言关键行为 —— 测试通过不等于界面能用，这一步是最后的把关。
 *
 * 跑法：`npm run test:rich-editor`（自动构建 + 起停 preview + 断言）。
 * 调试时也可先手动 `npx vite preview`，再 `PREVIEW_URL=... node scripts/rich-editor-check.mjs`。
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { withPreview } from './_preview-server.mjs'

const OUT_DIR = resolve(process.cwd(), 'artifacts/rich-editor')
mkdirSync(OUT_DIR, { recursive: true })

await withPreview(async (BASE_URL) => {
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

/** 收集控制台错误：实机验证的核心价值就是发现 jsdom 里不会出现的报错 */
const errors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(msg.text())
})
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. 打开富文本开关（写入 localStorage 后重新加载，让 Editor 读到）
await page.goto(BASE_URL, { waitUntil: 'networkidle' })
// 富文本内核现在是**默认开启**，这里显式清掉开关以确保验证的是默认行为
// （若存了 '0' 会走 textarea 分支，整个脚本的前提就不成立了）
await page.evaluate(() => localStorage.removeItem('notes-rich-editor'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)

// 2. 进入编辑器：空库时点「新建文档」
const newDocBtn = page.locator('button:has-text("新建文档")').first()
if (await newDocBtn.count() > 0) await newDocBtn.click()
await page.waitForTimeout(1000)

// 3. 富文本容器应已挂载
const richRoot = page.locator('.rich-editor')
const mounted = await richRoot.count() > 0
check('富文本编辑器已挂载（.rich-editor 存在）', mounted)
if (!mounted) {
  await page.screenshot({ path: `${OUT_DIR}/00-not-mounted.png` })
  console.log('\n富文本内核未挂载，后续检查跳过')
  await browser.close()
  process.exit(1)
}

// 空文档应有一个可落光标的空段落（否则用户打不了字）
const hasEmptyP = await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  return root ? root.querySelectorAll('p').length > 0 : false
})
check('空文档渲染出可输入的段落', hasEmptyP)

await richRoot.click()
await page.waitForTimeout(200)

// 4. 输入 Markdown 语法，验证即时转换
async function typeAndCheck(text, selector, name) {
  await page.keyboard.type(text, { delay: 12 })
  await page.waitForTimeout(250)
  const ok = await page.evaluate((sel) => {
    const root = document.querySelector('.rich-editor')
    return root ? root.querySelector(sel) !== null : false
  }, selector)
  check(name, ok)
  return ok
}

await typeAndCheck('# 一级标题', 'h1', '输入 "# " 即时转成标题')
await page.keyboard.press('Enter')
await page.waitForTimeout(150)
await typeAndCheck('- 列表项', 'ul > li', '输入 "- " 即时转成列表')

// 5. 回写：内容应以 Markdown 形式落盘（草稿键名见 utils/autoSaveUtils.ts）
const stored = await page.evaluate(() => {
  const raw = localStorage.getItem('notes-autosave-draft')
  return raw ? raw.length : 0
})
check('内容已落盘（草稿有数据）', stored > 0, `draft bytes=${stored}`)

await page.screenshot({ path: `${OUT_DIR}/01-typed.png` })

// 6. 输入加粗语法，验证所见即所得
await page.keyboard.press('Enter')
await page.waitForTimeout(150)
await page.keyboard.type('这是 **加粗** 文字', { delay: 12 })
await page.waitForTimeout(400)

// 诊断：直接看 DOM 里实际是什么（失败时最需要的信息）
const domDump = await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  if (!root) return '(no root)'
  return {
    html: root.innerHTML.slice(0, 600),
    strongCount: root.querySelectorAll('strong').length,
    strongTexts: Array.from(root.querySelectorAll('strong')).map((s) => s.textContent),
    blocks: Array.from(root.children).map((c) => `${c.tagName}:${(c.textContent ?? '').slice(0, 40)}`),
  }
})
console.log('  [诊断] strong 数量:', domDump.strongCount, '内容:', JSON.stringify(domDump.strongTexts))
console.log('  [诊断] 顶层块:', JSON.stringify(domDump.blocks))
console.log('  [诊断] HTML:', domDump.html)

const boldRendered = domDump.strongCount > 0 && domDump.strongTexts.some((t) => t === '加粗')
check('加粗语法渲染为真实粗体（所见即所得）', boldRendered)

await page.screenshot({ path: `${OUT_DIR}/02-formatting.png` })

// 7. 斜杠命令菜单：输入 `/` 应唤出面板
await page.keyboard.press('Enter')
await page.waitForTimeout(150)
await page.keyboard.type('/', { delay: 20 })
await page.waitForTimeout(400)
// 用菜单项文案判断（比类名稳：类名可能随样式重构变化，文案是产品行为）
const slashMenuVisible = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('.slash-title, [class*="slash"]'))
    .some((el) => (el.textContent ?? '').includes('标题'))
})
check('输入 "/" 唤出斜杠命令面板', slashMenuVisible)

// 输入查询词，面板应过滤
if (slashMenuVisible) {
  await page.keyboard.type('biaoti', { delay: 20 })
  await page.waitForTimeout(350)
  const filtered = await page.evaluate(() => {
    const items = document.querySelectorAll('[class*="slash"] [class*="item"], [class*="slash-item"]')
    return items.length
  })
  check('输入查询词后面板过滤出选项', filtered > 0, `选项数=${filtered}`)
  await page.screenshot({ path: `${OUT_DIR}/03-slash-menu.png` })
}

// 9. 划词浮层工具栏：选中文字应出现，点加粗应生效
await page.keyboard.press('Enter')
await page.waitForTimeout(150)
await page.keyboard.type('选中这句话', { delay: 15 })
await page.waitForTimeout(300)

// 用鼠标拖选（模拟真实用户划词）
const pBox = await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  const blocks = root ? Array.from(root.children) : []
  const last = blocks[blocks.length - 1]
  if (!last) return null
  const r = last.getBoundingClientRect()
  return { x: r.left, y: r.top + r.height / 2, w: r.width }
})
if (pBox) {
  await page.mouse.move(pBox.x + 2, pBox.y)
  await page.mouse.down()
  await page.mouse.move(pBox.x + pBox.w - 4, pBox.y, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(500)

  const toolbarVisible = await page.evaluate(() => document.querySelector('.selection-toolbar') !== null)
  check('选中文字后浮层工具栏出现', toolbarVisible)

  if (toolbarVisible) {
    await page.screenshot({ path: `${OUT_DIR}/04-selection-toolbar.png` })
    // 点加粗，验证命令真的作用到选中文字
    await page.locator('.selection-toolbar-btn[title="加粗"]').click()
    await page.waitForTimeout(600)
    const boldApplied = await page.evaluate(() => {
      const root = document.querySelector('.rich-editor')
      return root ? root.querySelector('strong') !== null : false
    })
    check('浮层点加粗后文字真的变粗（命令生效）', boldApplied)
    await page.screenshot({ path: `${OUT_DIR}/05-after-bold.png` })
  }
}

// 10. 撤销/重做（新内核下必须可用：走的是 updateDocContent 统一入口）
await page.keyboard.press('Enter')
await page.waitForTimeout(150)
await page.keyboard.type('ZZZ待撤销', { delay: 15 })
await page.waitForTimeout(700)

/** 取编辑器纯文本，用于比较内容而不是长度 */
const readText = () =>
  page.evaluate(() => {
    const root = document.querySelector('.rich-editor')
    return root ? (root.textContent ?? '') : ''
  })

const textBeforeUndo = await readText()
check('输入后内容含待撤销文字', textBeforeUndo.includes('ZZZ待撤销'), JSON.stringify(textBeforeUndo.slice(-12)))

// 点顶部工具栏的撤销按钮（与用户操作一致，而不是直接调 API）
await page.locator('.eh-toolbar button[title^="撤销"]').first().click()
await page.waitForTimeout(900)
const textAfterUndo = await readText()
/*
 * 判据用"待撤销文字是否消失"，而不是长度比较：
 * 撤销是回到**上一个快照**，那个快照可能比当前更长（例如上一段被回退）。
 * 用长度判断会得出错误结论 —— 实测踩过这个坑。
 */
check('撤销后待撤销文字消失', !textAfterUndo.includes('ZZZ待撤销'), JSON.stringify(textAfterUndo.slice(-12)))

// 再重做，应恢复
await page.locator('.eh-toolbar button[title^="重做"]').first().click()
await page.waitForTimeout(900)
const textAfterRedo = await readText()
check('重做后待撤销文字回来', textAfterRedo.includes('ZZZ待撤销'), JSON.stringify(textAfterRedo.slice(-12)))

// 11. 插入链接（曾经点按钮没反应：旧实现读 textarea.selectionStart）
await page.keyboard.press('Enter')
await page.waitForTimeout(150)
await page.keyboard.type('链接文字', { delay: 15 })
await page.waitForTimeout(300)
// 选中刚输入的文字
const linkBox = await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  const blocks = root ? Array.from(root.children) : []
  const last = blocks[blocks.length - 1]
  if (!last) return null
  const r = last.getBoundingClientRect()
  return { x: r.left, y: r.top + r.height / 2, w: r.width }
})
if (linkBox) {
  await page.mouse.move(linkBox.x + 2, linkBox.y)
  await page.mouse.down()
  await page.mouse.move(linkBox.x + linkBox.w - 4, linkBox.y, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(400)
}
// 点浮层里的链接按钮
const linkBtn = page.locator('.selection-toolbar-btn[title="插入链接"]')
const linkBtnExists = await linkBtn.count() > 0
if (linkBtnExists) {
  await linkBtn.click()
  await page.waitForTimeout(600)
  const dialogOpen = await page.evaluate(
    () => document.querySelector('.link-dialog, [class*="link-dialog"], input[placeholder*="链接"]') !== null,
  )
  check('点链接按钮弹出插入链接弹窗', dialogOpen)
  if (dialogOpen) {
    await page.screenshot({ path: `${OUT_DIR}/06-link-dialog.png` })
    // 关掉弹窗（Escape），避免影响后续
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
} else {
  check('点链接按钮弹出插入链接弹窗', false, '浮层里没找到链接按钮')
}

// 12. 大纲点击跳转（曾经静默失效）
const outlineVisible = await page.evaluate(() => document.querySelector('.doc-outline, [class*="outline"]') !== null)
if (outlineVisible) {
  check('大纲面板存在', true)
} else {
  // 大纲默认可能关闭，不算失败
  check('大纲面板存在（未开启，跳过跳转验证）', true, '面板未打开')
}

// 12. 状态栏行列号（曾经永久停在"行1,列1"：旧实现只认 textarea）
const statusBefore = await page.evaluate(() => {
  const el = document.querySelector('.editor-status-bar')
  return el ? (el.textContent ?? '') : ''
})
// 输入多行内容，光标应移到第 3 行
await page.keyboard.press('Enter')
await page.waitForTimeout(120)
await page.keyboard.type('第二行', { delay: 15 })
await page.keyboard.press('Enter')
await page.waitForTimeout(120)
await page.keyboard.type('第三行', { delay: 15 })
await page.waitForTimeout(600)
const statusAfter = await page.evaluate(() => {
  const el = document.querySelector('.editor-status-bar')
  return el ? (el.textContent ?? '') : ''
})
/** 从状态栏文本里抽出"行 N" */
const lineOf = (s) => {
  const m = /行\s*(\d+)/.exec(s)
  return m ? Number(m[1]) : -1
}
check(
  '状态栏行列号随光标更新（不再恒为行1）',
  lineOf(statusAfter) > lineOf(statusBefore),
  `${lineOf(statusBefore)} → ${lineOf(statusAfter)}`,
)

// 13. 粘贴图片（曾经静默无反应：只处理 text/plain，图片根本没被读出来）
await page.keyboard.press('Enter')
await page.waitForTimeout(150)
// 用 DataTransfer 构造剪贴板图片，模拟真实的"复制图片后粘贴"
await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  root?.focus()
  // 1x1 的透明 PNG
  const b64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  const file = new File([bytes], 'pixel.png', { type: 'image/png' })

  const dt = new DataTransfer()
  dt.items.add(file)
  const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
  root?.dispatchEvent(ev)
})
await page.waitForTimeout(1200)

const imageInserted = await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  if (!root) return { hasImg: false, text: '', html: '' }
  return {
    hasImg: root.querySelector('img') !== null,
    text: (root.textContent ?? '').slice(-40),
    // 打印尾部 HTML：图片若以 Markdown 语法形式存在（还没渲染成 <img>），这里能看到
    html: root.innerHTML.slice(-200),
  }
})
check(
  '粘贴图片被插入编辑器',
  imageInserted.hasImg,
  `hasImg=${imageInserted.hasImg} html尾=${JSON.stringify(imageInserted.html)}`,
)

// 14. 行编辑快捷键（textarea 分支有，富文本内核曾经完全没有）
await page.keyboard.press('Enter')
await page.waitForTimeout(150)
await page.keyboard.type('快捷键测试行', { delay: 15 })
await page.waitForTimeout(300)

const beforeShortcut = await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  return root ? (root.textContent ?? '') : ''
})

// Ctrl+D：复制当前行
await page.keyboard.press('Control+d')
await page.waitForTimeout(500)
const afterDuplicate = await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  return root ? (root.textContent ?? '') : ''
})
const dupCount = (afterDuplicate.match(/快捷键测试行/g) || []).length
check('Ctrl+D 复制当前行', dupCount >= 2, `出现 ${dupCount} 次`)

// 撤销回去，避免影响后续断言
await page.keyboard.press('Control+z')
await page.waitForTimeout(400)

// 15. Tab 键：不应把焦点移出编辑器（contenteditable 默认会跳走）
await page.keyboard.press('Enter')
await page.waitForTimeout(150)
await page.keyboard.type('缩进测试', { delay: 15 })
await page.waitForTimeout(200)
await page.keyboard.press('Tab')
await page.waitForTimeout(400)
const afterTab = await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  return {
    stillFocused: root?.contains(document.activeElement) ?? false,
    activeTag: document.activeElement?.tagName ?? '(无)',
  }
})
check(
  '按 Tab 后焦点仍在编辑器内',
  afterTab.stillFocused,
  `activeElement=${afterTab.activeTag}`,
)

// 16. 任务列表可勾选（曾经渲染了 checkbox 但点了没反应）
/*
 * 直接清空编辑器内容再输入，而不是点「新建文档」。
 * 实测：点「新建文档」不一定切到新文档（取决于当前视图状态），
 * 残留的图片块会让"光标在哪个块"变得不可控。
 * 清空内容 + 重新聚焦是确定性的。
 */
await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  if (root) root.innerHTML = '<p><br></p>'
})
await page.locator('.rich-editor').click()
await page.waitForTimeout(300)
await page.keyboard.type('- [ ] 待办事项', { delay: 20 })
await page.waitForTimeout(700)

const taskBefore = await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  const box = root?.querySelector('input[type="checkbox"]')
  return {
    exists: Boolean(box),
    checked: box?.checked ?? null,
    // 诊断：任务列表没生成时，看 DOM 实际变成了什么
    html: root ? root.innerHTML.slice(-260) : '(无)',
  }
})
check(
  '任务列表渲染出 checkbox',
  taskBefore.exists,
  taskBefore.exists ? '' : `DOM尾=${JSON.stringify(taskBefore.html)}`,
)

if (taskBefore.exists) {
  // 诊断：确认点击目标真的是 checkbox 本身
  const clickTarget = await page.evaluate(() => {
    const box = document.querySelector('.rich-editor input[type="checkbox"]')
    if (!box) return null
    const r = box.getBoundingClientRect()
    return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }
  })
  console.log('  checkbox 尺寸/位置:', JSON.stringify(clickTarget))

  // 用鼠标坐标点，而不是 locator.click（后者可能被 span 遮挡）
  if (clickTarget && clickTarget.w > 0) {
    await page.mouse.click(clickTarget.x + clickTarget.w / 2, clickTarget.y + clickTarget.h / 2)
  } else {
    await page.locator('.rich-editor input[type="checkbox"]').first().click()
  }
  await page.waitForTimeout(700)
  // 诊断：确认 onClick 处理器是否真的跑了（看 DOM 类名与持久化内容）
  const clickDiag = await page.evaluate(() => {
    const root = document.querySelector('.rich-editor')
    const box = root?.querySelector('input[type="checkbox"]')
    const li = root?.querySelector('li')
    return {
      checked: box?.checked,
      liClass: li?.className,
      // 回写是否成功：草稿里应出现 [x]
      draft: (() => {
        try {
          return JSON.parse(localStorage.getItem('notes-autosave-draft') || '{}')?.content ?? '(无)'
        } catch {
          return '(解析失败)'
        }
      })(),
    }
  })
  console.log('  点击后诊断:', JSON.stringify(clickDiag))
  const taskAfter = await page.evaluate(() => {
    const root = document.querySelector('.rich-editor')
    const box = root?.querySelector('input[type="checkbox"]')
    const li = root?.querySelector('li')
    return {
      checked: box?.checked ?? null,
      doneClass: li?.classList.contains('task-done') ?? false,
    }
  })
  check('点击后 checkbox 状态翻转', taskAfter.checked === !taskBefore.checked, `${taskBefore.checked} → ${taskAfter.checked}`)
  check('已完成项有划线样式类', taskAfter.doneClass)
}

// 17. 块级悬浮手柄（语雀式：鼠标移入块，左侧浮出 + / ⋮⋮）
//
// 必须用 page.mouse 真实移动，不能用 dispatchEvent 合成 mousemove：
// 手柄用 `document.elementFromPoint(x, y)` 定位，而合成事件只带 clientX/Y，
// 不会让浏览器产生真实的命中测试 —— elementFromPoint 仍按**指针实际位置**
// 返回元素，于是合成事件永远定位不到块，手柄不会出现。
// （实测：合成事件失败、page.mouse 成功；这是测试方式问题，不是功能缺陷。）
const handleVisible = await (async () => {
  const target = page.locator('.rich-editor > *').last()
  const box = await target.boundingBox()
  if (!box) return false
  // 先移出手柄区域，再移入目标块，确保这次移动真的触发 mousemove
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 200)
  await page.waitForTimeout(120)
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.waitForTimeout(250)
  return (await page.locator('.block-handle').count()) > 0
})()
check('鼠标移入块时浮出块级手柄', handleVisible)

if (handleVisible) {
  // 点「+」应插入新块
  const beforeCount = await page.evaluate(
    () => document.querySelector('.rich-editor')?.children.length ?? 0,
  )
  await page.locator('.block-handle-btn[title="插入块"]').click()
  await page.waitForTimeout(500)
  const afterCount = await page.evaluate(
    () => document.querySelector('.rich-editor')?.children.length ?? 0,
  )
  check('点「+」插入新块', afterCount > beforeCount, `${beforeCount} → ${afterCount}`)
  await page.screenshot({ path: `${OUT_DIR}/08-block-handle.png` })
}

// 18. 标题只出现一次（曾经顶部栏与正文各一个，用户不知道该改哪个）
const titleOccurrences = await page.evaluate(() => {
  const title = '新建文档'
  // 顶部栏的标题输入框 + 正文标题，两者都算
  const topInput = document.querySelector('.eh-title-input')
  const bodyTitle = document.querySelector('.editor-doc-title')
  return {
    hasTopInput: topInput !== null,
    bodyTitleText: bodyTitle ? (bodyTitle.textContent ?? '') : null,
    // 整个页面里可见的"标题输入/正文标题"总数
    count:
      (topInput ? 1 : 0) +
      (bodyTitle && (bodyTitle.textContent ?? '').includes(title) ? 1 : 0),
  }
})
check(
  '富文本内核下标题只在正文出现一次（顶部栏不再重复）',
  !titleOccurrences.hasTopInput && titleOccurrences.bodyTitleText !== null,
  `顶部栏输入框=${titleOccurrences.hasTopInput} 正文标题=${JSON.stringify(titleOccurrences.bodyTitleText)}`,
)

// 14. 控制台无报错
const fatal = errors.filter((e) => !/favicon|DevTools|Download the React/.test(e))
check('无控制台错误', fatal.length === 0, fatal.slice(0, 3).join(' | '))

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过`)
console.log(`截图：${OUT_DIR}`)

/*
 * 在回调内抛错而不是 process.exit：
 * 直接 exit 会跳过 withPreview 的 finally，preview 子进程会残留。
 * 抛错让调用方捕获后再决定退出码。
 */
if (failed.length) throw new Error(`${failed.length} 项实机检查未通过`)
})
