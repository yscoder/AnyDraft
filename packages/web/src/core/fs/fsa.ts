/**
 * File System Access API 实现的内容仓库 —— Web 端平台适配层。
 *
 * 用户通过 showDirectoryPicker 授权一个真实目录，此后所有草稿（.md）
 * 与图片都直接读写该目录下的真实文件，与磁盘完全同构。桌面端（Tauri）
 * 用原生文件系统实现同一个 ContentRepository 接口并复用全部 UI。
 */

import type {
  ContentRepository,
  RepoNode,
  RepoNodeKind,
  TrashEntry,
} from '@any-draft/shared'
import { safeFileName } from '@/core/transfer/exchange'
import { blobToDataUrl } from '@/core/image/images'

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i
const MARKDOWN_EXT = /\.(md|markdown)$/i

/* ---------------- 路径工具（'/' 分隔的相对路径） ---------------- */

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

export function dirnamePath(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

export function baseNamePath(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}

/** data URL（base64）→ Blob，供写入文件 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const header = dataUrl.slice(5, comma)
  const mime = header.split(';')[0] || 'application/octet-stream'
  const payload = dataUrl.slice(comma + 1)
  const bin = atob(payload)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/* ---------------- 环境探测与授权 ---------------- */

/** 是否具备「任意形式」的文件系统能力（目录选择器 或 OPFS，二者其一即可运行） */
export function canUseStorage(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage?.getDirectory === 'function'
  )
}

function directoryPicker():
  | ((options?: {
      id?: string
      mode?: 'read' | 'readwrite'
      startIn?: string
    }) => Promise<FileSystemDirectoryHandle>)
  | null {
  if (typeof window === 'undefined') return null
  const picker = window.showDirectoryPicker
  return typeof picker === 'function' ? picker : null
}

/** 是否支持弹出「选择真实目录」的对话框（仅 Chromium 且有权限时才为 true） */
export function canPickDirectory(): boolean {
  return directoryPicker() !== null
}

/** 取浏览器私有存储（OPFS）根目录 —— 目录选择器被禁用时的兜底 */
export async function getOpfsRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory()
}

/** 带权限方法的句柄（lib.dom 未声明 queryPermission / requestPermission） */
type PermittedHandle = FileSystemDirectoryHandle & {
  queryPermission?: (desc: { mode: 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (desc: { mode: 'readwrite' }) => Promise<PermissionState>
}

/** 弹出目录选择器；用户取消返回 null */
export async function pickRootDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const picker = directoryPicker()
  if (!picker) return null
  try {
    return await picker.call(window, {
      id: 'anydraft-root',
      mode: 'readwrite',
    })
  } catch {
    return null
  }
}

export async function queryRootPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const query = (handle as PermittedHandle).queryPermission
  if (!query) return true // 不支持查询则放行，后续读写失败会暴露问题
  return (await query.call(handle, { mode: 'readwrite' })) === 'granted'
}

export async function requestRootPermission(
  handle: FileSystemDirectoryHandle,
): Promise<boolean> {
  const request = (handle as PermittedHandle).requestPermission
  if (!request) return true
  return (await request.call(handle, { mode: 'readwrite' })) === 'granted'
}

/* ---------------- 仓库实现 ---------------- */

/** 提供 entries() 迭代的目录句柄（避开 lib.dom 对异步迭代的差异） */
type DirectoryEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>
}

function classifyFile(name: string): RepoNodeKind {
  if (MARKDOWN_EXT.test(name)) return 'markdown'
  if (IMAGE_EXT.test(name)) return 'image'
  return 'other'
}

/** 隐藏条目：'.' 开头（含 macOS 的 ._ 资源分叉）以及压缩包垃圾目录 */
function isHiddenEntry(name: string): boolean {
  return name.startsWith('.') || name === '__MACOSX'
}

export class FsaRepository implements ContentRepository {
  private readonly writeQueues = new Map<string, Promise<void>>()
  private trashQueue: Promise<void> = Promise.resolve()

  constructor(private readonly root: FileSystemDirectoryHandle) {}

  get rootName(): string {
    return this.root.name
  }

  private split(path: string): { parent: string; name: string } {
    return { parent: dirnamePath(path), name: baseNamePath(path) }
  }

