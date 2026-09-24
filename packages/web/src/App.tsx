import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Brand } from '@/components/Brand'
import EditorPane from '@/components/EditorPane'
import FileTree, { type TreeBranch } from '@/components/FileTree'
import PreviewPane from '@/components/PreviewPane'
import ThemeControls from '@/components/ThemeControls'
import Toolbar from '@/components/Toolbar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TooltipHint } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { FileText, ListTree } from 'lucide-react'
import type { PanelImperativeHandle } from 'react-resizable-panels'
import { toast } from 'sonner'
import {
  ensureHighlighter,
  isHighlighterReady,
  renderArticle,
} from '@/core/markdown/markdown'
import { copyRichText } from '@/core/transfer/clipboard'
import {
  createBackupZipBlob,
  createDraftMarkdownBlob,
  importFiles,
  safeFileName,
} from '@/core/transfer/exchange'
import { renderLongImage } from '@/core/transfer/longimage'
import { getDensity, getTheme } from '@/core/theme/theme'
import { downscaleImage } from '@/core/image/images'
import { createScrollSyncChannel } from '@/core/editor/scrollSync'
import { findReferencedImages } from '@/core/drafts/assets'
import { locateImage } from '@/core/drafts/locate'
import { baseNamePath, dataUrlToBlob, dirnamePath } from '@/core/fs/fsa'
import type { AppRuntime, ContentRepository, RepoNode } from '@any-draft/shared'
import { readStored, writeStored } from '@/core/storage'
import { createRuntime } from '@/core/runtime/createRuntime'
import './styles/index.css'

/** 编辑器侧最小宽度（拖拽时保留，预览因此可达 desktop 宽度） */
const MIN_EDITOR_PX = 180
/** 预览最小宽度（容纳真实手机宽度） */
const MIN_PREVIEW_PX = 430
const MIN_EDITOR_HEIGHT_PX = 160
const MIN_PREVIEW_HEIGHT_PX = 220

interface Confirmation {
  title: string
  description: string
  actionLabel: string
  onConfirm: () => void | Promise<void>
}

/** 工作目录授权状态机 */
type RepoStatus =
  | 'checking'
  | 'unsupported'
  | 'need-pick'
  | 'need-permission'
  | 'ready'
  | 'error'

