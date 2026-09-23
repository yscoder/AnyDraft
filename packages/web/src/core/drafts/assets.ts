import type { RepoNode } from '@any-draft/shared'
import { baseNamePath, dirnamePath, joinPath } from '@/core/fs/fsa'
import { collectImageRefs } from '@/core/markdown/markdown'

export interface ReferencedImage {
  name: string
  node: RepoNode
}

function decodeImageRef(ref: string): string {
  try {
    return decodeURIComponent(ref).replace(/\\/g, '/')
  } catch {
    return ref.replace(/\\/g, '/')
  }
}

function resolveRelativePath(dirPath: string, ref: string): string | null {
  const parts = ref.startsWith('/') ? [] : dirPath.split('/').filter(Boolean)
  for (const part of ref.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return null
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  return parts.join('/')
}

/**
 * 找出当前 Markdown 实际引用的图片。
 *
 * 相对路径优先精确解析；只写文件名时优先同目录图片。最后保留原有的
 * basename 全局回退，兼容旧工作区里不带路径的图片引用。
 */
export function findReferencedImages(
  markdownPath: string,
  markdown: string,
  nodes: RepoNode[],
): ReferencedImage[] {
  const images = nodes.filter((node) => node.kind === 'image')
  const currentDir = dirnamePath(markdownPath)
  const picked = new Map<string, RepoNode>()

  for (const rawRef of collectImageRefs(markdown)) {
    const ref = decodeImageRef(rawRef)
    const name = baseNamePath(ref)
    if (!name || picked.has(name)) continue

    const exactPath = resolveRelativePath(currentDir, ref)
    const node =
      (exactPath ? images.find((image) => image.path === exactPath) : null) ??
      images.find((image) => image.path === joinPath(currentDir, name)) ??
      images.find((image) => baseNamePath(image.path) === name)
    if (node) picked.set(name, node)
  }

  return [...picked].map(([name, node]) => ({ name, node }))
}
