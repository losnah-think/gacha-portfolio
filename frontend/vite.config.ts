import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const publicBrowser = loadEnv(mode, process.cwd(), '').VITE_PUBLIC_BROWSER !== 'false';
  return {
  plugins: [react()],
  resolve: {
    alias: publicBrowser ? [{
      find: '@apps-in-toss/web-framework',
      replacement: fileURLToPath(new URL('./src/public-browser/tossSdk.ts', import.meta.url)),
    }] : [],
  },
  cacheDir: '.cache/vite',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: [],
    exclude: ['node_modules/**', 'dist/**', 'tests/**'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: !publicBrowser,
        secure: false,
      },
      '/toss': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        secure: false,
      },
    }
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'framer-motion',
      'lucide-react',
      'firebase/app',
      'firebase/auth',
      'firebase/firestore',
      'firebase/analytics',
      'react-markdown',
      'clsx',
      'tailwind-merge',
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core - 가장 자주 재사용되는 코드
          'react-vendor': ['react', 'react-dom'],

          // Firebase - 큰 라이브러리를 별도 청크로 분리
          'firebase-vendor': ['firebase/app', 'firebase/auth', 'firebase/firestore', 'firebase/storage'],

          // UI 라이브러리 - 애니메이션과 아이콘
          'ui-vendor': ['framer-motion', 'lucide-react'],

          // 유틸리티 라이브러리
          'utils-vendor': ['react-markdown', 'clsx', 'tailwind-merge'],
        },
      },
    },
    // 청크 크기 경고 임계값 상향 (이미 분리했으므로)
    chunkSizeWarningLimit: 600,
  },
  };
})
