/**
 * 在草稿正文里定位图片引用 —— 文件树点图片跳转用。
 */

import { lineReferencesImage } from '@/core/markdown/markdown'
import type { Draft } from '@any-draft/shared'

/** 找出正文里第一处引用该图片的行号（0-based），没有则返回 -1 */
function findEmbedLine(content: string, name: string): number {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lineReferencesImage(lines[i], name)) return i
  }
  return -1
}

export interface ImageLocation {
  /** 命中引用的草稿 */
  draft: Draft
  /** 0-based 行号 */
  line: number
}

/**
 * 找第一处引用该图片的草稿：当前草稿优先，其余按列表顺序。
 * 找到的不是当前草稿时，调用方需要先切过去再跳转。
 */
export function locateImage(
  drafts: Draft[],
  activeId: string,
  name: string,
): ImageLocation | null {
  const active = drafts.find((d) => d.id === activeId)
  const ordered = active
    ? [active, ...drafts.filter((d) => d !== active)]
    : drafts
  for (const draft of ordered) {
    const line = findEmbedLine(draft.content, name)
    if (line >= 0) return { draft, line }
  }
  return null
}
