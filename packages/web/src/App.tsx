import { useEffect, useMemo, useRef, useState } from 'react'
import ConfirmationDialog from '@/components/ConfirmationDialog'
import RepositoryGate from '@/components/RepositoryGate'
import WorkspaceContent from '@/components/WorkspaceContent'
import WorkspaceSidebar from '@/components/WorkspaceSidebar'
import SearchDialog from '@/features/search/SearchDialog'
import ShortcutsDialog from '@/features/shortcuts/ShortcutsDialog'
import WorkspaceShortcuts from '@/features/shortcuts/WorkspaceShortcuts'
import ImageCleanupDialog from '@/features/image-cleanup/ImageCleanupDialog'
import CopyCheckDialog from '@/features/transfer/CopyCheckDialog'
import { findMatches, type SearchMatch } from '@/features/search/search'
import { useDraftTransfer } from '@/features/transfer/useDraftTransfer'
import { useArticlePreview } from '@/features/workspace/useArticlePreview'
import { useWorkspaceRepository } from '@/features/workspace/useWorkspaceRepository'
import { SidebarProvider } from '@/components/ui/sidebar'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { downscaleImage } from '@/core/image/images'
import { createScrollSyncChannel } from '@/core/editor/scrollSync'
import { locateImage } from '@/core/drafts/locate'
import {
  baseNamePath,
  dataUrlToBlob,
  dirnamePath,
  joinPath,
} from '@/core/fs/fsa'

