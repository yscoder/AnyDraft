import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Eraser,
  File,
  FilePlus,
  FileText,
  FolderOpen,
  FolderPlus,
  Image as ImageIcon,
  Pencil,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type { RepoNode } from '@any-draft/shared';
import { Button } from './ui/button';
import { TooltipHint } from '@/components/ui/tooltip';

/** 目录树的递归分支 */
export interface TreeBranch {
  node: RepoNode;
  children: TreeBranch[];
}

interface Props {
  rootName: string;
  tree: TreeBranch[];
  activePath: string;
  markdownCount: number;
  unusedImageCount: number;
  onSelect: (path: string) => void;
  onCreateMarkdown: (dirPath: string) => void;
  onCreateDirectory: (dirPath: string) => void;
  onRename: (path: string, newName: string) => void;
  onDelete: (path: string) => void;
  onRefresh: () => void;
  onLocateImage: (name: string) => void;
  onCleanupImages: () => void;
}

function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** 文件图标按节点种类映射 */
function nodeIcon(kind: RepoNode['kind']) {
  if (kind === 'markdown') return <FileText size={14} />;
  if (kind === 'image') return <ImageIcon size={14} />;
  return <File size={14} />;
}

/**
 * 文件树：真实目录结构。
 * 树里只允许新建 md 文件与文件夹；图片与其它文件灰显只读。
 */
export default function FileTree({
  rootName,
  tree,
  activePath,
  markdownCount,
  unusedImageCount,
  onSelect,
  onCreateMarkdown,
  onCreateDirectory,
  onRename,
  onDelete,
  onRefresh,
  onLocateImage,
  onCleanupImages,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['']));
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (renamingPath) renameInputRef.current?.select();
  }, [renamingPath]);

  const toggle = (path: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const submitRename = () => {
    if (renamingPath && renameValue.trim()) onRename(renamingPath, renameValue);
    setRenamingPath(null);
    setRenameValue('');
  };

  const renameInput = (path: string) => (
    <div key={path} className="tree-file renaming">
      {nodeIcon('markdown')}
      <input
        ref={renameInputRef}
        className="tree-rename-input"
        value={renameValue}
        onChange={(e) => setRenameValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submitRename();
          if (e.key === 'Escape') setRenamingPath(null);
        }}
        onBlur={submitRename}
      />
    </div>
  );

  const renderNode = (branch: TreeBranch) => {
    const { node, children } = branch;
    const isDir = node.kind === 'dir';
    const isMd = node.kind === 'markdown';
    const isImage = node.kind === 'image';
    const isActive = node.path === activePath;
    const open = expanded.has(node.path);

    if (renamingPath === node.path) return renameInput(node.path);

    // 目录行：点击展开/收起，hover 显示「新建 md / 新建文件夹 / 重命名 / 删除」
    if (isDir) {
      return (
        <div key={node.path}>
          <div className="tree-file dir">
            <button className="tree-folder-main" onClick={() => toggle(node.path)}>
              {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              <FolderOpen size={14} />
              <span className="tree-folder-name">{node.name}</span>
              {node.path === '' && <span className="tree-count">{markdownCount}</span>}
            </button>
            <span className="tree-file-actions">
              <TooltipHint content="新建文档">
                <button aria-label="新建文档" onClick={() => onCreateMarkdown(node.path)}>
                  <FilePlus size={12} />
                </button>
              </TooltipHint>
              <TooltipHint content="新建文件夹">
                <button aria-label="新建文件夹" onClick={() => onCreateDirectory(node.path)}>
                  <FolderPlus size={12} />
                </button>
              </TooltipHint>
              {node.path !== '' && (
                <>
                  <TooltipHint content="重命名">
                    <button
                      aria-label={`重命名 ${node.name}`}
                      onClick={() => {
                        setRenamingPath(node.path);
                        setRenameValue(node.name);
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                  </TooltipHint>
                  <TooltipHint content="删除">
                    <button aria-label={`删除 ${node.name}`} onClick={() => onDelete(node.path)}>
                      <Trash2 size={12} />
                    </button>
                  </TooltipHint>
                </>
              )}
            </span>
          </div>
          {open && (
            <div className="tree-children" role="group">
              {children.length === 0 ? (
                <p className="tree-empty">空文件夹</p>
              ) : (
                children.map(renderNode)
              )}
            </div>
          )}
        </div>
      );
    }

    // 文件行：md 可编辑，图片与其它文件灰显只读
    const readonly = !isMd;
    const className = `tree-file ${isActive ? 'active' : ''} ${readonly ? 'readonly' : ''} ${isImage ? 'image' : ''}`;
    const meta = isImage
      ? `${formatBytes(node.size ?? 0)}`
      : isMd
        ? relativeTime(node.updatedAt ?? now, now)
        : '';
    return (
      <div key={node.path} className={className} role="treeitem" aria-selected={isActive}>
        <button
          className="tree-file-main"
          onClick={() => {
            if (isImage) onLocateImage(node.name);
            else if (isMd) onSelect(node.path);
          }}
          style={readonly && !isImage ? { cursor: 'default' } : undefined}
        >
          {nodeIcon(node.kind)}
          <span className="tree-file-text">
            <span className="tree-file-name">{node.name}</span>
            {meta && <span className="tree-file-meta">{meta}</span>}
          </span>
        </button>
        {isMd && (
          <span className="tree-file-actions">
            <TooltipHint content="重命名">
              <button
                aria-label={`重命名 ${node.name}`}
                onClick={() => {
                  setRenamingPath(node.path);
                  setRenameValue(node.name);
                }}
              >
                <Pencil size={12} />
              </button>
            </TooltipHint>
            <TooltipHint content="删除">
              <button aria-label={`删除 ${node.name}`} onClick={() => onDelete(node.path)}>
                <Trash2 size={12} />
              </button>
            </TooltipHint>
          </span>
        )}
      </div>
    );
  };

  return (
    <nav className="file-tree" aria-label="文件">
      <div className="tree-head">
        <span className="tree-head-label font-semibold">文件</span>
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

      <div className="tree-body" role="tree" aria-label="文件">
        {/* 根目录行：工作目录本身，展开后即顶层内容 */}
        <div className="tree-file dir">
          <button className="tree-folder-main" onClick={() => toggle('')}>
            {expanded.has('') ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <FolderOpen size={14} />
            <span className="tree-folder-name">{rootName}</span>
            <span className="tree-count">{markdownCount}</span>
          </button>
          <span className="tree-file-actions">
            <TooltipHint content="新建文档">
              <button aria-label="新建文档" onClick={() => onCreateMarkdown('')}>
                <FilePlus size={12} />
              </button>
            </TooltipHint>
            <TooltipHint content="新建文件夹">
              <button aria-label="新建文件夹" onClick={() => onCreateDirectory('')}>
                <FolderPlus size={12} />
              </button>
            </TooltipHint>
          </span>
        </div>
        {expanded.has('') && (
          <div className="tree-children" role="group">
            {tree.length === 0 ? <p className="tree-empty">点击上方 + 新建第一篇文档</p> : tree.map(renderNode)}
          </div>
        )}
        {unusedImageCount > 0 && (
          <button className="tree-cleanup" onClick={onCleanupImages}>
            <Eraser size={13} />
            清理 {unusedImageCount} 张未引用图片
          </button>
        )}
      </div>
    </nav>
  );
}
