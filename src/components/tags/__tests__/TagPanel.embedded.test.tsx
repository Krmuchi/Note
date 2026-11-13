import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useNotesStore } from '@/store'
import TagPanel from '@/components/tags/TagPanel'

/**
 * 缺陷 1：侧栏「标签」视图的嵌入形态不得渲染全屏遮罩与死关闭按钮。
 * 旧实现嵌入时也套 .tag-panel-overlay（fixed 全屏 z-index 10000），把侧栏整个盖住，
 * 而嵌入模式没有 onClose，× 与遮罩点击全是死的，用户被锁死在标签页。
 */

beforeEach(() => {
  useNotesStore.setState({ tags: [], notebooks: [], activeNotebookId: '', activeDocId: '' })
})

describe('TagPanel 嵌入形态（缺陷 1）', () => {
  it('embedded：不渲染全屏遮罩与关闭按钮，内容直接可见', () => {
    const { container } = render(<TagPanel isOpen embedded />)
    expect(container.querySelector('.tag-panel-overlay')).toBeNull()
    expect(container.querySelector('.tag-panel-close')).toBeNull()
    expect(container.querySelector('.tag-panel-embedded')).not.toBeNull()
    expect(screen.getByText('标签管理')).toBeInTheDocument()
  })

  it('弹窗形态：保留遮罩、关闭按钮与 dialog 语义', () => {
    const { container } = render(<TagPanel isOpen onClose={() => {}} />)
    expect(container.querySelector('.tag-panel-overlay')).not.toBeNull()
    expect(screen.getByRole('button', { name: '关闭' })).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: '标签管理' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('isOpen=false 时不渲染', () => {
    const { container } = render(<TagPanel isOpen={false} embedded />)
    expect(container.querySelector('.tag-panel')).toBeNull()
  })
})
