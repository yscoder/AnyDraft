import { invoke } from '@tauri-apps/api/core'
import type { AppRuntime, ContentRepository } from '@any-draft/shared'
import { TauriRepository } from './repository'

interface RuntimeInfo {
  runtime: 'tauri'
  platform: string
}

interface OpenedWorkspace {
  rootName: string
  workspaceToken: string
}

async function verifyRuntime(): Promise<void> {
  const info = await invoke<RuntimeInfo>('get_runtime_info')
  if (info.runtime !== 'tauri') throw new Error('Tauri 运行时握手失败')
}

function repository(opened: OpenedWorkspace): ContentRepository {
  return new TauriRepository(opened.rootName, opened.workspaceToken)
}

class TauriRuntime implements AppRuntime {
  readonly kind = 'tauri' as const

  async initializeRepository() {
    await verifyRuntime()
    const opened = await invoke<OpenedWorkspace | null>('reopen_last_workspace')
    return opened
      ? { status: 'ready' as const, repository: repository(opened) }
      : { status: 'need-pick' as const }
  }

  canPickRepository(): boolean {
    return true
  }

  async pickRepository(): Promise<ContentRepository | null> {
    const opened = await invoke<OpenedWorkspace | null>('choose_workspace')
    return opened ? repository(opened) : null
  }

  grantRepositoryPermission(): Promise<ContentRepository | null> {
    return Promise.resolve(null)
  }

  canUseInternalStorage(): boolean {
    return false
  }

  openInternalStorage(): Promise<ContentRepository> {
    return Promise.reject(new Error('桌面端不提供 WebView 内置内容存储'))
  }

  async exportFile(suggestedName: string, blob: Blob): Promise<boolean> {
    return invoke('export_file', new Uint8Array(await blob.arrayBuffer()), {
      headers: {
        'x-suggested-name': encodeURIComponent(suggestedName),
      },
    })
  }
}

export function createRuntime(): AppRuntime {
  return new TauriRuntime()
}
