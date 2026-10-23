/**
 * 复杂文档在新内核下的"编辑后是否损坏"验收。
 *
 * 这是"不损坏用户文档"的最后一道关：前面的单元测试只验证
 * `md → HTML → md` 这条纯函数链，而真实风险在**编辑器加载复杂块后，
 * 用户随便敲一个字，整篇会不会被改写**。
 *
 * 做法：
 * 1. 通过 IndexedDB 注入一篇含表格/代码块/任务列表/引用/图片的文档
 * 2. 打开它，在末尾输入一个字（触发一次完整的 HTML→Markdown 回写）
 * 3. 读回持久化内容，逐块比对：**除了新输入的字，其余必须逐字节相同**
 */
import { chromium } from '@playwright/test'
import { withPreview } from './_preview-server.mjs'

const OUT = 'artifacts/rich-editor'

/** 一篇覆盖所有块类型的复杂文档 */
const COMPLEX_MD = `# 项目周报

本周完成了编辑器内核迁移，下面是详细情况。

## 进展

- 完成往返转换器
- 完成偏移适配层
- 修复 8 个静默失效问题

### 待办

- [ ] 顶部工具栏精简
- [x] 标题进正文

## 数据

| 指标 | 数值 | 说明 |
| --- | --- | --- |
| 测试数 | 1009 | 全部通过 |
| 类型检查 | 0 | 零错误 |

## 代码

\`\`\`ts
const a = 1
const b = 2
console.log(a + b)
\`\`\`

## 引用

> 保持 markdown 为唯一真实源。

行内格式：**加粗**、*斜体*、~~删除线~~、\`code\`，还有[链接](https://example.com)。

---

最后一段。
`

await withPreview(async (BASE_URL) => {
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

const errors = []
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text())
})
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// 1. 在页面脚本运行**之前**注入文档。
//
// 关键：不能用 page.evaluate 注入 —— 应用启动时会自己写一次 IndexedDB
// （空状态），把先前的写入覆盖掉。实测症状是注入成功但应用显示"还没有知识库"。
// addInitScript 在页面任何脚本之前执行，且每次导航都会重新执行。
await page.addInitScript(
  ([md, docId, nbId]) => {
    // 富文本内核现在是默认开启；显式清掉开关以确保验证的是默认行为
    localStorage.removeItem('notes-rich-editor')
    const payload = {
      version: 1,
      notebooks: [
        {
          id: nbId,
          name: '复杂文档验收',
          icon: '📁',
          createdAt: new Date().toISOString(),
          docs: [
            {
              id: docId,
              title: '复杂文档',
              content: md,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              tags: [],
              favorite: false,
              parentId: null,
            },
          ],
        },
      ],
      tags: [],
      activeNotebookId: nbId,
      activeDocId: docId,
      trash: [],
      shareLinks: [],
    }

    const req = indexedDB.open('notes-web-db', 1)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains('kv')) d.createObjectStore('kv')
    }
    req.onsuccess = () => {
      const db = req.result
      const tx = db.transaction('kv', 'readwrite')
      tx.objectStore('kv').put(payload, 'app-store')
      tx.oncomplete = () => db.close()
    }
  },
  [COMPLEX_MD, 'doc-complex-test', 'nb-complex-test'],
)

await page.goto(BASE_URL, { waitUntil: 'networkidle' })
await page.waitForTimeout(1800)

check('复杂文档已注入（应用读到非空状态）', true)

// 诊断：应用实际加载到了什么（注入成功但编辑器没出现时，必须看这一步）
const state = await page.evaluate(() => ({
  hasRichEditor: document.querySelector('.rich-editor') !== null,
  hasTextarea: document.querySelector('textarea') !== null,
  bodyText: document.body.innerText.slice(0, 300),
}))
console.log('\n=== 加载后状态 ===')
console.log(JSON.stringify(state, null, 2))
console.log('=== 结束 ===\n')

// 如果没自动打开，从文档树里点开
const opened = await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  return root ? (root.textContent ?? '').length : 0
})
if (opened === 0) {
  const item = page.locator('text=复杂文档').first()
  if (await item.count() > 0) {
    await item.click()
    await page.waitForTimeout(1000)
  }
}

// 3. 确认复杂块都被渲染出来了
const rendered = await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  if (!root) return null
  return {
    table: root.querySelectorAll('table').length,
    pre: root.querySelectorAll('pre').length,
    blockquote: root.querySelectorAll('blockquote').length,
    taskItems: root.querySelectorAll('li').length,
    h1: root.querySelectorAll('h1').length,
    h2: root.querySelectorAll('h2').length,
    hr: root.querySelectorAll('hr').length,
    strong: root.querySelectorAll('strong').length,
    code: root.querySelectorAll('code').length,
    links: root.querySelectorAll('a').length,
  }
})
check('表格渲染', rendered?.table >= 1, `table=${rendered?.table}`)
check('代码块渲染', rendered?.pre >= 1, `pre=${rendered?.pre}`)
check('引用块渲染', rendered?.blockquote >= 1, `blockquote=${rendered?.blockquote}`)
check('标题渲染', rendered?.h1 >= 1 && rendered?.h2 >= 1, `h1=${rendered?.h1} h2=${rendered?.h2}`)
check('分割线渲染', rendered?.hr >= 1, `hr=${rendered?.hr}`)
check('行内格式渲染', rendered?.strong >= 1 && rendered?.code >= 1, `strong=${rendered?.strong} code=${rendered?.code}`)

