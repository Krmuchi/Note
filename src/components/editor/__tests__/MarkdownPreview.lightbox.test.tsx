import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MarkdownPreview } from '@/components/editor/MarkdownPreview'

/**
 * 预览图片点击放大（lightbox）。
 *
 * 两个约束：① 大图沿用图片**原本的地址**（data: / file: / self 都是 CSP 允许的），
 * 不引入 blob:；② 键盘也要能开能关（Tab 到图片、Enter 打开、Esc 关闭）。
 */
const IMG = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

describe('MarkdownPreview 图片放大', () => {
  it('点击图片打开大图，点遮罩关闭', () => {
    render(<MarkdownPreview content={'![示意图](' + IMG + ')'} syncScroll={false} />)

    const img = screen.getByRole('button', { name: '放大查看：示意图' })
    fireEvent.click(img)

    const dialog = screen.getByRole('dialog')
    const big = dialog.querySelector('img') as HTMLImageElement
    // 用原本地址（CSP img-src 'self' data: file:），不是 blob:
    expect(big.getAttribute('src')).toBe(IMG)

    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('键盘 Enter 打开、Esc 关闭', () => {
    render(<MarkdownPreview content={'![示意图](' + IMG + ')'} syncScroll={false} />)
    const img = screen.getByRole('button', { name: '放大查看：示意图' })

    fireEvent.keyDown(img, { key: 'Enter' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('点击大图本身不关闭（要看清细节）', () => {
    render(<MarkdownPreview content={'![示意图](' + IMG + ')'} syncScroll={false} />)
    fireEvent.click(screen.getByRole('button', { name: '放大查看：示意图' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog.querySelector('img') as HTMLImageElement)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
