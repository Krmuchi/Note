/**
 * 实机验收脚本的公共启动器。
 *
 * 两个验收脚本（交互检查、复杂文档无损检查）都需要一个跑着 dist 的
 * preview 服务。把起停逻辑收在这里，脚本本身只管断言 ——
 * 否则每加一个验收脚本都要复制一遍服务管理代码。
 *
 * 用法：
 *   const { withPreview } = await import('./_preview-server.mjs')
 *   await withPreview(async (baseUrl) => { ... })
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = Number(process.env.PREVIEW_PORT || 5215)
const BASE_URL = `http://127.0.0.1:${PORT}/`

/**
 * 起 preview → 跑回调 → 关服务。
 *
 * 若 PREVIEW_URL 已设置，则**复用外部服务**（便于调试时手动起服务、
 * 反复跑脚本而不用每次等启动）。
 */
export async function withPreview(fn) {
  if (process.env.PREVIEW_URL) {
    await fn(process.env.PREVIEW_URL)
    return
  }

  /*
   * 用 npx vite preview 而不是自己写静态服务：
   * dist 的 base 是 './'，vite preview 会按同样的规则处理路径与 MIME，
   * 自己写的简易服务容易在 MIME/SPA 回退上与真实环境不一致。
   */
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    shell: true,
  })

  /** 结束 preview（Windows 下 kill 只结束 shell，需 taskkill 连带子进程） */
  const stop = () => {
    child.kill()
    if (process.platform === 'win32' && child.pid) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    }
  }

  // 等端口就绪：轮询到能连通为止，最多 30s（首次启动要读 dist）
  let ready = false
  for (let i = 0; i < 60; i++) {
    await sleep(500)
    try {
      const res = await fetch(BASE_URL, { method: 'HEAD' })
      if (res.ok || res.status === 404) {
        ready = true
        break
      }
    } catch {
      // 还没起来，继续等
    }
  }

  if (!ready) {
    stop()
    console.error(`preview 服务在 30s 内未就绪：${BASE_URL}`)
    process.exitCode = 1
    return
  }

  try {
    await fn(BASE_URL)
  } catch (err) {
    // 断言失败：打印原因并标记失败退出码，但**不中断**服务清理
    console.error(`\n${err instanceof Error ? err.message : String(err)}`)
    process.exitCode = 1
  } finally {
    stop()
  }
}
