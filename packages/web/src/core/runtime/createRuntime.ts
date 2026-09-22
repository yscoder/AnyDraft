import type { AppRuntime, AppRuntimeKind } from '@any-draft/shared'
import { createRuntime as createSelectedRuntime } from '#app-runtime'

function runtimeKind(): AppRuntimeKind {
  const value = import.meta.env.VITE_APP_RUNTIME
  if (value === 'web' || value === 'tauri') return value
  throw new Error(`不支持的 VITE_APP_RUNTIME：${String(value)}`)
}

export async function createRuntime(): Promise<AppRuntime> {
  const expected = runtimeKind()
  const runtime = createSelectedRuntime()
  if (runtime.kind !== expected) {
    throw new Error(`运行时不匹配：期望 ${expected}，实际 ${runtime.kind}`)
  }
  return runtime
}
