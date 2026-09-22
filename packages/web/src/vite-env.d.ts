/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_RUNTIME: 'web' | 'tauri'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
