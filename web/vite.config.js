import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// VITE_API_URL can come from the shell environment or a .env.development
// file (e.g. an ngrok tunnel URL). Shell env takes precedence.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 3000,
      proxy: {
        '/api': { target: env.VITE_API_URL || 'http://localhost:8081', changeOrigin: true }
      }
    },
    preview: { port: 3001 }
  }
})
