import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default {
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true,
    strictPort: true,
    allowedHosts: true,
    // 前后端联调：浏览器只访问前端端口，/api 在沙箱内转发到后端 8000，零 CORS
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true }
    }
  }
}
