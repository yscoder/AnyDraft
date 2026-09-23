/**
 * 在草稿正文里定位图片引用 —— 文件树点图片跳转用。
 */

import { lineReferencesImage } from '@/core/markdown/markdown'
/** 找出正文里第一处引用该图片的行号（0-based），没有则返回 null */
export function locateImage(content: string, name: string): number | null {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lineReferencesImage(lines[i], name)) return i
  }
  return null
}
