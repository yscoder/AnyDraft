import type { RepoNode } from '@any-draft/shared'
import { resolveImageReference } from '@/core/drafts/assets'
import { collectImageSources } from '@/core/markdown/markdown'
import { parseArticle } from '@/core/markdown/frontmatter'

export interface CopyWarning {
  category: '标题' | '字数' | '链接' | '图片' | '内容'
  message: string
}

function isExternalImage(src: string): boolean {
  return /^(?:https?:)?\/\//i.test(src) || /^(?:data|blob):/i.test(src)
}

function validLink(href: string): boolean {
  if (href.startsWith('#')) return true
  if (/^(?:mailto|tel):/i.test(href))
    return href.slice(href.indexOf(':') + 1).trim().length > 0
  if (!/^https?:\/\//i.test(href)) return false
  try {
    return Boolean(new URL(href).hostname)
  } catch {
    return false
  }
}

export function checkBeforeCopy(
  markdown: string,
  body: string,
  markdownPath: string,
  nodes: RepoNode[],
  unreadableImages: string[] = [],
): CopyWarning[] {
  const warnings: CopyWarning[] = []
  const document = new DOMParser().parseFromString(body, 'text/html')
  const headingCount = document.body.querySelectorAll('h1').length
  if (headingCount > 1)
    warnings.push({
      category: '标题',
      message: `正文有 ${headingCount} 个一级标题，建议只保留一个。`,
    })

  const charCount = parseArticle(markdown).body.replace(/\s/g, '').length
  if (charCount >= 20000)
    warnings.push({
      category: '字数',
      message: `当前约 ${charCount} 字，已达到或超过公众号 20,000 字提醒线。`,
    })
  else if (charCount >= 18000)
    warnings.push({
      category: '字数',
      message: `当前约 ${charCount} 字，接近公众号 20,000 字提醒线。`,
    })

  const checkedLinks = new Set<string>()
  for (const link of document.body.querySelectorAll('a')) {
    const href = (link.getAttribute('href') ?? '').trim()
    if (checkedLinks.has(href)) continue
    checkedLinks.add(href)
    if (!validLink(href))
      warnings.push({
        category: '链接',
        message: `链接地址「${href || '空地址'}」可能无法正常打开，请核对。`,
      })
  }

  const checkedImages = new Set<string>()
  for (const src of collectImageSources(markdown)) {
    if (!src || isExternalImage(src) || checkedImages.has(src)) continue
    checkedImages.add(src)
    const node = resolveImageReference(markdownPath, src, nodes)
    if (!node)
      warnings.push({
        category: '图片',
        message: `本地图片「${src}」不存在，复制后会显示占位提示。`,
      })
  }
  for (const name of unreadableImages)
    warnings.push({
      category: '图片',
      message: `本地图片「${name}」读取失败，复制后会显示占位提示。`,
    })
  for (const image of document.body.querySelectorAll('img')) {
    const src = image.getAttribute('src') ?? ''
    if (!isExternalImage(src))
      warnings.push({
        category: '图片',
        message: `HTML 图片「${src || '空地址'}」不会自动嵌入剪贴板，建议改用 Markdown 图片语法。`,
      })
  }

  for (const element of document.body.querySelectorAll('pre, code'))
    element.remove()
  if (!document.body.textContent?.trim() && !document.body.querySelector('img'))
    warnings.push({
      category: '内容',
      message: '正文为空，请确认是否要复制。',
    })
  if (/\b(?:TODO|TBD)\b|待补充/i.test(document.body.textContent ?? ''))
    warnings.push({
      category: '内容',
      message: '正文中有 TODO、TBD 或“待补充”，请确认是否需要完成。',
    })
  return warnings
}
