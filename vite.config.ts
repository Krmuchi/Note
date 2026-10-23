import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { visualizer } from 'rollup-plugin-visualizer'

/*
 * 关于"项目路径含非 ASCII 字符"的历史说明（2026-10 更新）：
 *
 * 旧版 Vite（8.0.x，rolldown 原生绑定的早期版本）在含中文的项目路径下做依赖预构建
 * 会卡死在 "bundling dependencies"，dev server 端口已监听但任何请求都不响应，
 * 表现为白屏且无报错。当时的规避方式是"把项目放在纯 ASCII 路径下"。
 *
 * 实测（Vite 8.2.2 + rolldown 1.2.5，路径 D:\Data\Program\Note）：
 * dev server 约 0.9s 就绪，访问 / 返回 200 —— 该缺陷已不复现，无需再迁移目录。
 * 若将来升级 Vite 后重现白屏，优先怀疑这里，而不是应用代码。
 */
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
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    /*
     * 必须显式绑定 127.0.0.1。
     * Vite 默认只监听 IPv6 回环（::1），而 wait-on 的 tcp:5173 走 IPv4 探测，
     * 于是 dev:electron 永远等不到服务就绪；即使侥幸通过，Electron 加载
     * http://localhost:5173 也存在 IPv4/IPv6 歧义（本机 localhost 同时解析到
     * ::1 与 127.0.0.1）。表现就是启动后窗口一片白屏。
     * 绑定 IPv4 后，vite / wait-on / Electron 三处用的是同一个地址。
     */
    host: '127.0.0.1',
    port: 5173,
    open: false,
    strictPort: true,
    // 打包产物目录不参与文件监听：release/ 里有 18MB 的 Chromium 许可证 HTML，
    // 监听它既浪费资源也可能触发无意义的全量重载。
    // .pnpm-store/ 是项目内的 pnpm 仓库（两万多个文件），chokidar 会逐个建 fs.watch 监听，
    // 足以占满事件循环 —— dev server 端口已监听但任何请求都拿不到响应，表现同样是白屏。
    watch: {
      ignored: ['**/release/**', '**/dist/**', '**/.pnpm-store/**'],
    },
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
        /*
         * 分块必须用 Rolldown 的 advancedChunks.groups，而不是 Rollup 的 manualChunks。
         *
         * Vite 8 的打包器换成了 Rolldown，而 Rolldown **不支持** manualChunks ——
         * 传进去会被静默忽略，不报错、不警告。此前这里写的是 manualChunks 函数，
         * 表现为：无论如何调整规则，产物分块与 index.html 里的 modulepreload 都原样不变。
         *
         * 实测影响（本次修复的真实收益）：react/jsx-runtime 是每个 tsx 文件都会 import
         * 的共享模块，因为分块规则整体失效，它被并进了 markdown 链路所在的分块，
         * 于是入口静态依赖该分块 —— 630KB 的 markdown + KaTeX 在启动时就被 modulepreload，
         * 而默认视图是纯编辑模式，根本不渲染预览。规则生效后这两个分块只会在真正
         * 切到预览/分屏时才加载。
         *
         * test 用字符串片段匹配，避免 Windows 反斜杠路径上的正则转义差异。
         */
        codeSplitting: {
          groups: [
            // 优先级最高：React 本体 + jsx-runtime 必须同块，否则共享的 jsx-runtime
            // 会把任意分块（包括 markdown 分块）变成所有页面的公共依赖
            { name: 'react-vendor', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 100 },
            { name: 'zustand', test: /[\\/]node_modules[\\/]zustand[\\/]/, priority: 90 },
            { name: 'immer', test: /[\\/]node_modules[\\/]immer[\\/]/, priority: 90 },
            { name: 'jszip', test: /[\\/]node_modules[\\/]jszip[\\/]/, priority: 90 },
            // KaTeX 体积大且只在预览里出现，单独分块便于长期缓存
            { name: 'katex', test: /[\\/]node_modules[\\/]katex[\\/]/, priority: 80 },
            // markdown 渲染链路（react-markdown + unified 生态）统一分块
            {
              name: 'markdown',
              test: /[\\/]node_modules[\\/](react-markdown|remark-[^\\/]+|rehype-[^\\/]+|micromark[^\\/]*|mdast-[^\\/]+|hast-[^\\/]+|unist-[^\\/]+|unified|vfile[^\\/]*)[\\/]/,
              priority: 70,
            },
            /*
             * mermaid 刻意**不**建组。
             * 它由 `import('mermaid')` 按需加载，一旦被强制分组就会变成静态依赖，
             * 于是 3MB 的图表生态被写进 index.html 的 modulepreload —— 首屏直接背走。
             * 让它保持为纯异步 chunk，由打包器按引用关系自动切分。
             */
            /*
             * mermaid 刻意**不建组**。
             *
             * 试过：把它和 cytoscape/dagre 等生态合并成一个组，chunk 数从 116 降到 40，
             * 但**实测产生回归** —— 建组会把 mermaid 提升为静态依赖，于是 3MB 的
             * mermaid chunk 被写进 index.html 的 modulepreload，App 分块也静态 import 它，
             * 首屏预加载从 190KB 涨到 3.2MB。
             *
             * 碎块的代价只是一串异步请求（且只在真的渲染流程图时发生），
             * 远小于首屏多背 3MB。保持不建组，让打包器按引用关系自动切分。
             */
          ],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    /*
     * 只做"优先预构建"的提示，不启用 noDiscovery。
     *
     * 踩过的坑：启用 noDiscovery 后 Vite 只会预构建下面列出的包**本身**，
     * 不会处理子路径入口（如 react-dom/client）。它的 CJS 入口于是被浏览器直接加载，
     * 报 "does not provide an export named 'createRoot'"，应用启动即崩。
     * 保留自动发现，让 react-dom/client、react/jsx-runtime 这类子路径也被覆盖。
     */
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