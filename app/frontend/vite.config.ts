import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 后端地址：默认指向真实数据实例（8000）。
// 若要对着 demo 库演示，启动 dev 前设置 VITE_API_TARGET=http://127.0.0.1:8001
const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 显式绑定 IPv4：Windows 上 localhost 会优先解析成 ::1，
    // 只绑 ::1 时用 127.0.0.1 访问会被拒（实测过）。
    host: '127.0.0.1',
    port: 5173,
    // Vite dev proxy：前端直接请求 /api/v1/*，免 CORS（见 docs/plan-frontend.md 第二节）
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // 把体积大的第三方库拆出去（recharts 占大头），避免单个 chunk 过大
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
