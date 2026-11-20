import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SlashCommandMenu } from '@/components/editor/SlashCommandMenu'
import { SLASH_ITEMS } from '@/components/editor/slashItems'

/**
 * 斜杠菜单的图标位（.slash-icon）契约：
 * icon 字段是 ReactNode —— 有贴合件走 <IconXxx />，没有的走 24 视口内联 svg 或纯字形，
 * **不许回退成 emoji**（跨平台渲染漂移、不随主题变色，见 tests/unit/iconContract.test.ts）。
 */
describe('SlashCommandMenu 图标位', () => {
  it('每个词条都渲染图标，且图标位不含 emoji', () => {
    render(
      <SlashCommandMenu
        query=""
        items={SLASH_ITEMS}
        position={{ top: 0, left: 0 }}
        onRun={() => {}}
        onClose={() => {}}
      />,
    )

    const icons = document.querySelectorAll('.slash-icon')
    expect(icons.length).toBe(SLASH_ITEMS.length)

    const emoji = /\p{Extended_Pictographic}/u
    const offenders = Array.from(icons).filter((node) => emoji.test(node.textContent ?? ''))
    expect(offenders.map((node) => node.outerHTML)).toEqual([])

    // icon 组件与内联 svg 确实落地（而不是只剩文字）
    expect(document.querySelectorAll('.slash-icon svg').length).toBeGreaterThan(0)
    expect(screen.getByText('任务列表')).toBeTruthy()
    expect(screen.getByText('清除格式')).toBeTruthy()
  })
})
