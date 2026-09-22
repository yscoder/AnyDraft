import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const VENDOR_GROUPS: Record<string, string[]> = {
  react: ['react', 'react-dom', 'scheduler'],
  icons: ['lucide-react'],
  codemirror: [
    '@codemirror/state',
    '@codemirror/view',
    '@codemirror/commands',
    '@codemirror/search',
    '@codemirror/autocomplete',
    '@codemirror/language',
    '@codemirror/lang-markdown',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    '@lezer/markdown',
    'style-mod',
    'w3c-keyname',
    'crelt',
  ],
  markdown: [
    'markdown-it',
    'markdown-it-footnote',
    'markdown-it-mark',
    'linkify-it',
    'mdurl',
    'uc.micro',
    'entities',
    'punycode.js',
  ],
}

function vendorChunk(id: string): string | undefined {
  const m = id.split('node_modules/').pop()
  if (!m) return undefined
  const pkg = m.startsWith('@')
    ? m.split('/').slice(0, 2).join('/')
    : m.split('/')[0]
  for (const [group, pkgs] of Object.entries(VENDOR_GROUPS)) {
    if (pkgs.includes(pkg)) return group
  }
  return undefined
}

export default defineConfig(({ mode }) => {
  const runtime = mode === 'tauri' ? 'tauri' : 'web'
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_APP_RUNTIME': JSON.stringify(runtime),
    },
    resolve: {
      alias: [
        {
          find: '#app-runtime',
          replacement:
            runtime === 'tauri'
              ? path.resolve(__dirname, '../desktop/src/runtime.ts')
              : path.resolve(__dirname, './src/core/runtime/browserRuntime.ts'),
        },
        { find: '@', replacement: path.resolve(__dirname, './src') },
      ],
    },
    // monorepo：workspace 包以源码形式解析，开发服务器需放行仓库根目录。
    server: {
      port: 28080,
      strictPort: true,
      fs: {
        allow: [path.resolve(__dirname, '../..')],
      },
    },
    optimizeDeps: {
      exclude: ['@any-draft/shared', '@any-draft/desktop'],
    },
    base: './',
    build: {
      chunkSizeWarningLimit: 400,
      rollupOptions: {
        output: {
          manualChunks: (id) =>
            id.includes('node_modules') ? vendorChunk(id) : undefined,
        },
      },
    },
  }
})
