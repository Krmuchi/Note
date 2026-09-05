// 导入 React 核心模块和 DOM 渲染模块
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
// 导入全局样式
import './index.css'
// 导入错误边界组件
import ErrorBoundary from './ErrorBoundary'
// 导入骨架屏，作为懒加载主应用的加载占位
import { SidebarSkeleton, EditorSkeleton } from './components/common/Skeleton'

// 使用懒加载方式导入主应用组件，优化首屏加载性能
const App = lazy(() => import('./App.tsx'))

// 获取根 DOM 节点并渲染应用
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 错误边界：捕获子组件的错误并显示备用 UI */}
    <ErrorBoundary>
      {/* Suspense：处理懒加载组件的加载状态 */}
      <Suspense fallback={
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
          <SidebarSkeleton />
          <div style={{ flex: 1, minWidth: 0 }}>
            <EditorSkeleton />
          </div>
        </div>
      }>
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
)