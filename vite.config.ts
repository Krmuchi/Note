import { defineConfig, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/zustand')) return 'zustand';
          if (id.includes('node_modules/marked')) return 'marked';
          if (id.includes('node_modules/dompurify')) return 'dompurify';
          if (id.includes('node_modules/jszip')) return 'jszip';
          if (id.includes('node_modules/immer')) return 'immer';
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    include: ['react', 'react-dom', 'zustand', 'marked', 'dompurify', 'jszip', 'immer'],
  },
} satisfies UserConfig)