export default function App() {
  const workspace = useWorkspaceRepository()
  const {
    repoStatus,
    pendingName,
    repoError,
    rootName,
    runtimeRef,
    repoRef,
    searchOpen,
    setSearchOpen,
    confirmation,
    setConfirmation,
  } = workspace.repository
  const {
    activePath,
    setActivePath,
    activePathRef,
    documentLoadRef,
    diskContentsRef,
    contents,
    setContents,
    trashDocument,
    setTrashDocument,
    markdown,
    setMarkdown,
    draftPath,
    activeDraft,
    imageUrls,
    setImageUrls,
    saved,
    saveFailed,
  } = workspace.document
  const {
    nodes,
    setNodes,
    trashEntries,
    trashNodes,
    trashSourceEntry,
    referencedImageSignature,
    referencedImages,
    availableImageNames,
    tree,
  } = workspace.files
  const {
    flash,
    runMutation,
    refreshRepo,
    openMarkdown,
    openTrashMarkdown,
    handlePickRoot,
    handleGrantPermission,
    handleChangeRoot,
    handleUseOpfs,
    handleRefresh,
    handleCreateMarkdown,
    handleCreateDirectory,
    handleRenameNode,
    handleDeleteNode,
    loadTrashNodes,
    handleRestoreTrash,
    handleDeleteTrash,
    handleEmptyTrash,
  } = workspace.actions
  const {
    themeId,
    setThemeId,
    darkPreview,
    setDarkPreview,
    densityId,
    setDensityId,
    theme,
    density,
    result,
    article,
    charCount,
    countLevel,
    countClass,
  } = useArticlePreview({ markdown, imageUrls })
  const [viewMode, setViewMode] = useState<'split' | 'preview'>('split')
  const isPreviewOnly = viewMode === 'preview'
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [cleanupOpen, setCleanupOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [createDocumentRequest, setCreateDocumentRequest] = useState(0)
  const [isNarrow, setIsNarrow] = useState(
    () => window.matchMedia('(max-width: 900px)').matches,
  )
  const editorPanelRef = useRef<PanelImperativeHandle>(null)

  /* ---------------- 生命周期：高亮 / 主题 / 布局 ---------------- */
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)')
    const update = () => setIsNarrow(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const panel = editorPanelRef.current
    if (!panel) return
    if (isPreviewOnly) panel.collapse()
    else panel.expand()
  }, [isPreviewOnly, isNarrow])

  /** 当前文档引用变化时，只读取它实际使用的图片。 */
  useEffect(() => {
    let cancelled = false
    const repo = repoRef.current

    setImageUrls((previous) => {
      for (const url of Object.values(previous)) URL.revokeObjectURL(url)
      return {}
    })
    if (repoStatus !== 'ready' || !repo || !draftPath) return

    void Promise.all(
      referencedImages.map(async ({ name, node }) => {
        try {
          const relativePath =
            trashSourceEntry?.kind === 'dir'
              ? trashNodes[trashSourceEntry.id]?.find(
                  (item) =>
                    joinPath(trashSourceEntry.originalPath, item.path) ===
                    node.path,
                )?.path
              : undefined
          const url =
            relativePath && trashSourceEntry
              ? await repo.trashImageUrl(trashSourceEntry.id, relativePath)
              : await repo.imageUrl(node.path)
          return { name, url }
        } catch (error) {
          console.warn(`图片加载失败：${node.path}`, error)
          return null
        }
      }),
    ).then((loaded) => {
      const succeeded = loaded.filter((item) => item !== null)
      if (cancelled) {
        for (const { url } of succeeded) URL.revokeObjectURL(url)
        return
      }
      setImageUrls(
        Object.fromEntries(succeeded.map(({ name, url }) => [name, url])),
      )
    })

    return () => {
      cancelled = true
    }
    // referencedImageSignature 已包含图片路径和文件元数据，避免正文普通输入重复读取图片。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftPath, trashDocument?.id, referencedImageSignature, repoStatus])

  /* ---------------- 图片 ---------------- */
  const refreshTimerRef = useRef<number | null>(null)
  const refreshSoon = () => {
    if (refreshTimerRef.current != null)
      window.clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null
      void runMutation(async () => {
        try {
          await refreshRepo()
        } catch {
          /* 目录刷新失败不打断输入 */
        }
      })
    }, 500)
  }

  /** 图片写入当前文档目录；文件选择保留原件，拖入/粘贴沿用降采样 */
  const handleAddImage = async (
    file: File,
    preserveOriginal = false,
  ): Promise<string | null> => {
    const repo = repoRef.current
    if (!repo || !activePath) return null
    try {
      const blob = preserveOriginal
        ? file
        : dataUrlToBlob(await downscaleImage(file))
      const path = await repo.createImageFile(
        dirnamePath(activePath),
        file.name,
        blob,
      )
      const name = baseNamePath(path)
      const url = await repo.imageUrl(path)
      setImageUrls((prev) => ({ ...prev, [name]: url }))
      refreshSoon()
      return name
    } catch (err) {
      console.warn('图片保存失败', err)
      flash('图片保存失败', 'error')
      return null
    }
  }

  const [jumpRequest, setJumpRequest] = useState<{
    line: number
    from?: number
    to?: number
    path?: string
    nonce: number
  } | null>(null)
  const jumpNonce = useRef(0)
  const searchOverlays = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(contents).filter(
          ([path, text]) => text !== diskContentsRef.current[path],
        ),
      ),
    [contents, saved],
  )

  const openSearchResult = async (
    path: string,
    query: string,
    match?: SearchMatch,
  ): Promise<boolean> => {
    const repo = repoRef.current
    if (!repo) return false
    const request = ++documentLoadRef.current
    const overlay = searchOverlays[path]
    const content = overlay ?? (await repo.readTextFile(path))
    if (repo !== repoRef.current || request !== documentLoadRef.current)
      return false
    if (overlay === undefined) diskContentsRef.current[path] = content
    setTrashDocument(null)
    setContents((previous) => ({ ...previous, [path]: content }))
    activePathRef.current = path
    setActivePath(path)
    setJumpRequest(null)
    if (match) {
      setViewMode('split')
      const matches = findMatches(content, query)
      const target =
        matches.find((item) => item.from === match.from) ??
        matches.reduce<SearchMatch | undefined>(
          (best, item) =>
            !best ||
            Math.abs(item.from - match.from) < Math.abs(best.from - match.from)
              ? item
              : best,
          undefined,
        )
      if (!target) {
        flash('该匹配已不存在，已打开最新文档', 'warning')
        return true
      }
      setJumpRequest({
        path,
        line: target.line - 1,
        from: target.from,
        to: target.to,
        nonce: ++jumpNonce.current,
      })
    }
    return true
  }

  const handleLocateImage = (name: string) => {
    if (!activePath) {
      flash('请先打开一篇 Markdown 文档', 'warning')
      return
    }
    const line = locateImage(markdown, name)
    if (line == null) {
      flash(`当前文档没有引用「${name}」`, 'warning')
      return
    }
    jumpNonce.current += 1
    setJumpRequest({ line, nonce: jumpNonce.current })
  }

  const {
    exporting,
    copying,
    pendingCopy,
    confirmCopy,
    dismissCopy,
    handleCopy,
    handleExportMarkdown,
    handleExportBackup,
    handleExportImage,
    handleImport,
  } = useDraftTransfer({
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
  })

  /** 编辑器跳转请求（文件树点击图片定位用） */
  const scrollSync = useRef(createScrollSyncChannel()).current

  if (repoStatus !== 'ready') {
    return (
      <RepositoryGate
        repoStatus={repoStatus}
        repoError={repoError}
        pendingName={pendingName}
        runtimeRef={runtimeRef}
        onGrantPermission={() => void handleGrantPermission()}
        onChangeRoot={handleChangeRoot}
        onPickRoot={() => void handlePickRoot()}
        onUseOpfs={() => void handleUseOpfs()}
      />
    )
  }

  return (
    <SidebarProvider className="h-full min-h-0">
      <WorkspaceShortcuts
        blocked={Boolean(
          searchOpen || cleanupOpen || confirmation || pendingCopy,
        )}
        helpOpen={helpOpen}
        onNewDocument={() => setCreateDocumentRequest((request) => request + 1)}
        onOpenDirectory={() => void handlePickRoot()}
        onRefresh={handleRefresh}
        onSearch={() => setSearchOpen(true)}
        onHelp={() => setHelpOpen((open) => !open)}
        onViewMode={() =>
          setViewMode((mode) => (mode === 'split' ? 'preview' : 'split'))
        }
      />
      <WorkspaceSidebar
        onSearch={() => setSearchOpen(true)}
        onHelp={() => setHelpOpen(true)}
        createDocumentRequest={createDocumentRequest}
        rootName={rootName}
        tree={tree}
        trash={trashEntries}
        trashNodes={trashNodes}
        activeTrashKey={
          trashDocument
            ? `${trashDocument.id}:${trashDocument.relativePath}`
            : ''
        }
        activePath={activePath}
        onSelect={(path) => void openMarkdown(path)}
        onCreateMarkdown={handleCreateMarkdown}
        onCreateDirectory={handleCreateDirectory}
        onRename={handleRenameNode}
        onDelete={handleDeleteNode}
        onChangeRoot={() => void handlePickRoot()}
        onRefresh={handleRefresh}
        onCleanupImages={() => setCleanupOpen(true)}
        onLocateImage={handleLocateImage}
        onOpenTrashMarkdown={(id, path) => void openTrashMarkdown(id, path)}
        onRestoreTrash={handleRestoreTrash}
        onDeleteTrash={handleDeleteTrash}
        onEmptyTrash={handleEmptyTrash}
        onLoadTrashNodes={loadTrashNodes}
      />

      <WorkspaceContent
        isPreviewOnly={isPreviewOnly}
        viewMode={viewMode}
        setViewMode={(mode) => setViewMode(mode)}
        isNarrow={isNarrow}
        activeDraft={Boolean(activeDraft)}
        markdown={markdown}
        setMarkdown={setMarkdown}
        trashDocument={trashDocument}
        activePath={activePath}
        editorPanelRef={editorPanelRef}
        handleAddImage={handleAddImage}
        onHelp={() => setHelpOpen(true)}
        onViewMode={() =>
          setViewMode((mode) => (mode === 'split' ? 'preview' : 'split'))
        }
        availableImageNames={availableImageNames}
        scrollSync={scrollSync}
        jumpRequest={jumpRequest}
        outlineOpen={outlineOpen}
        setOutlineOpen={setOutlineOpen}
        body={result.body}
        articleTitle={article.title}
        articleAuthor={article.author}
        legacyTitle={article.legacyTitle}
        theme={theme}
        darkPreview={darkPreview}
        charCount={charCount}
        countLevel={countLevel}
        countClass={countClass}
        saveFailed={saveFailed}
        saved={saved}
        themeId={themeId}
        setThemeId={setThemeId}
        densityId={densityId}
        setDensityId={setDensityId}
        setDarkPreview={setDarkPreview}
        exporting={exporting}
        copying={copying}
        handleCopy={() => void handleCopy()}
        handleImport={handleImport}
        handleExportMarkdown={() => void handleExportMarkdown()}
        handleExportBackup={() => void handleExportBackup()}
        handleExportImage={() => void handleExportImage()}
      />
      {searchOpen && repoRef.current && (
        <SearchDialog
          repo={repoRef.current}
          onNodes={setNodes}
          nodes={nodes}
          overlays={searchOverlays}
          onClose={() => setSearchOpen(false)}
          onSelect={openSearchResult}
        />
      )}
      {cleanupOpen && repoRef.current && (
        <ImageCleanupDialog
          repo={repoRef.current}
          overlays={searchOverlays}
          onClose={() => setCleanupOpen(false)}
          onMoved={async () => {
            await runMutation(async () => {
              await refreshRepo()
            })
          }}
        />
      )}
      <ConfirmationDialog
        confirmation={confirmation}
        onClose={() => setConfirmation(null)}
      />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      {pendingCopy && (
        <CopyCheckDialog
          warnings={pendingCopy.warnings}
          onClose={dismissCopy}
          onContinue={confirmCopy}
        />
      )}
    </SidebarProvider>
  )
}
