import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import TagEditModal from '@/components/tags/TagEditModal'
import VersionTagModal from '@/components/version/VersionTagModal'
import CustomTemplateModal from '@/components/templates/CustomTemplateModal'

/**
 * 缺陷 4：子弹窗的 Esc 必须只关自己（capture + stopImmediatePropagation），
 * 不能穿透到全局 useKeyboard 的 Escape 链把整个父面板关掉 ——
 * 否则填了一半的标签/版本备注/模板内容会随父面板卸载一起丢失。
 *
 * 事件从 document.body 派发（真实应用里 keydown 目标是焦点元素而非 window），
 * 全局链监听器模拟为 window 上的 bubble 监听，且先于弹窗注册。
 */

beforeEach(() => {
  document.body.innerHTML = ''
})

function expectEscClosesOnlySelf(onClose: ReturnType<typeof vi.fn>): void {
  const globalEscape = vi.fn()
  window.addEventListener('keydown', globalEscape)
  fireEvent.keyDown(document.body, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
  expect(globalEscape).not.toHaveBeenCalled()
  window.removeEventListener('keydown', globalEscape)
}

describe('子弹窗 Esc 只关自己（缺陷 4）', () => {
  it('TagEditModal', () => {
    const onClose = vi.fn()
    render(<TagEditModal onClose={onClose} availableTags={[]} />)
    expectEscClosesOnlySelf(onClose)
  })

  it('VersionTagModal', () => {
    const onClose = vi.fn()
    render(
      <VersionTagModal
        versionTag=""
        versionComment=""
        onVersionTagChange={vi.fn()}
        onVersionCommentChange={vi.fn()}
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    )
    expectEscClosesOnlySelf(onClose)
  })

  it('CustomTemplateModal', () => {
    const onClose = vi.fn()
    render(<CustomTemplateModal isOpen onClose={onClose} onSave={vi.fn()} />)
    expectEscClosesOnlySelf(onClose)
  })

  it('CustomTemplateModal 关闭时不挂 Esc 监听', () => {
    const onClose = vi.fn()
    render(<CustomTemplateModal isOpen={false} onClose={onClose} onSave={vi.fn()} />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })
})
