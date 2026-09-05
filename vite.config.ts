import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    process.env.ANALYZE
      ? visualizer({ filename: 'dist/report.html', gzipSize: true, open: true })
      : undefined,
  ].filter(Boolean),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    open: false,
    strictPort: false,
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    cssMinify: 'esbuild',
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/zustand')) return 'zustand'
          if (id.includes('node_modules/jszip')) return 'jszip'
          if (id.includes('node_modules/immer')) return 'immer'
          // katex 单独分块（预览区静态依赖，单独缓存）
          if (id.includes('node_modules/katex')) return 'katex'
          // mermaid 通过动态 import 使用，不参与强制分块：
          // 保持其为纯异步 chunk，否则会被提升为入口预加载资源，3MB 体积拖慢首屏
          if (id.includes('node_modules/mermaid')) return undefined
          // 不再将所有 node_modules 兜底进 vendor：兜底会把仅异步使用的依赖
          // （mermaid 生态等）也并入首屏预加载，交由打包器按引用关系自动分块
          // markdown 渲染链路统一分块（react-markdown 及 unified 生态）
          if (
            id.includes('node_modules/react-markdown') ||
            /node_modules\/(remark|rehype|micromark|mdast|hast|unist|unified|vfile|nlcst)/.test(id) ||
            /node_modules\/(property-information|space-separated-tokens|comma-separated-tokens|decode-named-character-reference|character-entities|zwitch|trough|bail|is-plain-obj)/.test(id)
          ) {
            return 'markdown'
          }
          return undefined
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'zustand',
      'jszip',
      'immer',
      'remark-gfm',
      'remark-math',
      'rehype-katex',
    ],
    exclude: ['mermaid'],
  },
} satisfies UserConfig)