import type { AppRuntime, ContentRepository } from '@any-draft/shared'
import {
  canPickDirectory,
  canUseStorage,
  FsaRepository,
  getOpfsRoot,
  pickRootDirectory,
  queryRootPermission,
  requestRootPermission,
} from '@/core/fs/fsa'
import { loadRootHandle, saveRootHandle } from '@/core/fs/handleStore'

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

class BrowserRuntime implements AppRuntime {
  readonly kind = 'web' as const
  private pendingHandle: FileSystemDirectoryHandle | null = null

  private async repository(
    handle: FileSystemDirectoryHandle,
  ): Promise<ContentRepository> {
    await saveRootHandle(handle)
    return new FsaRepository(handle)
  }

  async initializeRepository() {
    if (!canUseStorage()) return { status: 'unsupported' as const }
    const handle = await loadRootHandle()
    if (!handle) return { status: 'need-pick' as const }
    if (await queryRootPermission(handle)) {
      return {
        status: 'ready' as const,
        repository: await this.repository(handle),
      }
    }
    this.pendingHandle = handle
    return {
      status: 'need-permission' as const,
      rootName: handle.name,
    }
  }

  canPickRepository(): boolean {
    return canPickDirectory()
  }

  async pickRepository(): Promise<ContentRepository | null> {
    const handle = await pickRootDirectory()
    if (!handle) return null
    this.pendingHandle = null
    return this.repository(handle)
  }

  async grantRepositoryPermission(): Promise<ContentRepository | null> {
    const handle = this.pendingHandle
    if (!handle || !(await requestRootPermission(handle))) return null
    this.pendingHandle = null
    return this.repository(handle)
  }

  canUseInternalStorage(): boolean {
    return canUseStorage()
  }

  async openInternalStorage(): Promise<ContentRepository> {
    return this.repository(await getOpfsRoot())
  }

  async exportFile(suggestedName: string, blob: Blob): Promise<boolean> {
    downloadBlob(suggestedName, blob)
    return true
  }
}

export function createRuntime(): AppRuntime {
  return new BrowserRuntime()
}
