import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  remoteImageUrls,
  warnRemainingRemoteImages,
  localizeRemoteImages,
} from '@/hooks/useEditorFormatting'
import { subscribeToast } from '@/services/toast'

/**
 * P0-2：外链图片的识别、转存与"转存失败必须告知"。
 *
 * 应用 CSP 是 img-src 'self' data: file: —— 外链图片永远渲染不出来，
 * 而 Electron 里 fetch 外链还会被 connect-src 'self' 拦掉。
 * 这三件事连起来的唯一出口就是：**失败要如实说，并给出可执行的做法**。
 */
describe('remoteImageUrls', () => {
  it('只取 Markdown 图片外链，去重', () => {
    const md = [
      '![一](https://a.com/1.png)',
      '![二](https://b.com/2.jpg)',
      '![重复](https://a.com/1.png)',
      '[普通链接](https://c.com/page)',
      '![本地](file:///D:/img/local.png)',
      '![内联](data:image/png;base64,AAA)',
    ].join('\n')

    expect(remoteImageUrls(md)).toEqual(['https://a.com/1.png', 'https://b.com/2.jpg'])
  })

  it('没有外链图片时返回空数组', () => {
    expect(remoteImageUrls('纯文字，没有任何图片')).toEqual([])
  })
})

describe('warnRemainingRemoteImages（失败必须告知）', () => {
  it('没有失败时不打扰用户', () => {
    const received: string[] = []
    const off = subscribeToast((m) => {
      received.push(m.message)
      return 't'
    })
    try {
      warnRemainingRemoteImages([])
      expect(received).toEqual([])
    } finally {
      off()
    }
  })

  it('有失败时给出数量 + 可执行做法', () => {
    const received: { type: string; message: string }[] = []
    const off = subscribeToast((m) => {
      received.push({ type: m.type, message: m.message })
      return 't'
    })
    try {
      warnRemainingRemoteImages(['https://a.com/1.png', 'https://b.com/2.jpg'])
      expect(received).toHaveLength(1)
      expect(received[0].type).toBe('warning')
      expect(received[0].message).toContain('2 张')
      expect(received[0].message).toContain('下载')
    } finally {
      off()
    }
  })
})

describe('localizeRemoteImages（Electron 下 fetch 被 CSP 拦掉的真实路径）', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetch 抛错时记为失败、不产出替换', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    const result = await localizeRemoteImages('![图](https://a.com/1.png)')
    expect(result.replacements).toEqual([])
    expect(result.failed).toEqual(['https://a.com/1.png'])
  })

  it('非 2xx 响应同样记为失败', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    const result = await localizeRemoteImages('![图](https://a.com/missing.png)')
    expect(result.failed).toEqual(['https://a.com/missing.png'])
  })

  it('没有外链图片时不做任何网络请求', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await localizeRemoteImages('纯文字')
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result).toEqual({ replacements: [], failed: [] })
  })
})