function stamp(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

export default function App() {
  /* ---------------- 工作目录（平台适配层） ---------------- */
  const [repoStatus, setRepoStatus] = useState<RepoStatus>('checking')
  const runtimeRef = useRef<AppRuntime | null>(null)
  const repoRef = useRef<ContentRepository | null>(null)
  const [pendingName, setPendingName] = useState('')
  const [repoError, setRepoError] = useState('')
  const [rootName, setRootName] = useState('')

  const [nodes, setNodes] = useState<RepoNode[]>([])
  const [contents, setContents] = useState<Record<string, string>>({})
  const [activePath, setActivePath] = useState('')
  /** 图片：文件名（basename）→ 可用于 <img> 的 URL（Web 为 blob:） */
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})

  const activePathRef = useRef('')
  activePathRef.current = activePath
  const documentLoadRef = useRef(0)
  const markdownRef = useRef('')
  const diskContentsRef = useRef<Record<string, string>>({})
  /** 异步目录操作进行中：期间跳过「选中项失效」的自动兜底，避免竞态 */
  const mutatingRef = useRef(false)

  const [themeId, setThemeId] = useState<string>(
    () => readStored('theme') ?? 'classic',
  )
  const [darkPreview, setDarkPreview] = useState(false)
  const [densityId, setDensityId] = useState<string>(
    () => readStored('density') ?? 'standard',
  )
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [exporting, setExporting] = useState(false)
  const [viewMode, setViewMode] = useState<'split' | 'preview'>('split')
  const isPreviewOnly = viewMode === 'preview'
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [saved, setSaved] = useState(true)
  const [saveFailed, setSaveFailed] = useState(false)
  const [isNarrow, setIsNarrow] = useState(
    () => window.matchMedia('(max-width: 900px)').matches,
  )
  const editorPanelRef = useRef<PanelImperativeHandle>(null)

  const theme = useMemo(() => getTheme(themeId), [themeId])
  const density = useMemo(() => getDensity(densityId), [densityId])
  const [hlReady, setHlReady] = useState(isHighlighterReady)

  /* ---------------- 派生状态 ---------------- */
  const mdNodes = useMemo(
    () => nodes.filter((n) => n.kind === 'markdown'),
    [nodes],
  )
  const imageNodes = useMemo(
    () => nodes.filter((n) => n.kind === 'image'),
    [nodes],
  )
  const activeDraft = activePath
    ? {
        id: activePath,
        name: baseNamePath(activePath).replace(/\.(md|markdown)$/i, ''),
        content: contents[activePath] ?? '',
        updatedAt: Date.now(),
      }
    : null
  const markdown = activePath ? (contents[activePath] ?? '') : ''
  markdownRef.current = markdown

  const setMarkdown = (v: string) => {
    if (!activePath) return
    setContents((prev) =>
      prev[activePath] === v ? prev : { ...prev, [activePath]: v },
    )
  }

  const deferredMarkdown = useDeferredValue(markdown)
  const result = useMemo(
    () => renderArticle(deferredMarkdown, theme, imageUrls, density),
    // hlReady 只作为「重算一次」的信号，不参与渲染入参
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deferredMarkdown, theme, imageUrls, density, hlReady],
  )
  const charCount = useMemo(
    () => markdown.replace(/\s/g, '').length,
    [markdown],
  )
  const countLevel =
    charCount >= 20000 ? 'over' : charCount >= 18000 ? 'warn' : 'normal'
  const countClass = `pane-stat count ${countLevel === 'warn' ? 'count-warn' : countLevel === 'over' ? 'count-over' : ''}`

  const referencedImages = useMemo(
    () => (activePath ? findReferencedImages(activePath, markdown, nodes) : []),
    [activePath, markdown, nodes],
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

  /* ---------------- 生命周期：高亮 / 主题 / 布局 ---------------- */
  useEffect(() => {
    if (hlReady) return
    let cancelled = false
    void ensureHighlighter().then(() => {
      if (!cancelled) setHlReady(isHighlighterReady())
    })
    return () => {
      cancelled = true
    }
  }, [hlReady])

  useEffect(() => {
    writeStored('theme', theme.id)
  }, [theme.id])
  useEffect(() => {
    writeStored('density', densityId)
  }, [densityId])

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
    if (repoStatus !== 'ready' || !repo || !activePath) return

    void Promise.all(
      referencedImages.map(async ({ name, node }) => {
        try {
          return { name, url: await repo.imageUrl(node.path) }
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
  }, [activePath, referencedImageSignature, repoStatus])

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
    const all = await scanRepo(repo)
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

  const openRepo = async (repo: ContentRepository): Promise<void> => {
    documentLoadRef.current += 1
    repoRef.current = repo
    setRootName(repo.rootName || '浏览器内置存储')
    activePathRef.current = ''
    setActivePath('')
    setContents({})
    diskContentsRef.current = {}
    setImageUrls((previous) => {
      for (const url of Object.values(previous)) URL.revokeObjectURL(url)
      return {}
    })
    await scanRepo(repo)
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
      if (started || diskContentsRef.current[path] === markdown) return
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
      if (!repo || !path || clean) return
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
        const path = await repo.createTextFile(dirPath, '未命名.md')
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
        const remap = <T,>(obj: Record<string, T>): Record<string, T> => {
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
      title: isDir ? '删除文件夹？' : '删除文件？',
      description: `「${node.name}」${isDir ? '及其全部内容' : ''}将被永久删除，此操作无法撤销。`,
      actionLabel: isDir ? '删除文件夹' : '删除文件',
      onConfirm: () =>
        runMutation(async () => {
          try {
            await repo.removeNode(path)
            await refreshRepo()
            flash(`已删除「${node.name}」`, 'success')
          } catch {
            flash('删除失败', 'error')
          }
        }),
    })
  }

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

  /** 编辑器拖入/粘贴图片：降采样后写入当前文档同级文件夹 */
  const handleAddImage = async (file: File): Promise<string | null> => {
    const repo = repoRef.current
    if (!repo || !activePath) return null
    try {
      const dataUrl = await downscaleImage(file)
      const blob = dataUrlToBlob(dataUrl)
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
    nonce: number
  } | null>(null)
  const jumpNonce = useRef(0)

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

  /* ---------------- 复制 / 导出 ---------------- */
  /** 把当前正文引用的图片换成 data URL（公众号剪贴板不接受 blob URL） */
  const resolveImageDataUrls = async (
    md: string,
  ): Promise<Record<string, string>> => {
    const repo = repoRef.current
    if (!repo || !activePath) return {}
    const images = findReferencedImages(activePath, md, nodes)
    const out: Record<string, string> = {}
    await Promise.all(
      images.map(async ({ name, node }) => {
        try {
          out[name] = await repo.readImageAsDataUrl(node.path)
        } catch {
          /* 单张转换失败则跳过，正文退回占位提示 */
        }
      }),
    )
    return out
  }

  const handleCopy = async () => {
    await ensureHighlighter()
    const dataUrls = await resolveImageDataUrls(markdown)
    const { html } = renderArticle(markdown, theme, dataUrls, density)
    const ok = await copyRichText(html)
    flash(
      ok ? '已复制，去公众号 ⌘V 粘贴' : '复制失败，请用浏览器 Chrome/Edge',
      ok ? 'success' : 'error',
    )
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
      const dataUrls = await resolveImageDataUrls(markdown)
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

  /** 编辑器跳转请求（文件树点击图片定位用） */
  const scrollSync = useRef(createScrollSyncChannel()).current

  if (repoStatus !== 'ready') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-[radial-gradient(1200px_600px_at_20%_-10%,color-mix(in_oklch,var(--accent)_9%,transparent),transparent),var(--background)]">
        <div className="w-[min(420px,100%)] flex flex-col gap-3.5 pt-[30px] px-7 pb-6 bg-[var(--panel-solid,#fffdf9)] border border-border rounded-2xl shadow-[0_24px_60px_-30px_rgba(60,54,44,0.25)]">
          <Brand />

          {repoStatus === 'error' ? (
            <>
              <h1 className="mt-1 text-[17px] font-[650] tracking-[0.2px] text-foreground">
                应用启动失败
              </h1>
              <p className="m-0 text-[13px] leading-[1.7] text-muted-foreground">
                {repoError || '请重新启动应用后再试。'}
              </p>
            </>
          ) : repoStatus === 'unsupported' ? (
            <>
              <h1 className="mt-1 text-[17px] font-[650] tracking-[0.2px] text-foreground">
                当前浏览器暂不支持
              </h1>
              <p className="m-0 text-[13px] leading-[1.7] text-muted-foreground">
                稿域依赖浏览器的 File System Access
                能力读写文件，你的浏览器缺少该能力。 请换用 Chrome / Edge
                后重新打开本页面。
              </p>
            </>
          ) : repoStatus === 'need-permission' ? (
            <>
              <h1 className="mt-1 text-[17px] font-[650] tracking-[0.2px] text-foreground">
                继续使用「{pendingName}」
              </h1>
              <p className="m-0 text-[13px] leading-[1.7] text-muted-foreground">
                浏览器要求在每次会话中重新确认对该目录的写入权限。
              </p>
              <div className="flex flex-col gap-2.5 mt-1.5">
                <Button size="lg" onClick={() => void handleGrantPermission()}>
                  授权并继续
                </Button>
                <button
                  className="self-center border-none bg-transparent text-xs text-muted-foreground cursor-pointer underline underline-offset-[3px] hover:text-[var(--accent-strong)]"
                  onClick={handleChangeRoot}
                >
                  选择其它目录
                </button>
              </div>
            </>
          ) : repoStatus === 'need-pick' ? (
            <>
              {runtimeRef.current?.canPickRepository() ? (
                <>
                  <h1 className="mt-1 text-[17px] font-[650] tracking-[0.2px] text-foreground">
                    选择你的工作目录
                  </h1>
                  <p className="m-0 text-[13px] leading-[1.7] text-muted-foreground">
                    草稿会以 .md
                    文件、图片会以真实图片文件保存在你指定的文件夹里，
                    与本地文件完全同构，可随时用其它工具打开。
                  </p>
                  <div className="flex flex-col gap-2.5 mt-1.5">
                    <Button size="lg" onClick={() => void handlePickRoot()}>
                      打开目录
                    </Button>
                    {runtimeRef.current?.canUseInternalStorage() ? (
                      <button
                        className="self-center border-none bg-transparent text-xs text-muted-foreground cursor-pointer underline underline-offset-[3px] hover:text-[var(--accent-strong)]"
                        onClick={() => void handleUseOpfs()}
                      >
                        改用浏览器内置存储
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <h1 className="mt-1 text-[17px] font-[650] tracking-[0.2px] text-foreground">
                    使用浏览器内置存储
                  </h1>
                  <p className="m-0 text-[13px] leading-[1.7] text-muted-foreground">
                    当前浏览器/环境禁用了「选择目录」能力（常见于企业策略或安全扩展）。
                    仍可改用浏览器内置存储继续写作：同样支持 .md
                    文档、文件夹与图片，
                    只是数据存放在浏览器内部，不会出现在你的电脑文件夹里。
                  </p>
                  <div className="flex flex-col gap-2.5 mt-1.5">
                    <Button size="lg" onClick={() => void handleUseOpfs()}>
                      使用内置存储
                    </Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <h1 className="mt-1 text-[17px] font-[650] tracking-[0.2px] text-foreground">
                正在检查工作目录…
              </h1>
            </>
          )}

          <p className="mt-1.5 pt-3 border-t border-dashed border-border text-[11px] leading-[1.7] text-[var(--faint)]">
            文件保存在你的本地，稿域不会上传任何内容。
          </p>
        </div>
      </div>
    )
  }

  return (
    <SidebarProvider className="h-full min-h-0">
      <Sidebar className="app-sidebar border-r-0!" collapsible="offcanvas">
        <SidebarHeader className="min-h-[55px] justify-center px-3.5 py-3">
          <Brand />
        </SidebarHeader>
        <SidebarContent className="overflow-hidden">
          <FileTree
            rootName={rootName}
            tree={tree}
            activePath={activePath}
            onSelect={(path) => void openMarkdown(path)}
            onCreateMarkdown={handleCreateMarkdown}
            onCreateDirectory={handleCreateDirectory}
            onRename={handleRenameNode}
            onDelete={handleDeleteNode}
            onChangeRoot={() => void handlePickRoot()}
            onRefresh={handleRefresh}
            onLocateImage={handleLocateImage}
          />
        </SidebarContent>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="h-full min-w-0 p-2 overflow-hidden">
        <section
          className={`workspace-panel ${isPreviewOnly ? 'mode-preview' : ''}`}
        >
          <div className="workspace-panel-head">
            <div className="workspace-panel-head-left">
              <SidebarTrigger className="rounded-md" />
            </div>
            <ToggleGroup
              type="single"
              value={viewMode}
              variant="outline"
              size="sm"
              spacing={0}
              aria-label="工作区模式"
              onValueChange={(value) =>
                value && setViewMode(value as 'split' | 'preview')
              }
            >
              <ToggleGroupItem value="split" aria-label="对照模式">
                对照
              </ToggleGroupItem>
              <ToggleGroupItem value="preview" aria-label="预览模式">
                预览
              </ToggleGroupItem>
            </ToggleGroup>
            <Toolbar
              onCopy={() => void handleCopy()}
              onImport={handleImport}
              onExportMarkdown={() => void handleExportMarkdown()}
              onExportBackup={() => void handleExportBackup()}
              onExportImage={() => void handleExportImage()}
              exporting={exporting}
              hasActiveDraft={Boolean(activeDraft)}
            />
          </div>
          {activeDraft ? (
            <ResizablePanelGroup
              key={isNarrow ? 'vertical' : 'horizontal'}
              className="flex-1 min-w-0 min-h-0 overflow-hidden"
              orientation={isNarrow ? 'vertical' : 'horizontal'}
            >
              <ResizablePanel
                id="editor"
                className="min-w-0 min-h-0 overflow-hidden"
                panelRef={editorPanelRef}
                collapsible
                collapsedSize={0}
                defaultSize={isNarrow ? '50%' : undefined}
                minSize={isNarrow ? MIN_EDITOR_HEIGHT_PX : MIN_EDITOR_PX}
              >
                <EditorPane
                  value={markdown}
                  onChange={setMarkdown}
                  onAddImage={handleAddImage}
                  imageNames={availableImageNames}
                  fileKey={activePath}
                  sync={scrollSync}
                  jumpRequest={jumpRequest}
                  collapsed={isPreviewOnly}
                  outlineOpen={outlineOpen}
                />
              </ResizablePanel>
              <TooltipHint content="拖动调整 · 双击复位">
                <ResizableHandle
                  withHandle
                  className="workspace-resize-handle"
                  disabled={isPreviewOnly}
                />
              </TooltipHint>
              <ResizablePanel
                id="preview"
                className="min-w-0 min-h-0 overflow-hidden"
                defaultSize={isNarrow ? '50%' : MIN_PREVIEW_PX}
                minSize={isNarrow ? MIN_PREVIEW_HEIGHT_PX : MIN_PREVIEW_PX}
                groupResizeBehavior={
                  isNarrow ? 'preserve-relative-size' : 'preserve-pixel-size'
                }
              >
                <PreviewPane
                  darkPreview={darkPreview}
                  body={result.body}
                  theme={theme}
                  resizeKey={`${viewMode}:${isNarrow ? 'vertical' : 'horizontal'}`}
                  sync={scrollSync}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <Empty className="min-h-0">
              <EmptyHeader>
                <EmptyMedia
                  variant="icon"
                  className="size-12 text-secondary-foreground"
                >
                  <FileText className="size-8" />
                </EmptyMedia>
                <EmptyTitle className="text-md text-secondary-foreground">
                  请从左侧选择 Markdown 文件
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          )}
          {activeDraft && (
            <div className="workspace-statusbar">
              <div className="workspace-statusbar-left">
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  className="h-[26px] px-2 rounded-md text-muted-foreground text-[11px] font-medium aria-expanded:text-foreground [&_svg]:size-[13px] [&_svg]:opacity-[0.72]"
                  aria-label="目录"
                  aria-expanded={outlineOpen}
                  onClick={() => {
                    if (isPreviewOnly) setViewMode('split')
                    setOutlineOpen((value) => !value)
                  }}
                >
                  <ListTree />
                  <span>目录</span>
                </Button>
                <TooltipHint
                  content={
                    countLevel === 'over'
                      ? '已超过微信 2 万字上限'
                      : countLevel === 'warn'
                        ? '接近微信 2 万字上限'
                        : undefined
                  }
                >
                  <span className={countClass}>{charCount} 字</span>
                </TooltipHint>
                <span
                  className={`pane-stat save-state ${saveFailed ? 'text-destructive' : ''}`}
                >
                  {saveFailed ? '保存失败' : saved ? '已保存' : '保存中'}
                </span>
              </div>
              <ThemeControls
                darkPreview={darkPreview}
                onDarkPreviewChange={setDarkPreview}
                themeId={themeId}
                onThemeChange={setThemeId}
                densityId={densityId}
                onDensityChange={setDensityId}
              />
            </div>
          )}
        </section>
      </SidebarInset>
      <AlertDialog
        open={Boolean(confirmation)}
        onOpenChange={(open) => !open && setConfirmation(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmation?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void confirmation?.onConfirm()}
            >
              {confirmation?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  )
}
