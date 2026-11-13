import { describe, it, expect, vi, beforeEach } from 'vitest'
import { lazy } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { LazyLoader } from '@/components/common/LazyLoader'

/**
 * 懒加载局部错误边界（缺陷 3）：
 * chunk / 渲染失败只坏该面板，不炸整个应用；提供「重试」与「重新加载应用」。
 * React.lazy 缓存 rejected promise —— 重试一次后仍失败时不再原地重试，引导整页重载。
 */

// 渲染即抛错的组件：模拟面板内部崩溃
function Boom(): never {
  throw new Error('boom-render')
}

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  // 边界会 console.error，静音以免污染测试输出
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('LazyLoader 局部错误边界', () => {
  it('子组件渲染崩溃时显示面板级错误兜底，而不是向上抛', () => {
    render(
      <LazyLoader>
        <Boom />
      </LazyLoader>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/boom-render/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重试' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新加载应用' })).toBeInTheDocument()
  })

  it('重试一次后仍失败：不再原地重试，明确引导整页重载', () => {
    render(
      <LazyLoader>
        <Boom />
      </LazyLoader>,
    )
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    // lazy/渲染错误会复发，第二次进入「重试无效」分支
    expect(screen.getByText(/重试无效/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重试' })).toBeNull()
    expect(screen.getByRole('button', { name: '重新加载应用' })).toBeInTheDocument()
  })

  it('React.lazy 的 import 被拒（chunk 加载失败）也被局部边界兜住', async () => {
    const Failing = lazy(() => Promise.reject(new Error('chunk-load-fail')))
    render(
      <LazyLoader>
        <Failing />
      </LazyLoader>,
    )
    // lazy rejection 在渲染期抛出，被边界捕获
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText(/chunk-load-fail/)).toBeInTheDocument()
  })

  it('正常子组件不受影响', () => {
    render(
      <LazyLoader>
        <div>面板内容</div>
      </LazyLoader>,
    )
    expect(screen.getByText('面板内容')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
