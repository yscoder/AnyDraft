import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  AppRuntime,
  ContentRepository,
  RepoNode,
  TrashEntry,
} from '@any-draft/shared'
import type { TreeBranch } from '@/components/FileTree'
import type { Confirmation, RepoStatus } from '@/features/workspace/types'
import { findReferencedImages } from '@/core/drafts/assets'
import { baseNamePath, dirnamePath, joinPath } from '@/core/fs/fsa'
import { createRuntime } from '@/core/runtime/createRuntime'
import { toast } from 'sonner'
import { createArticleSource } from '@/core/markdown/frontmatter'

export function useWorkspaceRepository() {
  /* ---------------- 工作目录（平台适配层） ---------------- */
  const [repoStatus, setRepoStatus] = useState<RepoStatus>('checking')
  const runtimeRef = useRef<AppRuntime | null>(null)
  const repoRef = useRef<ContentRepository | null>(null)
  const [pendingName, setPendingName] = useState('')
  const [repoError, setRepoError] = useState('')
  const [rootName, setRootName] = useState('')

  const [searchOpen, setSearchOpen] = useState(false)
  const [nodes, setNodes] = useState<RepoNode[]>([])
  const [trashEntries, setTrashEntries] = useState<TrashEntry[]>([])
  const [trashNodes, setTrashNodes] = useState<Record<string, RepoNode[]>>({})
  const [trashDocument, setTrashDocument] = useState<{
    id: string
    relativePath: string
    originalPath: string
    content: string
  } | null>(null)
  const [contents, setContents] = useState<Record<string, string>>({})
  const [activePath, setActivePath] = useState('')
  /** 图片：文件名（basename）→ 可用于 <img> 的 URL（Web 为 blob:） */
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})

  const activePathRef = useRef('')
  activePathRef.current = activePath
  const documentLoadRef = useRef(0)
  const markdownRef = useRef('')
  const diskContentsRef = useRef<Record<string, string>>({})
  const suspendedSavePathsRef = useRef(new Set<string>())
  /** 异步目录操作进行中：期间跳过「选中项失效」的自动兜底，避免竞态 */
  const mutatingRef = useRef(false)

  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [saved, setSaved] = useState(true)
  const [saveFailed, setSaveFailed] = useState(false)

  const mdNodes = useMemo(
    () => nodes.filter((n) => n.kind === 'markdown'),
    [nodes],
  )
  const imageNodes = useMemo(
    () => nodes.filter((n) => n.kind === 'image'),
    [nodes],
  )
  const trashSourceEntry = trashDocument
    ? trashEntries.find((entry) => entry.id === trashDocument.id)
    : undefined
  const trashVirtualNodes = useMemo(
    () =>
      trashSourceEntry?.kind === 'dir'
        ? (trashNodes[trashSourceEntry.id] ?? []).map((node) => ({
            ...node,
            path: joinPath(trashSourceEntry.originalPath, node.path),
          }))
        : [],
    [trashSourceEntry, trashNodes],
  )
  const draftPath = trashDocument?.originalPath ?? activePath
  const activeDraft = draftPath
    ? {
        id: draftPath,
        name: baseNamePath(draftPath).replace(/\.(md|markdown)$/i, ''),
        content: trashDocument?.content ?? contents[activePath] ?? '',
        updatedAt: Date.now(),
      }
    : null
  const markdown =
    trashDocument?.content ?? (activePath ? (contents[activePath] ?? '') : '')
  markdownRef.current = markdown

  const setMarkdown = (v: string) => {
    if (!activePath || trashDocument) return
    setContents((prev) =>
      prev[activePath] === v ? prev : { ...prev, [activePath]: v },
    )
  }

  const referencedImages = useMemo(
    () =>
      draftPath
        ? findReferencedImages(draftPath, markdown, [
            ...trashVirtualNodes,
            ...nodes,
          ])
        : [],
    [draftPath, markdown, nodes, trashVirtualNodes],
  )
  const referencedImageSignature = referencedImages
    .map(
      ({ node }) => `${node.path}:${node.updatedAt ?? ''}:${node.size ?? ''}`,
    )
    .join('\n')
  const availableImageNames = useMemo(
    () => [...new Set(imageNodes.map((node) => baseNamePath(node.path)))],
    [imageNodes],
  )

  const tree = useMemo<TreeBranch[]>(() => {
    const byParent = new Map<string, RepoNode[]>()
    for (const n of nodes) {
      const parent = dirnamePath(n.path)
      const list = byParent.get(parent)
      if (list) list.push(n)
      else byParent.set(parent, [n])
    }
    const build = (parentPath: string): TreeBranch[] => {
      const children = byParent.get(parentPath) ?? []
      const dirs = children
        .filter((n) => n.kind === 'dir')
        .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      const files = children
        .filter((n) => n.kind !== 'dir')
        .sort((a, b) => a.name.localeCompare(b.name, 'zh'))
      return [...dirs, ...files].map((node) => ({
        node,
        children: node.kind === 'dir' ? build(node.path) : [],
      }))
    }
    return build('')
  }, [nodes])

  /* ---------------- 工作目录初始化 ---------------- */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const runtime = await createRuntime()
        runtimeRef.current = runtime
        const startup = await runtime.initializeRepository()
        if (cancelled) return
        if (startup.status === 'ready') {
          await openRepo(startup.repository)
        } else if (startup.status === 'need-permission') {
          setPendingName(startup.rootName)
          setRepoStatus('need-permission')
        } else {
          setRepoStatus(startup.status)
        }
      } catch (err) {
        if (cancelled) return
        console.error('初始化运行时失败', err)
        setRepoError(
          err instanceof Error ? err.message : '应用运行时初始化失败',
        )
        setRepoStatus('error')
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 只扫描目录节点和文件元数据，不读取任何文件内容。 */
  const scanRepo = async (repo: ContentRepository): Promise<RepoNode[]> => {
    const all = await repo.list()
    setNodes(all)
    return all
  }

  const scanTrash = async (repo: ContentRepository): Promise<void> => {
    const entries = await repo.listTrash()
    if (repo !== repoRef.current) return
    setTrashEntries(entries)
    setTrashNodes((current) => {
      const ids = new Set(entries.map((entry) => entry.id))
      if (Object.keys(current).every((id) => ids.has(id))) return current
      return Object.fromEntries(
        Object.entries(current).filter(([id]) => ids.has(id)),
      )
    })
    setTrashDocument((current) =>
      current && !entries.some((entry) => entry.id === current.id)
        ? null
        : current,
    )
  }

  const clearActiveFile = () => {
    documentLoadRef.current += 1
    activePathRef.current = ''
    setActivePath('')
    setSaved(true)
    setSaveFailed(false)
  }

  const refreshRepo = async (): Promise<RepoNode[]> => {
    const repo = repoRef.current
    if (!repo) return []
    const [all] = await Promise.all([scanRepo(repo), scanTrash(repo)])
    const cur = activePathRef.current
    if (
      cur &&
      !all.some((node) => node.kind === 'markdown' && node.path === cur)
    )
      clearActiveFile()
    return all
  }

  const openMarkdown = async (
    path: string,
    options: { force?: boolean; repo?: ContentRepository } = {},
  ): Promise<void> => {
    const repo = options.repo ?? repoRef.current
    if (!repo || (!options.force && path === activePathRef.current)) return
    const request = ++documentLoadRef.current
    try {
      const content = await repo.readTextFile(path)
      if (request !== documentLoadRef.current || repo !== repoRef.current)
        return
      diskContentsRef.current[path] = content
      suspendedSavePathsRef.current.delete(path)
      setTrashDocument(null)
      setContents((previous) => ({ ...previous, [path]: content }))
      activePathRef.current = path
      setActivePath(path)
      setSaved(true)
      setSaveFailed(false)
    } catch (error) {
      console.warn('Markdown 加载失败', error)
      flash('Markdown 加载失败', 'error')
    }
  }

  const openTrashMarkdown = async (id: string, relativePath: string) => {
    const repo = repoRef.current
    const entry = trashEntries.find((item) => item.id === id)
    if (!repo || !entry) return
    const request = ++documentLoadRef.current
    try {
      const content = await repo.readTrashText(id, relativePath)
      if (request !== documentLoadRef.current || repo !== repoRef.current)
        return
      clearActiveFile()
      setTrashDocument({
        id,
        relativePath,
        originalPath: relativePath
          ? `${entry.originalPath}/${relativePath}`
          : entry.originalPath,
        content,
      })
    } catch {
      flash('回收站文档读取失败', 'error')
    }
  }

  const openRepo = async (repo: ContentRepository): Promise<void> => {
    documentLoadRef.current += 1
    setSearchOpen(false)
    setConfirmation(null)
    repoRef.current = repo
    setRootName(repo.rootName || '浏览器内置存储')
    activePathRef.current = ''
    setActivePath('')
    setContents({})
    setTrashDocument(null)
    setTrashEntries([])
    setTrashNodes({})
    diskContentsRef.current = {}
    suspendedSavePathsRef.current.clear()
    setImageUrls((previous) => {
      for (const url of Object.values(previous)) URL.revokeObjectURL(url)
      return {}
    })
    await Promise.all([scanRepo(repo), scanTrash(repo)])
    setRepoStatus('ready')
  }

  const runMutation = async (fn: () => Promise<void>): Promise<void> => {
    mutatingRef.current = true
    try {
      await fn()
    } finally {
      mutatingRef.current = false
    }
  }

  /** 选中项在目录里消失后回到未打开状态，不自动读取其它文档。 */
  useEffect(() => {
    if (repoStatus !== 'ready' || mutatingRef.current) return
    if (!activePath) return
    if (mdNodes.some((n) => n.path === activePath)) return
    clearActiveFile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mdNodes, activePath, repoStatus])

  /* ---------------- 自动保存（防抖写盘） ---------------- */
  useEffect(() => {
    const repo = repoRef.current
    const path = activePath
    if (repoStatus !== 'ready' || !repo || !path) return
    const disk = diskContentsRef.current[path] ?? ''
    if (markdown === disk) {
      setSaved(true)
      setSaveFailed(false)
      return
    }
    setSaved(false)
    setSaveFailed(false)
    let started = false
    const timer = window.setTimeout(() => {
      if (suspendedSavePathsRef.current.has(path)) return
      started = true
      const toWrite = markdown
      void repo
        .writeTextFile(path, toWrite)
        .then(() => {
          diskContentsRef.current[path] = toWrite
          if (activePathRef.current === path) {
            setSaved(true)
            setSaveFailed(false)
          }
        })
        .catch(() => {
          flash('保存失败，请检查目录写入权限', 'error')
          if (activePathRef.current === path) setSaveFailed(true)
        })
    }, 300)
    return () => {
      window.clearTimeout(timer)
      if (
        started ||
        suspendedSavePathsRef.current.has(path) ||
        diskContentsRef.current[path] === markdown
      )
        return
      void repo
        .writeTextFile(path, markdown)
        .then(() => {
          diskContentsRef.current[path] = markdown
        })
        .catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown, activePath, repoStatus])

  // 页面切后台时立即落盘，避免防抖窗口内丢改动
  const saveStateRef = useRef({ path: '', content: '', clean: true })
  saveStateRef.current = {
    path: activePath,
    content: markdown,
    clean: markdown === (diskContentsRef.current[activePath] ?? ''),
  }
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return
      const { path, content, clean } = saveStateRef.current
      const repo = repoRef.current
      if (!repo || !path || clean || suspendedSavePathsRef.current.has(path))
        return
      void repo
        .writeTextFile(path, content)
        .then(() => {
          diskContentsRef.current[path] = content
        })
        .catch(() => {})
    }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [])

  const flash = (
    msg: string,
    kind: 'success' | 'error' | 'warning' | 'info' = 'info',
  ) => {
    toast[kind](msg)
  }

  /* ---------------- 工作目录授权动作 ---------------- */
  const handlePickRoot = async () => {
    const runtime = runtimeRef.current
    if (!runtime) return
    try {
      const repo = await runtime.pickRepository()
      if (!repo) return
      await openRepo(repo)
      flash(`已连接目录「${repo.rootName}」`, 'success')
    } catch (err) {
      console.warn('打开目录失败', err)
      flash('目录打开失败', 'error')
    }
  }

  const handleGrantPermission = async () => {
    const runtime = runtimeRef.current
    if (!runtime) {
      setRepoStatus('need-pick')
      return
    }
    const repo = await runtime.grantRepositoryPermission()
    if (repo) {
      try {
        await openRepo(repo)
      } catch (err) {
        console.warn('打开目录失败', err)
        flash('目录打开失败', 'error')
      }
    } else {
      flash('未获得该目录的访问权限', 'warning')
    }
  }

  const handleChangeRoot = () => {
    setPendingName('')
    setRepoStatus('need-pick')
  }

  /** 目录选择器不可用时的兜底：改用浏览器内置存储（OPFS） */
  const handleUseOpfs = async () => {
    const runtime = runtimeRef.current
    if (!runtime) return
    try {
      await openRepo(await runtime.openInternalStorage())
      flash('已使用浏览器内置存储', 'success')
    } catch (err) {
      console.warn('打开内置存储失败', err)
      flash('打开内置存储失败', 'error')
    }
  }

  /* ---------------- 文件树操作 ---------------- */
  const handleRefresh = () =>
    void runMutation(async () => {
      try {
        const repo = repoRef.current
        if (!repo) return
        const path = activePathRef.current
        const content = markdownRef.current
        if (path && diskContentsRef.current[path] !== content) {
          await repo.writeTextFile(path, content)
          diskContentsRef.current[path] = content
        }
        const all = await refreshRepo()
        if (path && all.some((node) => node.path === path))
          await openMarkdown(path, { force: true, repo })
        flash('已刷新目录', 'success')
      } catch {
        flash('刷新失败，请检查目录权限', 'error')
      }
    })

  const handleCreateMarkdown = async (
    dirPath: string,
  ): Promise<string | undefined> => {
    let createdPath: string | undefined
    await runMutation(async () => {
      const repo = repoRef.current
      if (!repo) return
      try {
        const path = await repo.createTextFile(
          dirPath,
          '未命名.md',
          createArticleSource(),
        )
        await refreshRepo()
        await openMarkdown(path)
        createdPath = path
        flash(`已新建「${baseNamePath(path)}」`, 'success')
      } catch {
        flash('新建失败', 'error')
      }
    })
    return createdPath
  }

  const handleCreateDirectory = async (
    dirPath: string,
  ): Promise<string | undefined> => {
    let createdPath: string | undefined
    await runMutation(async () => {
      const repo = repoRef.current
      if (!repo) return
      try {
        createdPath = await repo.createDirectory(dirPath, '新建文件夹')
        await refreshRepo()
        flash('已新建文件夹', 'success')
      } catch {
        flash('新建文件夹失败', 'error')
      }
    })
    return createdPath
  }

  const handleRenameNode = async (
    path: string,
    newName: string,
  ): Promise<string | undefined> => {
    const repo = repoRef.current
    const trimmed = newName.trim()
    if (!repo || !trimmed) return
    const node = nodes.find((n) => n.path === path)
    if (!node || node.name === trimmed) return
    let renamedPath: string | undefined
    await runMutation(async () => {
      try {
        const newPath = await repo.renameNode(path, trimmed)
        const remap = <T>(obj: Record<string, T>): Record<string, T> => {
          const next: Record<string, T> = {}
          for (const [k, v] of Object.entries(obj)) {
            next[
              k === path || k.startsWith(`${path}/`)
                ? newPath + k.slice(path.length)
                : k
            ] = v
          }
          return next
        }
        setContents((prev) => remap(prev))
        diskContentsRef.current = remap(diskContentsRef.current)
        if (activePath === path || activePath.startsWith(`${path}/`)) {
          const nextActivePath =
            activePath === path
              ? newPath
              : newPath + activePath.slice(path.length)
          activePathRef.current = nextActivePath
          setActivePath(nextActivePath)
        }
        await scanRepo(repo)
        renamedPath = newPath
        flash(`已重命名为「${baseNamePath(newPath)}」`, 'success')
      } catch (err) {
        flash(err instanceof Error ? err.message : '重命名失败', 'error')
        await scanRepo(repo).catch(() => {})
      }
    })
    return renamedPath
  }

  const handleDeleteNode = (path: string) => {
    const repo = repoRef.current
    const node = nodes.find((n) => n.path === path)
    if (!repo || !node) return
    const isDir = node.kind === 'dir'
    setConfirmation({
      title: '移到回收站？',
      description: `「${node.name}」${isDir ? '及其全部内容' : ''}将移到回收站，可以稍后恢复。`,
      actionLabel: '移到回收站',
      onConfirm: () =>
        runMutation(async () => {
          try {
            const current = activePathRef.current
            const deletingActive =
              current === path || current.startsWith(`${path}/`)
            if (deletingActive) {
              suspendedSavePathsRef.current.add(current)
              const content = markdownRef.current
              if (content !== diskContentsRef.current[current]) {
                await repo.writeTextFile(current, content)
                diskContentsRef.current[current] = content
              }
            }
            await repo.trashNode(path)
            await refreshRepo()
            flash(`已移到回收站：「${node.name}」`, 'success')
          } catch {
            suspendedSavePathsRef.current.delete(activePathRef.current)
            flash('删除失败', 'error')
          }
        }),
    })
  }

  const loadTrashNodes = (id: string) => {
    const repo = repoRef.current
    if (!repo || trashNodes[id]) return
    void repo
      .listTrashNodes(id)
      .then((nodes) =>
        setTrashNodes((current) => ({ ...current, [id]: nodes })),
      )
      .catch(() => flash('回收站文件夹读取失败', 'error'))
  }

  const handleRestoreTrash = (entry: TrashEntry) => {
    const repo = repoRef.current
    if (!repo) return
    void runMutation(async () => {
      try {
        const restored = await repo.restoreTrash(entry.id)
        setTrashNodes((current) => {
          const next = { ...current }
          delete next[entry.id]
          return next
        })
        await refreshRepo()
        flash(`已恢复到「${restored}」`, 'success')
      } catch (error) {
        flash(error instanceof Error ? error.message : '恢复失败', 'error')
      }
    })
  }

  const handleDeleteTrash = (entry: TrashEntry) => {
    const repo = repoRef.current
    if (!repo) return
    setConfirmation({
      title: '彻底删除？',
      description: `「${entry.name}」将被永久删除，此操作无法撤销。`,
      actionLabel: '彻底删除',
      onConfirm: () =>
        runMutation(async () => {
          try {
            await repo.removeTrash(entry.id)
            await refreshRepo()
            flash(`已彻底删除「${entry.name}」`, 'success')
          } catch {
            flash('彻底删除失败', 'error')
          }
        }),
    })
  }

  const handleEmptyTrash = () => {
    const repo = repoRef.current
    if (!repo || !trashEntries.length) return
    setConfirmation({
      title: '清空回收站？',
      description: `回收站中的 ${trashEntries.length} 个项目将被永久删除，此操作无法撤销。`,
      actionLabel: '清空回收站',
      onConfirm: () =>
        runMutation(async () => {
          try {
            for (const entry of trashEntries) await repo.removeTrash(entry.id)
            flash('回收站已清空', 'success')
          } catch {
            flash('清空回收站失败，请刷新后重试', 'error')
          } finally {
            await refreshRepo().catch(() => {})
          }
        }),
    })
  }

  return {
    repository: {
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
    },
    document: {
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
    },
    files: {
      nodes,
      setNodes,
      trashEntries,
      trashNodes,
      trashSourceEntry,
      referencedImages,
      referencedImageSignature,
      availableImageNames,
      tree,
    },
    actions: {
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
    },
  }
}
