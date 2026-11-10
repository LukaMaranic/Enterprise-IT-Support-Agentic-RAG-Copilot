import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: { usePolling: process.env.CHOKIDAR_USEPOLLING === 'true' },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (error) => console.error('[vite proxy]', error))
        },
      },
      '/docs': { target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8080' },
      '/openapi.json': { target: process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:8080' },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: true,
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
