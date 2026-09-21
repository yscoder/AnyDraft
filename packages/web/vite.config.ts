import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';


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
};

function vendorChunk(id: string): string | undefined {
  const m = id.split('node_modules/').pop();
  if (!m) return undefined;
  const pkg = m.startsWith('@') ? m.split('/').slice(0, 2).join('/') : m.split('/')[0];
  for (const [group, pkgs] of Object.entries(VENDOR_GROUPS)) {
    if (pkgs.includes(pkg)) return group;
  }
  return undefined;
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // monorepo：@any-draft/shared 通过 workspace 符号链接解析到 packages/shared，
  // 开发服务器需要放行根目录；链接包保持源码形态、不做依赖预打包
  server: {
    port: 28080,
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
  },
  optimizeDeps: {
    exclude: ['@any-draft/shared'],
  },
  base: './',
  build: {
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules') ? vendorChunk(id) : undefined),
      },
    },
  },
});
