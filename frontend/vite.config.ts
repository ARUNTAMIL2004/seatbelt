/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Local dev only: forward /api to the FastAPI server so the browser never needs a hard-coded host/CORS.
  const apiTarget = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000'
  const proxy = { '/api': { target: apiTarget, changeOrigin: true } }

  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5173, proxy },
    preview: { port: 4173, proxy },
    build: {
      sourcemap: false,
      chunkSizeWarningLimit: 900,
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      env: { VITE_API_BASE_URL: process.env.TEST_API_BASE || '/api/v1', VITE_DEMO_MODE: 'false' },
      testTimeout: 20000,
    },
  }
})
