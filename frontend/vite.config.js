import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 本地开发时把 /api 代理到后端，省去跨域烦恼
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
