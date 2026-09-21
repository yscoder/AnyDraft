/**
 * File System Access API 实现的内容仓库 —— Web 端平台适配层。
 *
 * 用户通过 showDirectoryPicker 授权一个真实目录，此后所有草稿（.md）
 * 与图片都直接读写该目录下的真实文件，与磁盘完全同构。桌面端（Tauri）
 * 未来用原生文件系统实现同一个 ContentRepository 接口即可复用全部 UI。
 */

import type { ContentRepository, RepoNode, RepoNodeKind } from '@any-draft/shared';
import { safeFileName } from '@/core/transfer/exchange';
import { blobToDataUrl } from '@/core/image/images';

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const MARKDOWN_EXT = /\.(md|markdown)$/i;

/* ---------------- 路径工具（'/' 分隔的相对路径） ---------------- */

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name;
}

export function dirnamePath(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function baseNamePath(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? path : path.slice(i + 1);
}

/** data URL（base64）→ Blob，供写入文件 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const header = dataUrl.slice(5, comma);
  const mime = header.split(';')[0] || 'application/octet-stream';
  const payload = dataUrl.slice(comma + 1);
  const bin = atob(payload);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* ---------------- 环境探测与授权 ---------------- */

/** 是否具备「任意形式」的文件系统能力（目录选择器 或 OPFS，二者其一即可运行） */
export function canUseStorage(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

function directoryPicker(): ((options?: { id?: string; mode?: 'read' | 'readwrite'; startIn?: string }) => Promise<FileSystemDirectoryHandle>) | null {
  if (typeof window === 'undefined') return null;
  const picker = window.showDirectoryPicker;
  return typeof picker === 'function' ? picker : null;
}

/** 是否支持弹出「选择真实目录」的对话框（仅 Chromium 且有权限时才为 true） */
export function canPickDirectory(): boolean {
  return directoryPicker() !== null;
}

/** 取浏览器私有存储（OPFS）根目录 —— 目录选择器被禁用时的兜底 */
export async function getOpfsRoot(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory();
}

/** 带权限方法的句柄（lib.dom 未声明 queryPermission / requestPermission） */
type PermittedHandle = FileSystemDirectoryHandle & {
  queryPermission?: (desc: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (desc: { mode: 'readwrite' }) => Promise<PermissionState>;
};

/** 弹出目录选择器；用户取消返回 null */
export async function pickRootDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const picker = directoryPicker();
  if (!picker) return null;
  try {
    return await picker.call(window, { id: 'anydraft-root', mode: 'readwrite' });
  } catch {
    return null;
  }
}

export async function queryRootPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const query = (handle as PermittedHandle).queryPermission;
  if (!query) return true; // 不支持查询则放行，后续读写失败会暴露问题
  return (await query.call(handle, { mode: 'readwrite' })) === 'granted';
}

export async function requestRootPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const request = (handle as PermittedHandle).requestPermission;
  if (!request) return true;
  return (await request.call(handle, { mode: 'readwrite' })) === 'granted';
}

/* ---------------- 仓库实现 ---------------- */

/** 提供 entries() 迭代的目录句柄（避开 lib.dom 对异步迭代的差异） */
type DirectoryEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterableIterator<[string, FileSystemHandle]>;
};

function classifyFile(name: string): RepoNodeKind {
  if (MARKDOWN_EXT.test(name)) return 'markdown';
  if (IMAGE_EXT.test(name)) return 'image';
  return 'other';
}

/** 隐藏条目：'.' 开头（含 macOS 的 ._ 资源分叉）以及压缩包垃圾目录 */
function isHiddenEntry(name: string): boolean {
  return name.startsWith('.') || name === '__MACOSX';
}

export class FsaRepository implements ContentRepository {
  constructor(private readonly root: FileSystemDirectoryHandle) {}

  get rootName(): string {
    return this.root.name;
  }

  private split(path: string): { parent: string; name: string } {
    return { parent: dirnamePath(path), name: baseNamePath(path) };
  }

  private async dirHandle(path: string): Promise<FileSystemDirectoryHandle> {
    let dir = this.root;
    for (const seg of path.split('/').filter(Boolean)) dir = await dir.getDirectoryHandle(seg);
    return dir;
  }

  private async exists(dir: FileSystemDirectoryHandle, name: string, kind: 'file' | 'dir'): Promise<boolean> {
    try {
      if (kind === 'dir') await dir.getDirectoryHandle(name);
      else await dir.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  }

  /** 重名自动加序号：`名` → `名 2` → `名 3`（保留扩展名） */
  private async uniqueName(dirPath: string, desired: string, kind: 'file' | 'dir'): Promise<string> {
    const dir = await this.dirHandle(dirPath);
    const dot = desired.lastIndexOf('.');
    const stem = dot > 0 ? desired.slice(0, dot) : desired;
    const ext = dot > 0 ? desired.slice(dot) : '';
    let candidate = desired;
    for (let i = 2; ; i++) {
      if (!(await this.exists(dir, candidate, kind))) return candidate;
      candidate = `${stem} ${i}${ext}`;
    }
  }

  async list(): Promise<RepoNode[]> {
    const nodes: RepoNode[] = [];
    const walk = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      for await (const [name, handle] of (dir as DirectoryEntries).entries()) {
        if (isHiddenEntry(name)) continue;
        const path = joinPath(prefix, name);
        if (handle.kind === 'directory') {
          nodes.push({ kind: 'dir', name, path });
          await walk(handle as FileSystemDirectoryHandle, path);
        } else {
          const file = await (handle as FileSystemFileHandle).getFile();
          nodes.push({ kind: classifyFile(name), name, path, updatedAt: file.lastModified, size: file.size });
        }
      }
    };
    await walk(this.root, '');
    return nodes;
  }

