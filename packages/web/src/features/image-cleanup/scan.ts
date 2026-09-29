import type { ContentRepository, RepoNode } from '@any-draft/shared'
import { referencedImagePaths } from '@/core/drafts/assets'

export interface CleanupScan {
  unused: RepoNode[]
  markdownCount: number
}

export async function scanUnusedImages(
  repo: ContentRepository,
  overlays: Record<string, string>,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean = () => false,
): Promise<CleanupScan | null> {
  const nodes = await repo.list()
  const markdownFiles = nodes.filter((node) => node.kind === 'markdown')
  const imageFiles = nodes.filter((node) => node.kind === 'image')
  const referenced = new Set<string>()
  onProgress(0, markdownFiles.length)
  for (const [index, file] of markdownFiles.entries()) {
    if (isCancelled()) return null
    let content: string
    try {
      content = overlays[file.path] ?? (await repo.readTextFile(file.path))
    } catch {
      throw new Error(`无法读取「${file.path}」，清理已停止`)
    }
    if (isCancelled()) return null
    for (const path of referencedImagePaths(file.path, content, imageFiles))
      referenced.add(path)
    onProgress(index + 1, markdownFiles.length)
  }
  return {
    unused: imageFiles
      .filter((node) => !referenced.has(node.path))
      .sort((a, b) => a.path.localeCompare(b.path, 'zh')),
    markdownCount: markdownFiles.length,
  }
}