  private async dirHandle(path: string): Promise<FileSystemDirectoryHandle> {
    let dir = this.root
    for (const seg of path.split('/').filter(Boolean))
      dir = await dir.getDirectoryHandle(seg)
    return dir
  }

  private async exists(
    dir: FileSystemDirectoryHandle,
    name: string,
    kind: 'file' | 'dir',
  ): Promise<boolean> {
    try {
      if (kind === 'dir') await dir.getDirectoryHandle(name)
      else await dir.getFileHandle(name)
      return true
    } catch {
      return false
    }
  }

  private async entryExists(dir: FileSystemDirectoryHandle, name: string) {
    return (
      (await this.exists(dir, name, 'file')) ||
      (await this.exists(dir, name, 'dir'))
    )
  }

  /** 重名自动加序号：`名` → `名 2` → `名 3`（保留扩展名） */
  private async uniqueName(dirPath: string, desired: string): Promise<string> {
    const dir = await this.dirHandle(dirPath)
    const dot = desired.lastIndexOf('.')
    const stem = dot > 0 ? desired.slice(0, dot) : desired
    const ext = dot > 0 ? desired.slice(dot) : ''
    let candidate = desired
    for (let i = 2; ; i++) {
      if (!(await this.entryExists(dir, candidate))) return candidate
      candidate = `${stem} ${i}${ext}`
    }
  }

  async list(): Promise<RepoNode[]> {
    const nodes: RepoNode[] = []
    const walk = async (
      dir: FileSystemDirectoryHandle,
      prefix: string,
    ): Promise<void> => {
      for await (const [name, handle] of (dir as DirectoryEntries).entries()) {
        if (isHiddenEntry(name)) continue
        const path = joinPath(prefix, name)
        if (handle.kind === 'directory') {
          nodes.push({ kind: 'dir', name, path })
          await walk(handle as FileSystemDirectoryHandle, path)
        } else {
          const file = await (handle as FileSystemFileHandle).getFile()
          nodes.push({
            kind: classifyFile(name),
            name,
            path,
            updatedAt: file.lastModified,
            size: file.size,
          })
        }
      }
    }
    await walk(this.root, '')
    return nodes
  }