  async readTextFile(path: string): Promise<string> {
    const { parent, name } = this.split(path);
    const fh = await (await this.dirHandle(parent)).getFileHandle(name);
    return (await fh.getFile()).text();
  }

  async writeTextFile(path: string, content: string): Promise<void> {
    const { parent, name } = this.split(path);
    const fh = await (await this.dirHandle(parent)).getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async createTextFile(dirPath: string, desiredName: string, content = ''): Promise<string> {
    const name = await this.uniqueName(dirPath, safeFileName(desiredName), 'file');
    const path = joinPath(dirPath, name);
    await this.writeTextFile(path, content);
    return path;
  }

  async createDirectory(dirPath: string, desiredName: string): Promise<string> {
    const name = await this.uniqueName(dirPath, safeFileName(desiredName), 'dir');
    await (await this.dirHandle(dirPath)).getDirectoryHandle(name, { create: true });
    return joinPath(dirPath, name);
  }

  async renameNode(path: string, newName: string): Promise<string> {
    const { parent, name } = this.split(path);
    const dir = await this.dirHandle(parent);

    let fileHandle: FileSystemFileHandle | null = null;
    try {
      fileHandle = await dir.getFileHandle(name);
    } catch {
      fileHandle = null;
    }

    let clean = safeFileName(newName);
    // Markdown 重命名时补回扩展名，避免改完不再是 md
    if (fileHandle && MARKDOWN_EXT.test(name) && !MARKDOWN_EXT.test(clean)) clean = `${clean}.md`;
    if (!clean || clean === name) return path;
    if (await this.exists(dir, clean, fileHandle ? 'file' : 'dir')) throw new Error(`「${clean}」已存在`);

    const newPath = joinPath(parent, clean);
    if (fileHandle) {
      const move = (fileHandle as FileSystemFileHandle & { move?: (newName: string) => Promise<void> }).move;
      if (move) {
        await move.call(fileHandle, clean);
      } else {
        // 兜底：写新删旧
        const target = await dir.getFileHandle(clean, { create: true });
        const writable = await target.createWritable();
        await writable.write(await fileHandle.getFile());
        await writable.close();
        await dir.removeEntry(name);
      }
    } else {
      // 目录：递归复制整棵子树后删除原目录（Chromium 未开放目录 move）
      const source = await dir.getDirectoryHandle(name);
      const target = await dir.getDirectoryHandle(clean, { create: true });
      await this.copyDir(source, target);
      await dir.removeEntry(name, { recursive: true });
    }
    return newPath;
  }

  private async copyDir(source: FileSystemDirectoryHandle, target: FileSystemDirectoryHandle): Promise<void> {
    for await (const [name, handle] of (source as DirectoryEntries).entries()) {
      if (handle.kind === 'file') {
        const file = await (handle as FileSystemFileHandle).getFile();
        const writable = await (await target.getFileHandle(name, { create: true })).createWritable();
        await writable.write(file);
        await writable.close();
      } else {
        const child = await target.getDirectoryHandle(name, { create: true });
        await this.copyDir(handle as FileSystemDirectoryHandle, child);
      }
    }
  }

  async removeNode(path: string): Promise<void> {
    const { parent, name } = this.split(path);
    await (await this.dirHandle(parent)).removeEntry(name, { recursive: true });
  }

  async createImageFile(dirPath: string, desiredName: string, blob: Blob): Promise<string> {
    let clean = safeFileName(desiredName);
    if (!IMAGE_EXT.test(clean)) {
      const ext = blob.type.split('/')[1] || 'png';
      clean = `${clean}.${ext}`;
    }
    const name = await this.uniqueName(dirPath, clean, 'file');
    const fh = await (await this.dirHandle(dirPath)).getFileHandle(name, { create: true });
    const writable = await fh.createWritable();
    await writable.write(blob);
    await writable.close();
    return joinPath(dirPath, name);
  }

  async readImageAsDataUrl(path: string): Promise<string> {
    const { parent, name } = this.split(path);
    const fh = await (await this.dirHandle(parent)).getFileHandle(name);
    return blobToDataUrl(await fh.getFile());
  }

  async imageUrl(path: string): Promise<string> {
    const { parent, name } = this.split(path);
    const fh = await (await this.dirHandle(parent)).getFileHandle(name);
    return URL.createObjectURL(await fh.getFile());
  }
}
