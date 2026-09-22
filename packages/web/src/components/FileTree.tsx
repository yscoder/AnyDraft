import { useEffect, useRef, useState } from 'react'
import {
  BookText,
  BrushCleaning,
  File,
  FilePlus,
  FileText,
  Folder,
  FolderCog,
  FolderPlus,
  Image as ImageIcon,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import type { RepoNode } from '@any-draft/shared'
import { cn } from 'cn'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { TooltipHint } from '@/components/ui/tooltip'
import {
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
  TreeProvider,
  TreeView,
} from '@/components/kibo-ui/tree'

/** 目录树的递归分支 */
export interface TreeBranch {
  node: RepoNode
  children: TreeBranch[]
}

interface Props {
  rootName: string
  tree: TreeBranch[]
  activePath: string
  markdownCount?: number
  unusedImageCount: number
  onSelect: (path: string) => void
  onCreateMarkdown: (dirPath: string) => Promise<string | undefined>
  onCreateDirectory: (dirPath: string) => Promise<string | undefined>
  onRename: (path: string, newName: string) => Promise<string | undefined>
  onDelete: (path: string) => void
  onChangeRoot: () => void
  onRefresh: () => void
  onLocateImage: (name: string) => void
  onCleanupImages: () => void
}

/** 下拉菜单触发按钮：hover/聚焦/菜单打开时显形 */
const menuTriggerBtn =
  'size-5 inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-background hover:text-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100'

function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts)
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour} 小时前`
  const day = Math.floor(hour / 24)
  if (day < 30) return `${day} 天前`
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 文件图标按节点种类映射（目录由 kibo-ui 默认 Folder/FolderOpen 处理） */
function nodeIcon(kind: RepoNode['kind']) {
  if (kind === 'markdown') return <FileText size={14} />
  if (kind === 'image') return <ImageIcon size={14} />
  return <File size={14} />
}

/**
 * 文件树：基于 kibo-ui tree 原语的真实目录结构。
 * 树里只允许新建 md 文件与文件夹；图片与其它文件灰显只读。
 * 节点操作合并到下拉菜单中，移除了所有动画效果。
 */
export default function FileTree({
  rootName,
  tree,
  activePath,
  unusedImageCount,
  onSelect,
  onCreateMarkdown,
  onCreateDirectory,
  onRename,
  onDelete,
  onChangeRoot,
  onRefresh,
  onLocateImage,
  onCleanupImages,
}: Props) {
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [expandedIds, setExpandedIds] = useState<string[]>([''])
  const renameInputRef = useRef<HTMLInputElement>(null)
  const [now] = useState(() => Date.now())

  useEffect(() => {
    if (renamingPath) renameInputRef.current?.select()
  }, [renamingPath])

  const submitRename = () => {
    const path = renamingPath
    const newName = renameValue.trim()
    setRenamingPath(null)
    setRenameValue('')
    if (!path || !newName) return

    void onRename(path, newName).then((newPath) => {
      if (!newPath || newPath === path) return
      setExpandedIds((current) =>
        current.map((id) =>
          id === path || id.startsWith(`${path}/`)
            ? newPath + id.slice(path.length)
            : id,
        ),
      )
    })
  }

  /** 重命名行：替换 TreeNodeTrigger，保留缩进对齐 */
  const renameRow = (node: RepoNode, level: number) => (
    <TreeNode key={node.path} nodeId={node.path} level={level}>
      <div
        className="flex items-center gap-1.5 mx-1 my-0.5 rounded-md bg-card ring-2 ring-ring/35"
        style={{
          paddingLeft: level * 20 + 11,
          paddingRight: 12,
          paddingTop: 5,
          paddingBottom: 5,
        }}
      >
        <span className="flex-none opacity-55">
          {node.kind === 'dir' ? <Folder size={14} /> : nodeIcon(node.kind)}
        </span>
        <input
          ref={renameInputRef}
          className="flex-1 min-w-0 border-none bg-transparent font-inherit text-xs text-foreground outline-none"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitRename()
            if (e.key === 'Escape') setRenamingPath(null)
          }}
          onBlur={submitRename}
        />
      </div>
    </TreeNode>
  )

  const beginCreate = async (
    dirPath: string,
    create: (path: string) => Promise<string | undefined>,
  ) => {
    const createdPath = await create(dirPath)
    if (!createdPath) return

    const parts = dirPath.split('/').filter(Boolean)
    const parentPaths = ['']
    for (let i = 0; i < parts.length; i += 1) {
      parentPaths.push(parts.slice(0, i + 1).join('/'))
    }
    setExpandedIds((current) => [...new Set([...current, ...parentPaths])])
    setRenamingPath(createdPath)
    setRenameValue(createdPath.slice(createdPath.lastIndexOf('/') + 1))
  }

  /** 节点操作下拉菜单 */
  const renderNodeMenu = (node: RepoNode, isDir: boolean) => {
    const isMd = node.kind === 'markdown'
    const isRoot = node.path === ''
    const showNewActions = isDir
    const showEditActions = (isDir && !isRoot) || (!isDir && isMd)
    if (!showNewActions && !showEditActions) return null

    return (
      <span className="flex-none">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="更多操作"
              className={menuTriggerBtn}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal size={12} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={4}
            onClick={(event) => event.stopPropagation()}
          >
            {showNewActions && (
              <>
                <DropdownMenuItem
                  onSelect={() => void beginCreate(node.path, onCreateMarkdown)}
                >
                  <FilePlus size={14} /> 新建文档
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() =>
                    void beginCreate(node.path, onCreateDirectory)
                  }
                >
                  <FolderPlus size={14} /> 新建文件夹
                </DropdownMenuItem>
              </>
            )}
            {isRoot && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={unusedImageCount === 0}
                  onSelect={onCleanupImages}
                >
                  <BrushCleaning size={14} /> 清理未引用图片
                </DropdownMenuItem>
              </>
            )}
            {showNewActions && showEditActions && <DropdownMenuSeparator />}
            {showEditActions && (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    setRenamingPath(node.path)
                    setRenameValue(node.name)
                  }}
                >
                  <Pencil size={14} /> 重命名
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onDelete(node.path)}
                >
                  <Trash2 size={14} /> 删除
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    )
  }

  const renderNode = (branch: TreeBranch, level: number, isLast: boolean) => {
    const { node, children } = branch
    const isDir = node.kind === 'dir'
    const isMd = node.kind === 'markdown'
    const isImage = node.kind === 'image'
    const isActive = node.path === activePath
    const readonly = !isMd

    if (renamingPath === node.path) return renameRow(node, level)

    const meta = isImage
      ? `${formatBytes(node.size ?? 0)}`
      : isMd
        ? relativeTime(node.updatedAt ?? now, now)
        : ''

    return (
      <TreeNode
        key={node.path}
        nodeId={node.path}
        level={level}
        isLast={isLast}
      >
        <TreeNodeTrigger
          className={cn(
            isActive && 'bg-accent',
            !isImage && readonly && 'cursor-default',
          )}
          onClick={() => {
            if (isImage) onLocateImage(node.name)
            else if (isMd) onSelect(node.path)
          }}
        >
          <TreeIcon
            icon={isDir ? undefined : nodeIcon(node.kind)}
            hasChildren={isDir}
            className={cn(
              isActive ? 'opacity-100 text-foreground' : 'opacity-55',
              !isImage && readonly && 'opacity-35',
            )}
          />
          {isDir ? (
            <TreeLabel className="text-xs font-semibold">{node.name}</TreeLabel>
          ) : (
            <span className="flex flex-col gap-px flex-1 min-w-0">
              <span
                className={cn(
                  'text-xs leading-[1.3] truncate',
                  isActive && 'font-semibold text-foreground',
                  readonly && 'text-muted-foreground',
                )}
              >
                {node.name}
              </span>
              {meta && (
                <span className="text-[9.5px] text-muted-foreground/70 truncate">
                  {meta}
                </span>
              )}
            </span>
          )}
          {renderNodeMenu(node, isDir)}
        </TreeNodeTrigger>
        {isDir && (
          <TreeNodeContent hasChildren>
            {children.length === 0 ? (
              <p className="m-1 ml-1.5 text-center text-[10.5px] leading-[1.5] text-muted-foreground/70">
                空文件夹
              </p>
            ) : (
              children.map((b, i) =>
                renderNode(b, level + 1, i === children.length - 1),
              )
            )}
          </TreeNodeContent>
        )}
      </TreeNode>
    )
  }

  // 根目录节点：工作目录本身，可展开显示顶层内容
  const rootNode: RepoNode = { kind: 'dir', name: rootName, path: '' }

  return (
    <nav
      className="flex flex-col flex-1 w-full min-h-0 overflow-hidden"
      aria-label="文件"
    >
      <div className="flex-none flex items-center justify-between gap-1.5 min-h-10 py-[7px] pr-2 pl-3.5">
        <span className="text-xs font-semibold text-muted-foreground">
          文件
        </span>
        <div className="flex items-center gap-0.5">
          <TooltipHint content="更换目录">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-sm!"
              aria-label="更换目录"
              onClick={onChangeRoot}
            >
              <FolderCog />
            </Button>
          </TooltipHint>
          <TooltipHint content="刷新目录">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-sm!"
              aria-label="刷新目录"
              onClick={onRefresh}
            >
              <RefreshCw />
            </Button>
          </TooltipHint>
        </div>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pl-1.5"
        role="tree"
        aria-label="文件"
      >
        <TreeProvider
          expandedIds={expandedIds}
          onExpandedChange={setExpandedIds}
          selectable={false}
        >
          <TreeView className="p-0 overflow-hidden">
            <TreeNode nodeId="" level={0} isLast>
              <TreeNodeTrigger>
                <TreeIcon icon={<BookText size={16} />} />
                <TreeLabel className="text-xs font-semibold">
                  {rootName}
                </TreeLabel>
                {renderNodeMenu(rootNode, true)}
              </TreeNodeTrigger>
              <TreeNodeContent hasChildren>
                {tree.length === 0 ? (
                  <p className="m-1 ml-1.5 text-[10.5px] leading-[1.5] text-muted-foreground/70">
                    点击上方 + 新建第一篇文档
                  </p>
                ) : (
                  tree.map((b, i) => renderNode(b, 1, i === tree.length - 1))
                )}
              </TreeNodeContent>
            </TreeNode>
          </TreeView>
        </TreeProvider>
      </div>
    </nav>
  )
}
