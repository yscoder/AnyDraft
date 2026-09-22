import { invoke } from '@tauri-apps/api/core'
import type { ContentRepository, RepoNode } from '@any-draft/shared'

function mimeFromPath(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  const byExtension: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    avif: 'image/avif',
  }
  return byExtension[ext] ?? 'application/octet-stream'
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(blob)
  })
}

export class TauriRepository implements ContentRepository {
  private readonly writeQueues = new Map<string, Promise<void>>()

  constructor(
    readonly rootName: string,
    private readonly workspaceToken: string,
  ) {}

  list(): Promise<RepoNode[]> {
    return invoke('list_nodes', { workspaceToken: this.workspaceToken })
  }

  readTextFile(path: string): Promise<string> {
    return invoke('read_text_file', {
      path,
      workspaceToken: this.workspaceToken,
    })
  }

  writeTextFile(path: string, content: string): Promise<void> {
    const previous = this.writeQueues.get(path) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(() =>
        invoke<void>('write_text_file', {
          path,
          content,
          workspaceToken: this.workspaceToken,
        }),
      )
    this.writeQueues.set(path, next)
    void next.then(
      () => {
        if (this.writeQueues.get(path) === next) this.writeQueues.delete(path)
      },
      () => {
        if (this.writeQueues.get(path) === next) this.writeQueues.delete(path)
      },
    )
    return next
  }

  createTextFile(
    dirPath: string,
    desiredName: string,
    content = '',
  ): Promise<string> {
    return invoke('create_text_file', {
      dirPath,
      desiredName,
      content,
      workspaceToken: this.workspaceToken,
    })
  }

  createDirectory(dirPath: string, desiredName: string): Promise<string> {
    return invoke('create_directory', {
      dirPath,
      desiredName,
      workspaceToken: this.workspaceToken,
    })
  }

  renameNode(path: string, newName: string): Promise<string> {
    return invoke('rename_node', {
      path,
      newName,
      workspaceToken: this.workspaceToken,
    })
  }

  removeNode(path: string): Promise<void> {
    return invoke('remove_node', {
      path,
      workspaceToken: this.workspaceToken,
    })
  }

  async createImageFile(
    dirPath: string,
    desiredName: string,
    blob: Blob,
  ): Promise<string> {
    return invoke(
      'create_image_file',
      new Uint8Array(await blob.arrayBuffer()),
      {
        headers: {
          'x-dir-path': encodeURIComponent(dirPath),
          'x-desired-name': encodeURIComponent(desiredName),
          'x-content-type': encodeURIComponent(blob.type),
          'x-workspace-token': this.workspaceToken,
        },
      },
    )
  }

  async readImageAsDataUrl(path: string): Promise<string> {
    return blobToDataUrl(await this.readImageBlob(path))
  }

  async imageUrl(path: string): Promise<string> {
    return URL.createObjectURL(await this.readImageBlob(path))
  }

  private async readImageBlob(path: string): Promise<Blob> {
    const response = await invoke<ArrayBuffer>('read_file_bytes', {
      path,
      workspaceToken: this.workspaceToken,
    })
    return new Blob([response], { type: mimeFromPath(path) })
  }
}