  async readTextFile(path: string): Promise<string> {
    const { parent, name } = this.split(path)
    const fh = await (await this.dirHandle(parent)).getFileHandle(name)
    return (await fh.getFile()).text()
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    const previous = this.writeQueues.get(path) ?? Promise.resolve()
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const { parent, name } = this.split(path)
        const fh = await (
          await this.dirHandle(parent)
        ).getFileHandle(name, { create: true })
        const writable = await fh.createWritable()
        await writable.write(content)
        await writable.close()
      })
    this.writeQueues.set(path, next)
    void next
      .finally(() => {
        if (this.writeQueues.get(path) === next) this.writeQueues.delete(path)
      })
      .catch(() => {})
    return next
  }

  async createTextFile(
    dirPath: string,
    desiredName: string,
    content = '',
  ): Promise<string> {
    const name = await this.uniqueName(dirPath, safeFileName(desiredName))
    const path = joinPath(dirPath, name)
    await this.writeTextFile(path, content)
    return path
  }

  async createDirectory(dirPath: string, desiredName: string): Promise<string> {
    const name = await this.uniqueName(dirPath, safeFileName(desiredName))
    await (
      await this.dirHandle(dirPath)
    ).getDirectoryHandle(name, { create: true })
    return joinPath(dirPath, name)
  }

  async renameNode(path: string, newName: string): Promise<string> {
    const { parent, name } = this.split(path)
    const dir = await this.dirHandle(parent)

    let fileHandle: FileSystemFileHandle | null = null
    try {
      fileHandle = await dir.getFileHandle(name)
    } catch {
      fileHandle = null
    }

    let clean = safeFileName(newName)
    // Markdown 重命名时补回扩展名，避免改完不再是 md
    if (fileHandle && MARKDOWN_EXT.test(name) && !MARKDOWN_EXT.test(clean))
      clean = `${clean}.md`
    if (!clean || clean === name) return path
    if (await this.exists(dir, clean, fileHandle ? 'file' : 'dir'))
      throw new Error(`「${clean}」已存在`)

    const newPath = joinPath(parent, clean)
    if (fileHandle) {
      const move = (
        fileHandle as FileSystemFileHandle & {
          move?: (newName: string) => Promise<void>
        }
      ).move
      if (move) {
        await move.call(fileHandle, clean)
      } else {
        // 兜底：写新删旧
        const target = await dir.getFileHandle(clean, { create: true })
        const writable = await target.createWritable()
        await writable.write(await fileHandle.getFile())
        await writable.close()
        await dir.removeEntry(name)
      }
    } else {
      // 目录：递归复制整棵子树后删除原目录（Chromium 未开放目录 move）
      const source = await dir.getDirectoryHandle(name)
      const target = await dir.getDirectoryHandle(clean, { create: true })
      await this.copyDir(source, target)
      await dir.removeEntry(name, { recursive: true })
    }
    return newPath
  }

  private async copyDir(
    source: FileSystemDirectoryHandle,
    target: FileSystemDirectoryHandle,
  ): Promise<void> {
    for await (const [name, handle] of (source as DirectoryEntries).entries()) {
      if (handle.kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile()
        const writable = await (
          await target.getFileHandle(name, { create: true })
        ).createWritable()
        await writable.write(file)
        await writable.close()
      } else {
        const child = await target.getDirectoryHandle(name, {
          create: true,
        })
        await this.copyDir(handle as FileSystemDirectoryHandle, child)
      }
    }
  }

  private async trashRoot(
    create: boolean,
  ): Promise<FileSystemDirectoryHandle | null> {
    try {
      const app = await this.root.getDirectoryHandle('.anydraft', { create })
      return await app.getDirectoryHandle('trash', { create })
    } catch (error) {
      if (
        !create &&
        error instanceof DOMException &&
        error.name === 'NotFoundError'
      )
        return null
      throw error
    }
  }

  private async withTrashLock<T>(run: () => Promise<T>): Promise<T> {
    const previous = this.trashQueue
    let release!: () => void
    this.trashQueue = new Promise<void>((resolve) => {
      release = resolve
    })
    await previous
    try {
      return await run()
    } finally {
      release()
    }
  }

  private validTrashEntry(value: unknown, id: string): value is TrashEntry {
    if (!value || typeof value !== 'object') return false
    const info = value as Partial<TrashEntry>
    return (
      info.id === id &&
      this.validUserPath(info.originalPath ?? '') &&
      info.name === baseNamePath(info.originalPath ?? '') &&
      ['dir', 'markdown', 'image', 'other'].includes(info.kind ?? '') &&
      typeof info.deletedAt === 'number' &&
      Number.isFinite(info.deletedAt)
    )
  }

  private async writeTrashIndex(
    trash: FileSystemDirectoryHandle,
    entries: TrashEntry[],
  ): Promise<void> {
    const file = await trash.getFileHandle('index.json', { create: true })
    const writable = await file.createWritable()
    await writable.write(JSON.stringify({ version: 1, entries }))
    await writable.close()
  }

  private async readTrashIndex(
    trash: FileSystemDirectoryHandle,
  ): Promise<TrashEntry[]> {
    let entries: TrashEntry[] = []
    try {
      const file = await trash.getFileHandle('index.json')
      const data = JSON.parse(await (await file.getFile()).text()) as {
        version?: unknown
        entries?: unknown
      }
      if (
        !data ||
        data.version !== 1 ||
        !Array.isArray(data.entries) ||
        data.entries.some(
          (entry) => !this.validTrashEntry(entry, (entry as TrashEntry)?.id),
        )
      )
        throw new Error('回收站索引已损坏')
      entries = data.entries
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'NotFoundError'))
        throw error
    }
    const active: TrashEntry[] = []
    for (const entry of entries) {
      try {
        const dir = await trash.getDirectoryHandle(entry.id)
        if (await this.entryExists(dir, 'item')) active.push(entry)
      } catch {
        /* 跳过已恢复或已删除的条目 */
      }
    }
    if (active.length !== entries.length)
      await this.writeTrashIndex(trash, active)
    return active
  }

  private async trashEntry(id: string): Promise<{
    dir: FileSystemDirectoryHandle
    info: TrashEntry
    entries: TrashEntry[]
    trash: FileSystemDirectoryHandle
  }> {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('无效的回收站条目')
    const trash = await this.trashRoot(false)
    if (!trash) throw new Error('回收站条目不存在')
    const entries = await this.readTrashIndex(trash)
    const info = entries.find((entry) => entry.id === id)
    if (!info) throw new Error('回收站条目不存在')
    const dir = await trash.getDirectoryHandle(id)
    return { dir, info, entries, trash }
  }

  private validUserPath(path: string): boolean {
    return (
      Boolean(path) &&
      path
        .split('/')
        .every(
          (part) =>
            part && part !== '.' && part !== '..' && !part.startsWith('.'),
        )
    )
  }

  async trashNode(path: string): Promise<void> {
    return this.withTrashLock(() => this.trashNodeUnlocked(path))
  }

  private async trashNodeUnlocked(path: string): Promise<void> {
    if (!this.validUserPath(path)) throw new Error('不能删除应用数据目录')
    await Promise.all(
      [...this.writeQueues.entries()]
        .filter(
          ([written]) => written === path || written.startsWith(`${path}/`),
        )
        .map(([, pending]) => pending),
    )
    const { parent, name } = this.split(path)
    const sourceParent = await this.dirHandle(parent)
    let kind: RepoNodeKind = 'dir'
    let sourceFile: FileSystemFileHandle | null = null
    try {
      sourceFile = await sourceParent.getFileHandle(name)
      kind = classifyFile(name)
    } catch {
      await sourceParent.getDirectoryHandle(name)
    }
    const trash = await this.trashRoot(true)
    if (!trash) throw new Error('无法创建回收站')
    const entries = await this.readTrashIndex(trash)
    const id = crypto.randomUUID()
    const dir = await trash.getDirectoryHandle(id, { create: true })
    if (sourceFile) {
      const target = await dir.getFileHandle('item', { create: true })
      const writable = await target.createWritable()
      await writable.write(await sourceFile.getFile())
      await writable.close()
    } else {
      await this.copyDir(
        await sourceParent.getDirectoryHandle(name),
        await dir.getDirectoryHandle('item', { create: true }),
      )
    }
    const info: TrashEntry = {
      id,
      originalPath: path,
      name,
      kind,
      deletedAt: Date.now(),
    }
    await this.writeTrashIndex(trash, [...entries, info])
    await sourceParent.removeEntry(name, { recursive: true })
  }

  async listTrash(): Promise<TrashEntry[]> {
    return this.withTrashLock(async () => {
      const trash = await this.trashRoot(false)
      if (!trash) return []
      return (await this.readTrashIndex(trash)).sort(
        (a, b) => b.deletedAt - a.deletedAt,
      )
    })
  }

  async listTrashNodes(id: string): Promise<RepoNode[]> {
    return this.withTrashLock(() => this.listTrashNodesUnlocked(id))
  }

  private async listTrashNodesUnlocked(id: string): Promise<RepoNode[]> {
    const { dir, info } = await this.trashEntry(id)
    if (info.kind !== 'dir') return []
    const nodes: RepoNode[] = []
    const walk = async (folder: FileSystemDirectoryHandle, prefix: string) => {
      for await (const [name, handle] of (
        folder as DirectoryEntries
      ).entries()) {
        if (isHiddenEntry(name)) continue
        const path = joinPath(prefix, name)
        if (handle.kind === 'directory') {
          nodes.push({ kind: 'dir', name, path })
          await walk(handle as FileSystemDirectoryHandle, path)
        } else {
          const file = await (handle as FileSystemFileHandle).getFile()
          nodes.push({
            kind: classifyFile(name),
            name,
            path,
            updatedAt: file.lastModified,
            size: file.size,
          })
        }
      }
    }
    await walk(await dir.getDirectoryHandle('item'), '')
    return nodes
  }

  async readTrashText(id: string, relativePath = ''): Promise<string> {
    return this.withTrashLock(() =>
      this.readTrashTextUnlocked(id, relativePath),
    )
  }

  private async readTrashTextUnlocked(
    id: string,
    relativePath: string,
  ): Promise<string> {
    const { dir, info } = await this.trashEntry(id)
    if (info.kind !== 'dir' && (relativePath || info.kind !== 'markdown'))
      throw new Error('不是 Markdown 文档')
    if (info.kind === 'dir' && !MARKDOWN_EXT.test(relativePath))
      throw new Error('不是 Markdown 文档')
    if (relativePath && !this.validUserPath(relativePath))
      throw new Error('无效的回收站路径')
    const parent =
      info.kind === 'dir' ? await dir.getDirectoryHandle('item') : dir
    const fullPath = info.kind === 'dir' ? relativePath : 'item'
    const folder =
      info.kind === 'dir'
        ? await this.dirWithin(parent, dirnamePath(fullPath))
        : parent
    return (
      await (await folder.getFileHandle(baseNamePath(fullPath))).getFile()
    ).text()
  }

  async trashImageUrl(id: string, relativePath: string): Promise<string> {
    return this.withTrashLock(() =>
      this.trashImageUrlUnlocked(id, relativePath),
    )
  }

  private async trashImageUrlUnlocked(
    id: string,
    relativePath: string,
  ): Promise<string> {
    const { dir, info } = await this.trashEntry(id)
    if (
      info.kind !== 'dir' ||
      !this.validUserPath(relativePath) ||
      !IMAGE_EXT.test(relativePath)
    )
      throw new Error('不是回收站图片')
    const root = await dir.getDirectoryHandle('item')
    const folder = await this.dirWithin(root, dirnamePath(relativePath))
    return URL.createObjectURL(
      await (await folder.getFileHandle(baseNamePath(relativePath))).getFile(),
    )
  }

  private async dirWithin(
    root: FileSystemDirectoryHandle,
    path: string,
  ): Promise<FileSystemDirectoryHandle> {
    let folder = root
    for (const part of path.split('/').filter(Boolean))
      folder = await folder.getDirectoryHandle(part)
    return folder
  }

  async restoreTrash(id: string): Promise<string> {
    return this.withTrashLock(() => this.restoreTrashUnlocked(id))
  }

  private async restoreTrashUnlocked(id: string): Promise<string> {
    const { dir, info, entries, trash } = await this.trashEntry(id)
    let parent = this.root
    for (const part of dirnamePath(info.originalPath)
      .split('/')
      .filter(Boolean))
      parent = await parent.getDirectoryHandle(part, { create: true })
    const name = await this.uniqueName(
      dirnamePath(info.originalPath),
      info.name,
    )
    if (info.kind === 'dir') {
      await this.copyDir(
        await dir.getDirectoryHandle('item'),
        await parent.getDirectoryHandle(name, { create: true }),
      )
    } else {
      const source = await dir.getFileHandle('item')
      const target = await parent.getFileHandle(name, { create: true })
      const writable = await target.createWritable()
      await writable.write(await source.getFile())
      await writable.close()
    }
    await trash.removeEntry(id, { recursive: true })
    await this.writeTrashIndex(
      trash,
      entries.filter((entry) => entry.id !== id),
    )
    return joinPath(dirnamePath(info.originalPath), name)
  }

  async removeTrash(id: string): Promise<void> {
    return this.withTrashLock(async () => {
      const { entries, trash } = await this.trashEntry(id)
      await trash.removeEntry(id, { recursive: true })
      await this.writeTrashIndex(
        trash,
        entries.filter((entry) => entry.id !== id),
      )
    })
  }

  async createImageFile(
    dirPath: string,
    desiredName: string,
    blob: Blob,
  ): Promise<string> {
    let clean = safeFileName(desiredName)
    if (!IMAGE_EXT.test(clean)) {
      const ext = blob.type.split('/')[1] || 'png'
      clean = `${clean}.${ext}`
    }
    const name = await this.uniqueName(dirPath, clean)
    const fh = await (
      await this.dirHandle(dirPath)
    ).getFileHandle(name, { create: true })
    const writable = await fh.createWritable()
    await writable.write(blob)
    await writable.close()
    return joinPath(dirPath, name)
  }

  async readImageAsDataUrl(path: string): Promise<string> {
    const { parent, name } = this.split(path)
    const fh = await (await this.dirHandle(parent)).getFileHandle(name)
    return blobToDataUrl(await fh.getFile())
  }

  async imageUrl(path: string): Promise<string> {
    const { parent, name } = this.split(path)
    const fh = await (await this.dirHandle(parent)).getFileHandle(name)
    return URL.createObjectURL(await fh.getFile())
  }
}
