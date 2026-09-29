import { useState } from 'react'
import type {
  AppRuntime,
  ContentRepository,
  Draft,
  RepoNode,
} from '@any-draft/shared'
import type { RefObject } from 'react'
import { ensureHighlighter, renderArticle } from '@/core/markdown/markdown'
import { copyRichText } from '@/core/transfer/clipboard'
import {
  createBackupZipBlob,
  createDraftMarkdownBlob,
  importFiles,
  safeFileName,
} from '@/core/transfer/exchange'
import { renderLongImage } from '@/core/transfer/longimage'
import { type Theme, type DensityScale } from '@/core/theme/theme'
import {
  findReferencedImages,
  type ReferencedImage,
} from '@/core/drafts/assets'
import { dataUrlToBlob } from '@/core/fs/fsa'
import { checkBeforeCopy, type CopyWarning } from './checkBeforeCopy'

interface DraftTransferOptions {
  markdown: string
  activeDraft: Draft | null
  activePath: string
  theme: Theme
  density: DensityScale
  referencedImages: ReferencedImage[]
  nodes: RepoNode[]
  runtimeRef: RefObject<AppRuntime | null>
  repoRef: RefObject<ContentRepository | null>
  runMutation: (fn: () => Promise<void>) => Promise<void>
  refreshRepo: () => Promise<RepoNode[]>
  openMarkdown: (path: string) => Promise<void>
  flash: (msg: string, kind?: 'success' | 'error' | 'warning' | 'info') => void
}

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export function useDraftTransfer({
  markdown,
  activeDraft,
  activePath,
  theme,
  density,
  referencedImages,
  nodes,
  runtimeRef,
  repoRef,
  runMutation,
  refreshRepo,
  openMarkdown,
  flash,
}: DraftTransferOptions) {
  const [exporting, setExporting] = useState(false)
  const [copying, setCopying] = useState(false)
  const [pendingCopy, setPendingCopy] = useState<{
    html: string
    warnings: CopyWarning[]
  } | null>(null)
  /* ---------------- 复制 / 导出 ---------------- */
  /** 把当前正文引用的图片换成 data URL（公众号剪贴板不接受 blob URL） */
  const resolveImageDataUrls = async (
    md: string,
  ): Promise<{ dataUrls: Record<string, string>; unreadable: string[] }> => {
    const repo = repoRef.current
    if (!repo || !activePath) return { dataUrls: {}, unreadable: [] }
    const images = findReferencedImages(activePath, md, nodes)
    const dataUrls: Record<string, string> = {}
    const unreadable: string[] = []
    await Promise.all(
      images.map(async ({ name, node }) => {
        try {
          dataUrls[name] = await repo.readImageAsDataUrl(node.path)
        } catch {
          unreadable.push(name)
        }
      }),
    )
    return { dataUrls, unreadable }
  }

  const copyPrepared = async (html: string) => {
    const ok = await copyRichText(html)
    flash(
      ok ? '已复制，去公众号 ⌘V 粘贴' : '复制失败，请用浏览器 Chrome/Edge',
      ok ? 'success' : 'error',
    )
  }

  const handleCopy = async () => {
    if (copying || !activeDraft) return
    setCopying(true)
    try {
      await ensureHighlighter()
      const { dataUrls, unreadable } = await resolveImageDataUrls(markdown)
      const { body, html } = renderArticle(markdown, theme, dataUrls, density)
      const warnings = checkBeforeCopy(
        markdown,
        body,
        activePath,
        nodes,
        unreadable,
      )
      if (warnings.length) setPendingCopy({ html, warnings })
      else await copyPrepared(html)
    } catch (err) {
      console.warn('复制前检查失败', err)
      flash('复制前检查失败，请重试', 'error')
    } finally {
      setCopying(false)
    }
  }

  const confirmCopy = () => {
    if (!pendingCopy) return
    const { html } = pendingCopy
    setPendingCopy(null)
    void copyPrepared(html)
  }

  const handleExportMarkdown = async () => {
    if (!activeDraft) return
    const runtime = runtimeRef.current
    if (!runtime) return
    try {
      const saved = await runtime.exportFile(
        `${safeFileName(activeDraft.name)}.md`,
        createDraftMarkdownBlob(activeDraft),
      )
      if (saved) flash(`已导出「${activeDraft.name}」`, 'success')
    } catch (err) {
      console.warn('Markdown 导出失败', err)
      flash('Markdown 导出失败', 'error')
    }
  }

  const handleExportBackup = async () => {
    if (!activeDraft) return
    setExporting(true)
    try {
      const repo = repoRef.current
      const imagesData: Record<string, string> = {}
      if (repo) {
        await Promise.all(
          referencedImages.map(async ({ name, node }) => {
            imagesData[name] = await repo.readImageAsDataUrl(node.path)
          }),
        )
      }
      const runtime = runtimeRef.current
      if (!runtime) return
      const blob = await createBackupZipBlob([activeDraft], imagesData)
      const saved = await runtime.exportFile(`稿域备份-${stamp()}.zip`, blob)
      if (saved)
        flash(
          `已导出备份（当前草稿 · ${referencedImages.length} 张图片）`,
          'success',
        )
    } catch (err) {
      console.warn('备份失败', err)
      flash('备份导出失败', 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleExportImage = async () => {
    setExporting(true)
    try {
      await ensureHighlighter()
      const { dataUrls } = await resolveImageDataUrls(markdown)
      const { body } = renderArticle(markdown, theme, dataUrls, density)
      const blob = await renderLongImage({ body, theme, author: '稿域' })
      const runtime = runtimeRef.current
      if (!runtime) return
      const saved = await runtime.exportFile(
        `${safeFileName(activeDraft?.name ?? '长图')}.png`,
        blob,
      )
      if (saved) flash('长图已导出', 'success')
    } catch (err) {
      console.warn('长图导出失败', err)
      flash(err instanceof Error ? err.message : '长图导出失败', 'error')
    } finally {
      setExporting(false)
    }
  }

  /* ---------------- 导入 ---------------- */
  const handleImport = (files: File[]) =>
    void runMutation(async () => {
      const repo = repoRef.current
      if (!repo) return
      try {
        const {
          drafts: incoming,
          images: incomingImages,
          skipped,
        } = await importFiles(files)
        const imageCount = Object.keys(incomingImages).length
        if (!incoming.length && !imageCount) {
          flash(
            skipped.length ? '没有可导入的 Markdown 或备份文件' : '文件是空的',
            'warning',
          )
          return
        }
        // 统一放进根目录下的新文件夹，不与现有文件混杂
        const folder = await repo.createDirectory('', `导入-${stamp()}`)
        let firstPath = ''
        for (const d of incoming) {
          const path = await repo.createTextFile(
            folder,
            `${safeFileName(d.name)}.md`,
            d.content,
          )
          if (!firstPath) firstPath = path
        }
        for (const [name, dataUrl] of Object.entries(incomingImages)) {
          await repo.createImageFile(folder, name, dataUrlToBlob(dataUrl))
        }
        await refreshRepo()
        if (firstPath) await openMarkdown(firstPath)
        const parts = [
          incoming.length ? `${incoming.length} 篇草稿` : '',
          imageCount ? `${imageCount} 张图片` : '',
        ]
        flash(
          `已导入 ${parts.filter(Boolean).join(' · ')}${skipped.length ? `（跳过 ${skipped.length} 个文件）` : ''}`,
          'success',
        )
      } catch (err) {
        console.warn('导入失败', err)
        flash('导入失败，文件可能已损坏', 'error')
      }
    })

  return {
    exporting,
    copying,
    pendingCopy,
    confirmCopy,
    dismissCopy: () => setPendingCopy(null),
    handleCopy,
    handleExportMarkdown,
    handleExportBackup,
    handleExportImage,
    handleImport,
  }
}
