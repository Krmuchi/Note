// 导入 React 核心模块和 DOM 渲染模块
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
// 导入全局样式
import './index.css'
// 导入错误边界组件
import ErrorBoundary from './ErrorBoundary'

// 使用懒加载方式导入主应用组件，优化首屏加载性能
const App = lazy(() => import('./App.tsx'))

// 获取根 DOM 节点并渲染应用
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* 错误边界：捕获子组件的错误并显示备用 UI */}
    <ErrorBoundary>
      {/* Suspense：处理懒加载组件的加载状态 */}
      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: '16px', color: '#666' }}>
          加载中...
        </div>
      }>
        <App />
      </Suspense>
    </ErrorBoundary>
  </StrictMode>,
)