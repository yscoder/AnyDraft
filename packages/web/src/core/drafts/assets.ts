import type { RepoNode } from '@any-draft/shared'
import { baseNamePath, dirnamePath, joinPath } from '@/core/fs/fsa'
import { collectImageSources } from '@/core/markdown/markdown'

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

export function resolveImageReference(
  markdownPath: string,
  rawRef: string,
  nodes: RepoNode[],
): RepoNode | null {
  const ref = decodeImageRef(rawRef)
  const name = baseNamePath(ref)
  if (!name) return null
  const images = nodes.filter((node) => node.kind === 'image')
  const currentDir = dirnamePath(markdownPath)
  const exactPath = resolveRelativePath(currentDir, ref)
  return (
    (exactPath ? images.find((image) => image.path === exactPath) : null) ??
    images.find((image) => image.path === joinPath(currentDir, name)) ??
    images.find((image) => baseNamePath(image.path) === name) ??
    null
  )
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
  const picked = new Map<string, RepoNode>()

  for (const rawRef of collectImageSources(markdown)) {
    if (/^(?:https?:)?\/\//i.test(rawRef) || /^(?:data|blob):/i.test(rawRef))
      continue
    const ref = decodeImageRef(rawRef)
    const name = baseNamePath(ref)
    if (!name || picked.has(name)) continue

    const node = resolveImageReference(markdownPath, rawRef, nodes)
    if (node) picked.set(name, node)
  }

  return [...picked].map(([name, node]) => ({ name, node }))
}

/** 清理扫描按完整路径计数；全局同名回退有歧义时保留所有可能的图片。 */
export function referencedImagePaths(
  markdownPath: string,
  markdown: string,
  nodes: RepoNode[],
): Set<string> {
  const byPath = new Map(
    nodes
      .filter((node) => node.kind === 'image')
      .map((node) => [node.path, node]),
  )
  const byName = new Map<string, string[]>()
  for (const path of byPath.keys()) {
    const name = baseNamePath(path)
    byName.set(name, [...(byName.get(name) ?? []), path])
  }
  const paths = new Set<string>()
  const currentDir = dirnamePath(markdownPath)
  for (const rawRef of collectImageSources(markdown)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(rawRef)) continue
    const ref = decodeImageRef(rawRef)
    const name = baseNamePath(ref)
    if (!name) continue
    const exact = resolveRelativePath(currentDir, ref)
    const local = joinPath(currentDir, name)
    if (exact && byPath.has(exact)) paths.add(exact)
    else if (byPath.has(local)) paths.add(local)
    else for (const path of byName.get(name) ?? []) paths.add(path)
  }
  return paths
}