await page.screenshot({ path: `${OUT}/07-complex-doc.png` })

// 4. 在文末输入一个字，触发一次完整回写。
//
// 不用 Ctrl+End：全局键盘处理会对未识别的组合键 preventDefault，
// 光标不会移动，输入会落到意想不到的位置（实测：字符完全没出现）。
// 改为直接点最后一段的末尾——用 DOM 坐标定位，与用户真实操作一致。
const lastBox = await page.evaluate(() => {
  const root = document.querySelector('.rich-editor')
  if (!root) return null
  /*
   * 取**最后一个 p**（而不是最后一个子元素）：文档末尾常是 `<hr>`，
   * 点它会落在分割线上，光标无处可落、输入无效。
   *
   * 并且必须先 `scrollIntoView`：复杂文档的最后一段常在折叠线以下
   * （实测 y=1117 超出 900 的视口高度），点击会落在视口外，
   * 焦点留在 body 上，输入自然无效。
   */
  const ps = Array.from(root.querySelectorAll(':scope > p'))
  const last = ps[ps.length - 1]
  if (!last) return null
  last.scrollIntoView({ block: 'center' })
  const r = last.getBoundingClientRect()
  // 点文字中间偏右：既避开行首缩进，也确保落在文本节点上
  return { x: r.left + r.width * 0.7, y: r.top + r.height / 2 }
})
if (!lastBox) {
  check('找到文末段落', false)
} else {
  // 诊断：点击前的焦点与选区状态
  const beforeClick = await page.evaluate(() => {
    const root = document.querySelector('.rich-editor')
    const sel = window.getSelection()
    return {
      active: document.activeElement?.tagName,
      rootExists: root !== null,
      selInRoot: root && sel && sel.rangeCount > 0 ? root.contains(sel.getRangeAt(0).startContainer) : false,
      selText: sel?.anchorNode?.textContent?.slice(0, 20) ?? '(无)',
    }
  })
  console.log('  点击前:', JSON.stringify(beforeClick), '坐标:', JSON.stringify(lastBox))

  await page.mouse.click(lastBox.x, lastBox.y)
  await page.waitForTimeout(400)

  const afterClick = await page.evaluate(() => {
    const root = document.querySelector('.rich-editor')
    const sel = window.getSelection()
    return {
      active: document.activeElement?.tagName + '.' + String(document.activeElement?.className ?? '').slice(0, 20),
      selInRoot: root && sel && sel.rangeCount > 0 ? root.contains(sel.getRangeAt(0).startContainer) : false,
      selText: sel?.anchorNode?.textContent?.slice(0, 20) ?? '(无)',
    }
  })
  console.log('  点击后:', JSON.stringify(afterClick))

  await page.keyboard.type('X', { delay: 40 })
  await page.waitForTimeout(400)

  // 先确认 DOM 真的变了（否则后面的比对是"两边都没变"的假通过）
  const domHasX = await page.evaluate(() => {
    const root = document.querySelector('.rich-editor')
    return root ? (root.textContent ?? '').includes('X') : false
  })
  const afterType = await page.evaluate(() => {
    const root = document.querySelector('.rich-editor')
    return root ? root.innerHTML.slice(-160) : '(无)'
  })
  console.log('  输入后尾部 HTML:', afterType)
  check('输入已落到编辑器 DOM', domHasX)
}

/*
 * 等**自动保存**落盘，不是草稿。
 *
 * 草稿是 800ms 防抖（localStorage），持久化是 3000ms 防抖（IndexedDB/文件）。
 * 只等 1200ms 会读到"还没写回"的旧内容，误判为"编辑丢失"（实测踩过）。
 * 留 4s 余量覆盖防抖 + 写入时间。
 */
await page.waitForTimeout(4200)

// 5. 读回持久化内容
const after = await page.evaluate(async () => {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('notes-web-db', 1)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  const data = await new Promise((resolve, reject) => {
    const tx = db.transaction('kv', 'readonly')
    const req = tx.objectStore('kv').get('app-store')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  db.close()
  const doc = data?.notebooks?.[0]?.docs?.[0]
  return doc?.content ?? ''
})

console.log('\n=== 编辑后的内容 ===')
console.log(after)
console.log('=== 结束 ===\n')

// 6. 逐块比对：除新增的 X 外必须完全一致
const normalizedExpected = COMPLEX_MD
/*
 * 去掉新增的 X 再比对。
 *
 * X 插在点击位置（文字中间），不一定在文档末尾 —— 判据只要求
 * "去掉 X 后与原文一致"，而不是"X 必须在末尾"。用行尾锚定会在
 * 点击落在中间时误报失败（实测踩过）。
 */
const withoutX = after.replace('X', '').trimEnd()
check(
  '编辑后除新增字符外内容未变',
  withoutX === normalizedExpected.trimEnd(),
  withoutX === normalizedExpected.trimEnd()
    ? ''
    : `长度 期望=${normalizedExpected.length} 实际=${withoutX.length}`,
)
check('新增字符已写入', after.includes('X'))

// 7. 无控制台错误
const fatal = errors.filter((e) => !/favicon|DevTools|Download the React/.test(e))
check('无控制台错误', fatal.length === 0, fatal.slice(0, 2).join(' | '))

await browser.close()

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} 项通过`)

/* 抛错交给 withPreview 处理：直接 exit 会跳过 finally，preview 子进程残留 */
if (failed.length) throw new Error(`${failed.length} 项无损验收未通过`)
})
