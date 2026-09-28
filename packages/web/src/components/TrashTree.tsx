import {
  File,
  FileText,
  Image as ImageIcon,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import type { RepoNode, TrashEntry } from '@any-draft/shared'
import { cn } from 'cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  TreeIcon,
  TreeLabel,
  TreeNode,
  TreeNodeContent,
  TreeNodeTrigger,
} from '@/components/kibo-ui/tree'

interface Props {
  entries: TrashEntry[]
  nodes: Record<string, RepoNode[]>
  activeKey: string
  onOpenMarkdown: (id: string, relativePath: string) => void
  onRestore: (entry: TrashEntry) => void
  onDelete: (entry: TrashEntry) => void
  onEmpty: () => void
}

interface Branch {
  node: RepoNode
  children: Branch[]
}

const menuTriggerBtn =
  'size-5 inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-muted-foreground cursor-pointer transition-colors hover:bg-background hover:text-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100'

function nodeIcon(kind: RepoNode['kind']) {
  if (kind === 'markdown') return <FileText size={14} />
  if (kind === 'image') return <ImageIcon size={14} />
  return <File size={14} />
}

function buildChildren(nodes: RepoNode[]): Branch[] {
  const byParent = new Map<string, RepoNode[]>()
  for (const node of nodes) {
    const parent = node.path.slice(0, Math.max(0, node.path.lastIndexOf('/')))
    const children = byParent.get(parent) ?? []
    children.push(node)
    byParent.set(parent, children)
  }
  const build = (parent: string): Branch[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) =>
        a.kind === b.kind
          ? a.name.localeCompare(b.name, 'zh')
          : a.kind === 'dir'
            ? -1
            : 1,
      )
      .map((node) => ({
        node,
        children: node.kind === 'dir' ? build(node.path) : [],
      }))
  return build('')
}

export default function TrashTree({
  entries,
  nodes,
  activeKey,
  onOpenMarkdown,
  onRestore,
  onDelete,
  onEmpty,
}: Props) {
  const renderChild = (
    entry: TrashEntry,
    branch: Branch,
    level: number,
    isLast: boolean,
  ): React.ReactNode => {
    const { node, children } = branch
    const isDir = node.kind === 'dir'
    const key = `${entry.id}:${node.path}`
    return (
      <TreeNode
        key={key}
        nodeId={`trash-child:${key}`}
        level={level}
        isLast={isLast}
      >
        <TreeNodeTrigger
          className={cn(
            key === activeKey && 'bg-accent',
            node.kind !== 'markdown' && !isDir && 'cursor-default',
          )}
          onClick={() =>
            node.kind === 'markdown' && onOpenMarkdown(entry.id, node.path)
          }
        >
          <TreeIcon
            icon={isDir ? undefined : nodeIcon(node.kind)}
            hasChildren={isDir}
          />
          <TreeLabel className="text-xs truncate">{node.name}</TreeLabel>
        </TreeNodeTrigger>
        {isDir && (
          <TreeNodeContent hasChildren>
            {children.map((child, index) =>
              renderChild(
                entry,
                child,
                level + 1,
                index === children.length - 1,
              ),
            )}
          </TreeNodeContent>
        )}
      </TreeNode>
    )
  }

  const renderEntry = (entry: TrashEntry, index: number) => {
    const isDir = entry.kind === 'dir'
    const children = isDir ? buildChildren(nodes[entry.id] ?? []) : []
    return (
      <TreeNode
        key={entry.id}
        nodeId={`trash-entry:${entry.id}`}
        level={1}
        isLast={index === entries.length - 1}
      >
        <TreeNodeTrigger
          className={cn(
            `${entry.id}:` === activeKey && 'bg-accent',
            entry.kind !== 'markdown' && !isDir && 'cursor-default',
          )}
          onClick={() =>
            entry.kind === 'markdown' && onOpenMarkdown(entry.id, '')
          }
        >
          <TreeIcon
            icon={isDir ? undefined : nodeIcon(entry.kind)}
            hasChildren={isDir}
          />
          <span
            className="flex-1 min-w-0 truncate text-xs"
            title={`原位置：${entry.originalPath}`}
          >
            {entry.name}
          </span>
          <span className="flex-none">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label={`操作 ${entry.name}`}
                  className={menuTriggerBtn}
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreHorizontal size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={4}
                onClick={(event) => event.stopPropagation()}
              >
                <DropdownMenuItem onSelect={() => onRestore(entry)}>
                  <RotateCcw size={14} /> 恢复
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => onDelete(entry)}
                >
                  <Trash2 size={14} /> 彻底删除
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </TreeNodeTrigger>
        {isDir && (
          <TreeNodeContent hasChildren>
            {nodes[entry.id] ? (
              children.length ? (
                children.map((child, i) =>
                  renderChild(entry, child, 2, i === children.length - 1),
                )
              ) : (
                <p className="m-1 ml-1.5 text-[10.5px] text-muted-foreground">
                  空文件夹
                </p>
              )
            ) : (
              <p className="m-1 ml-1.5 text-[10.5px] text-muted-foreground">
                正在读取…
              </p>
            )}
          </TreeNodeContent>
        )}
      </TreeNode>
    )
  }

  return (
    <TreeNode nodeId="__trash__" level={0}>
      <TreeNodeTrigger>
        <TreeIcon icon={<Trash2 size={16} />} hasChildren />
        <TreeLabel className="text-xs font-semibold">
          回收站({entries.length})
        </TreeLabel>
        {entries.length > 0 && (
          <span className="flex-none">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="回收站快捷操作"
                  className={menuTriggerBtn}
                  onClick={(event) => event.stopPropagation()}
                >
                  <MoreHorizontal size={12} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={4}
                onClick={(event) => event.stopPropagation()}
              >
                <DropdownMenuItem variant="destructive" onSelect={onEmpty}>
                  <Trash2 size={14} /> 清空回收站
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        )}
      </TreeNodeTrigger>
      <TreeNodeContent hasChildren>
        {entries.length ? (
          entries.map(renderEntry)
        ) : (
          <p className="m-1 ml-1.5 text-[10.5px] text-muted-foreground text-center">
            回收站为空
          </p>
        )}
      </TreeNodeContent>
    </TreeNode>
  )
}
