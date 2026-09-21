import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import EditorPane from '@/components/EditorPane';
import FileTree, { type TreeBranch } from '@/components/FileTree';
import PreviewPane from '@/components/PreviewPane';
import ThemeControls from '@/components/ThemeControls';
import Toolbar from '@/components/Toolbar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { TooltipHint } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { ListTree } from 'lucide-react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { toast } from 'sonner';
import { collectImageRefs, ensureHighlighter, isHighlighterReady, renderArticle } from '@/core/markdown/markdown';
import { copyRichText } from '@/core/transfer/clipboard';
import {
  downloadBlob,
  exportBackupZip,
  exportDraftMarkdown,
  importFiles,
  safeFileName,
} from '@/core/transfer/exchange';
import { renderLongImage } from '@/core/transfer/longimage';
import { getDensity, getTheme } from '@/core/theme/theme';
import { downscaleImage } from '@/core/image/images';
import { createScrollSyncChannel } from '@/core/editor/scrollSync';
import { locateImage } from '@/core/drafts/locate';
import {
  baseNamePath,
  canPickDirectory,
  canUseStorage,
  dataUrlToBlob,
  dirnamePath,
  getOpfsRoot,
  pickRootDirectory,
  queryRootPermission,
  requestRootPermission,
  FsaRepository,
} from '@/core/fs/fsa';
import { loadRootHandle, saveRootHandle } from '@/core/fs/handleStore';
import type { ContentRepository, Draft, RepoNode } from '@any-draft/shared';
import { readStored, writeStored } from '@/core/storage';
import './styles.css';

/** 编辑器侧最小宽度（拖拽时保留，预览因此可达 desktop 宽度） */
const MIN_EDITOR_PX = 180;
/** 预览最小宽度（容纳真实手机宽度） */
const MIN_PREVIEW_PX = 430;
const MIN_EDITOR_HEIGHT_PX = 160;
const MIN_PREVIEW_HEIGHT_PX = 220;

interface Confirmation {
  title: string;
  description: string;
  actionLabel: string;
  onConfirm: () => void | Promise<void>;
}

/** 工作目录授权状态机 */
type RepoStatus = 'checking' | 'unsupported' | 'need-pick' | 'need-permission' | 'ready';

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

export default function App() {
  /* ---------------- 工作目录（平台适配层） ---------------- */
  const [repoStatus, setRepoStatus] = useState<RepoStatus>('checking');
  const repoRef = useRef<ContentRepository | null>(null);
  const [pendingName, setPendingName] = useState('');
  const pendingHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [rootName, setRootName] = useState('');

  const [nodes, setNodes] = useState<RepoNode[]>([]);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [activePath, setActivePath] = useState('');
  /** 图片：文件名（basename）→ 可用于 <img> 的 URL（Web 为 blob:） */
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  const activePathRef = useRef('');
  activePathRef.current = activePath;
  const markdownRef = useRef('');
  const diskContentsRef = useRef<Record<string, string>>({});
  /** 异步目录操作进行中：期间跳过「选中项失效」的自动兜底，避免竞态 */
  const mutatingRef = useRef(false);

  const [themeId, setThemeId] = useState<string>(() => readStored('theme') ?? 'classic');
  const [densityId, setDensityId] = useState<string>(() => readStored('density') ?? 'standard');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [exporting, setExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'preview'>('split');
  const isPreviewOnly = viewMode === 'preview';
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const editorPanelRef = useRef<PanelImperativeHandle>(null);

  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const density = useMemo(() => getDensity(densityId), [densityId]);
  const [hlReady, setHlReady] = useState(isHighlighterReady);

  /* ---------------- 派生状态 ---------------- */
  const mdNodes = useMemo(() => nodes.filter((n) => n.kind === 'markdown'), [nodes]);
  const imageNodes = useMemo(() => nodes.filter((n) => n.kind === 'image'), [nodes]);
  const activeDraft = activePath
    ? {
        id: activePath,
        name: baseNamePath(activePath).replace(/\.(md|markdown)$/i, ''),
        content: contents[activePath] ?? '',
        updatedAt: Date.now(),
      }
    : null;
  const markdown = activePath ? contents[activePath] ?? '' : '';
  markdownRef.current = markdown;

  const setMarkdown = (v: string) => {
    if (!activePath) return;
    setContents((prev) => (prev[activePath] === v ? prev : { ...prev, [activePath]: v }));
  };

  const deferredMarkdown = useDeferredValue(markdown);
  const result = useMemo(
    () => renderArticle(deferredMarkdown, theme, imageUrls, density),
    // hlReady 只作为「重算一次」的信号，不参与渲染入参
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deferredMarkdown, theme, imageUrls, density, hlReady],
  );
  const charCount = useMemo(() => markdown.replace(/\s/g, '').length, [markdown]);
  const countLevel = charCount >= 20000 ? 'over' : charCount >= 18000 ? 'warn' : 'normal';
  const countClass = `pane-stat count ${countLevel === 'warn' ? 'count-warn' : countLevel === 'over' ? 'count-over' : ''}`;

  /** 被任意文档引用的图片名（两种语法都算） */
  const usedImageNames = useMemo(() => {
    const used = new Set<string>();
    for (const content of Object.values(contents)) {
      for (const name of collectImageRefs(content)) used.add(name);
    }
    return used;
  }, [contents]);

  const unusedImageNodes = useMemo(
    () => imageNodes.filter((n) => !usedImageNames.has(baseNamePath(n.path))),
    [imageNodes, usedImageNames],
  );

  /** 供定位 / 备份复用的「文档列表」形状 */
  const draftsForLocate = useMemo<Draft[]>(
    () =>
      mdNodes.map((n) => ({
        id: n.path,
        name: baseNamePath(n.path),
        content: contents[n.path] ?? '',
        updatedAt: n.updatedAt ?? 0,
      })),
    [mdNodes, contents],
  );

  const tree = useMemo<TreeBranch[]>(() => {
    const byParent = new Map<string, RepoNode[]>();
    for (const n of nodes) {
      const parent = dirnamePath(n.path);
      const list = byParent.get(parent);
      if (list) list.push(n);
      else byParent.set(parent, [n]);
    }
    const build = (parentPath: string): TreeBranch[] => {
      const children = byParent.get(parentPath) ?? [];
      const dirs = children.filter((n) => n.kind === 'dir').sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      const files = children.filter((n) => n.kind !== 'dir').sort((a, b) => a.name.localeCompare(b.name, 'zh'));
      return [...dirs, ...files].map((node) => ({ node, children: node.kind === 'dir' ? build(node.path) : [] }));
    };
    return build('');
  }, [nodes]);

  /* ---------------- 生命周期：高亮 / 主题 / 布局 ---------------- */
  useEffect(() => {
    if (hlReady) return;
    let cancelled = false;
    void ensureHighlighter().then(() => {
      if (!cancelled) setHlReady(isHighlighterReady());
    });
    return () => {
      cancelled = true;
    };
  }, [hlReady]);

  useEffect(() => {
    writeStored('theme', theme.id);
  }, [theme.id]);
  useEffect(() => {
    writeStored('density', densityId);
  }, [densityId]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => setIsNarrow(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const panel = editorPanelRef.current;
    if (!panel) return;
    if (isPreviewOnly) panel.collapse();
    else panel.expand();
  }, [isPreviewOnly, isNarrow]);

  /* ---------------- 工作目录初始化 ---------------- */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!canUseStorage()) {
        setRepoStatus('unsupported');
        return;
      }
      const handle = await loadRootHandle();
      if (cancelled) return;
      if (!handle) {
        setRepoStatus('need-pick');
        return;
      }
      if (await queryRootPermission(handle)) {
        await openRepo(handle);
      } else {
        pendingHandleRef.current = handle;
        setPendingName(handle.name);
        setRepoStatus('need-permission');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 重新扫描目录（不动选中项），返回 md 文件路径列表 */
  const scanRepo = async (repo: ContentRepository): Promise<string[]> => {
    const all = await repo.list();
    const mds = all.filter((n) => n.kind === 'markdown');
    const imgs = all.filter((n) => n.kind === 'image');
    const nextContents: Record<string, string> = {};
    await Promise.all(mds.map(async (n) => {
      nextContents[n.path] = await repo.readTextFile(n.path);
    }));
    const nextUrls: Record<string, string> = {};
    for (const n of imgs) nextUrls[baseNamePath(n.path)] = await repo.imageUrl(n.path);

    diskContentsRef.current = { ...nextContents };
    setNodes(all);
    setContents(nextContents);
    setImageUrls((prev) => {
      for (const [k, url] of Object.entries(prev)) if (nextUrls[k] !== url) URL.revokeObjectURL(url);
      return nextUrls;
    });
    return mds.map((n) => n.path);
  };

  const refreshRepo = async (): Promise<void> => {
    const repo = repoRef.current;
    if (!repo) return;
    const mdPaths = await scanRepo(repo);
    const cur = activePathRef.current;
    if (cur && !mdPaths.includes(cur)) setActiveFile(mdPaths[0] ?? '');
  };

  const setActiveFile = (path: string) => {
    setActivePath(path);
    writeStored('active-file', path);
  };

  const openRepo = async (handle: FileSystemDirectoryHandle): Promise<void> => {
    const repo = new FsaRepository(handle);
    repoRef.current = repo;
    setRootName(repo.rootName || '浏览器内置存储');
    const mdPaths = await scanRepo(repo);
    const savedPath = readStored('active-file');
    const restored = savedPath && mdPaths.includes(savedPath) ? savedPath : mdPaths[0] ?? '';
    setActiveFile(restored);
    await saveRootHandle(handle);
    setRepoStatus('ready');
  };

  const runMutation = async (fn: () => Promise<void>): Promise<void> => {
    mutatingRef.current = true;
    try {
      await fn();
    } finally {
      mutatingRef.current = false;
    }
  };

  /** 选中项在目录里消失了（外部删除 / 自身删除）时回落到第一篇 */
  useEffect(() => {
    if (repoStatus !== 'ready' || mutatingRef.current) return;
    if (!activePath) return;
    if (mdNodes.some((n) => n.path === activePath)) return;
    setActiveFile(mdNodes[0]?.path ?? '');
  }, [mdNodes, activePath, repoStatus]);

  /* ---------------- 自动保存（防抖写盘） ---------------- */
  useEffect(() => {
    const repo = repoRef.current;
    const path = activePath;
    if (repoStatus !== 'ready' || !repo || !path) return;
    const disk = diskContentsRef.current[path] ?? '';
    if (markdown === disk) {
      setSaved(true);
      return;
    }
    setSaved(false);
    const timer = window.setTimeout(() => {
      const toWrite = markdown;
      void repo.writeTextFile(path, toWrite).then(() => {
        diskContentsRef.current[path] = toWrite;
        setSaved(true);
      }).catch(() => {
        flash('保存失败，请检查目录写入权限', 'error');
        setSaved(true);
      });
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markdown, activePath, repoStatus]);

  // 页面切后台时立即落盘，避免防抖窗口内丢改动
  const saveStateRef = useRef({ path: '', content: '', clean: true });
  saveStateRef.current = {
    path: activePath,
    content: markdown,
    clean: markdown === (diskContentsRef.current[activePath] ?? ''),
  };
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      const { path, content, clean } = saveStateRef.current;
      const repo = repoRef.current;
      if (!repo || !path || clean) return;
      void repo.writeTextFile(path, content).then(() => {
        diskContentsRef.current[path] = content;
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  const flash = (msg: string, kind: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    toast[kind](msg);
  };

  /* ---------------- 工作目录授权动作 ---------------- */
  const handlePickRoot = async () => {
    const handle = await pickRootDirectory();
    if (!handle) return;
    try {
      await openRepo(handle);
      flash(`已连接目录「${handle.name}」`, 'success');
    } catch (err) {
      console.warn('打开目录失败', err);
      flash('目录打开失败', 'error');
    }
  };

  const handleGrantPermission = async () => {
    const handle = pendingHandleRef.current;
    if (!handle) {
      setRepoStatus('need-pick');
      return;
    }
    if (await requestRootPermission(handle)) {
      try {
        await openRepo(handle);
      } catch (err) {
        console.warn('打开目录失败', err);
        flash('目录打开失败', 'error');
      }
    } else {
      flash('未获得该目录的访问权限', 'warning');
    }
  };

  const handleChangeRoot = () => {
    pendingHandleRef.current = null;
    setPendingName('');
    setRepoStatus('need-pick');
  };

  /** 目录选择器不可用时的兜底：改用浏览器内置存储（OPFS） */
  const handleUseOpfs = async () => {
    try {
      const handle = await getOpfsRoot();
      await openRepo(handle);
      flash('已使用浏览器内置存储', 'success');
    } catch (err) {
      console.warn('打开内置存储失败', err);
      flash('打开内置存储失败', 'error');
    }
  };

  /* ---------------- 文件树操作 ---------------- */
  const handleRefresh = () =>
    void runMutation(async () => {
      try {
        await refreshRepo();
        flash('已刷新目录', 'success');
      } catch {
        flash('刷新失败，请检查目录权限', 'error');
      }
    });

  const handleCreateMarkdown = (dirPath: string) =>
    void runMutation(async () => {
      const repo = repoRef.current;
      if (!repo) return;
      try {
        const path = await repo.createTextFile(dirPath, '未命名.md');
        await refreshRepo();
        setActiveFile(path);
        flash(`已新建「${baseNamePath(path)}」`, 'success');
      } catch {
        flash('新建失败', 'error');
      }
    });

  const handleCreateDirectory = (dirPath: string) =>
    void runMutation(async () => {
      const repo = repoRef.current;
      if (!repo) return;
      try {
        await repo.createDirectory(dirPath, '新建文件夹');
        await refreshRepo();
        flash('已新建文件夹', 'success');
      } catch {
        flash('新建文件夹失败', 'error');
      }
    });

  const handleRenameNode = (path: string, newName: string) => {
    const repo = repoRef.current;
    const trimmed = newName.trim();
    if (!repo || !trimmed) return;
    const node = nodes.find((n) => n.path === path);
    if (!node || node.name === trimmed) return;
    void runMutation(async () => {
      try {
        const newPath = await repo.renameNode(path, trimmed);
        const remap = <T,>(obj: Record<string, T>): Record<string, T> => {
          const next: Record<string, T> = {};
          for (const [k, v] of Object.entries(obj)) {
            next[k === path || k.startsWith(`${path}/`) ? newPath + k.slice(path.length) : k] = v;
          }
          return next;
        };
        setContents((prev) => remap(prev));
        diskContentsRef.current = remap(diskContentsRef.current);
        if (activePath === path || activePath.startsWith(`${path}/`)) {
          setActiveFile(activePath === path ? newPath : newPath + activePath.slice(path.length));
        }
        await scanRepo(repo);
        flash(`已重命名为「${baseNamePath(newPath)}」`, 'success');
      } catch (err) {
        flash(err instanceof Error ? err.message : '重命名失败', 'error');
        await scanRepo(repo).catch(() => {});
      }
    });
  };

  const handleDeleteNode = (path: string) => {
    const repo = repoRef.current;
    const node = nodes.find((n) => n.path === path);
    if (!repo || !node) return;
    const isDir = node.kind === 'dir';
    setConfirmation({
      title: isDir ? '删除文件夹？' : '删除文件？',
      description: `「${node.name}」${isDir ? '及其全部内容' : ''}将被永久删除，此操作无法撤销。`,
      actionLabel: isDir ? '删除文件夹' : '删除文件',
      onConfirm: () =>
        runMutation(async () => {
          try {
            await repo.removeNode(path);
            await refreshRepo();
            flash(`已删除「${node.name}」`, 'success');
          } catch {
            flash('删除失败', 'error');
          }
        }),
    });
  };

  /* ---------------- 图片 ---------------- */
  const refreshTimerRef = useRef<number | null>(null);
  const refreshSoon = () => {
    if (refreshTimerRef.current != null) window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void runMutation(async () => {
        try {
          await refreshRepo();
        } catch {
          /* 目录刷新失败不打断输入 */
        }
      });
    }, 500);
  };

  /** 编辑器拖入/粘贴图片：降采样后写入当前文档同级文件夹 */
  const handleAddImage = async (file: File): Promise<string | null> => {
    const repo = repoRef.current;
    if (!repo || !activePath) return null;
    try {
      const dataUrl = await downscaleImage(file);
      const blob = dataUrlToBlob(dataUrl);
      const path = await repo.createImageFile(dirnamePath(activePath), file.name, blob);
      const name = baseNamePath(path);
      const url = await repo.imageUrl(path);
      setImageUrls((prev) => ({ ...prev, [name]: url }));
      refreshSoon();
      return name;
    } catch (err) {
      console.warn('图片保存失败', err);
      flash('图片保存失败', 'error');
      return null;
    }
  };

  const [jumpRequest, setJumpRequest] = useState<{ line: number; nonce: number } | null>(null);
  const jumpNonce = useRef(0);

  const handleLocateImage = (name: string) => {
    const hit = locateImage(draftsForLocate, activePath, name);
    if (!hit) {
      flash(`「${name}」还没有被任何文档引用`, 'warning');
      return;
    }
    if (hit.draft.id !== activePath) {
      setActiveFile(hit.draft.id);
      flash(`已跳到「${hit.draft.name}」`, 'info');
    }
    jumpNonce.current += 1;
    setJumpRequest({ line: hit.line, nonce: jumpNonce.current });
  };

  const handleCleanupImages = () => {
    const repo = repoRef.current;
    if (!repo || unusedImageNodes.length === 0) return;
    setConfirmation({
      title: '清理未引用图片？',
      description: `将永久删除 ${unusedImageNodes.length} 张未被任何文档引用的图片，此操作无法撤销。`,
      actionLabel: `删除 ${unusedImageNodes.length} 张图片`,
      onConfirm: () =>
        runMutation(async () => {
          try {
            await Promise.all(unusedImageNodes.map((n) => repo.removeNode(n.path)));
            await refreshRepo();
            flash(`已清理 ${unusedImageNodes.length} 张未引用图片`, 'success');
          } catch {
            flash('部分图片删除失败', 'warning');
          }
        }),
    });
  };

  /* ---------------- 复制 / 导出 ---------------- */
  /** 把当前正文引用的图片换成 data URL（公众号剪贴板不接受 blob URL） */
  const resolveImageDataUrls = async (md: string): Promise<Record<string, string>> => {
    const refs = collectImageRefs(md);
    const out: Record<string, string> = {};
    await Promise.all([...refs].map(async (name) => {
      const url = imageUrls[name];
      if (!url) return;
      try {
        const blob = await (await fetch(url)).blob();
        const reader = new FileReader();
        out[name] = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
      } catch {
        /* 单张转换失败则跳过，正文退回占位提示 */
      }
    }));
    return out;
  };

  const handleCopy = async () => {
    await ensureHighlighter();
    const dataUrls = await resolveImageDataUrls(markdown);
    const { html } = renderArticle(markdown, theme, dataUrls, density);
    const ok = await copyRichText(html);
    flash(
      ok ? '已复制，去公众号 ⌘V 粘贴' : '复制失败，请用浏览器 Chrome/Edge',
      ok ? 'success' : 'error',
    );
  };

  const handleExportMarkdown = () => {
    if (!activeDraft) return;
    exportDraftMarkdown(activeDraft);
    flash(`已导出「${activeDraft.name}」`, 'success');
  };

  const handleExportBackup = async () => {
    setExporting(true);
    try {
      const repo = repoRef.current;
      const imagesData: Record<string, string> = {};
      if (repo) {
        await Promise.all(imageNodes.map(async (n) => {
          imagesData[baseNamePath(n.path)] = await repo.readImageAsDataUrl(n.path);
        }));
      }
      await exportBackupZip(draftsForLocate, imagesData);
      flash(`已导出备份（${draftsForLocate.length} 篇草稿 · ${imageNodes.length} 张图片）`, 'success');
    } catch (err) {
      console.warn('备份失败', err);
      flash('备份导出失败', 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleExportImage = async () => {
    setExporting(true);
    try {
      await ensureHighlighter();
      const dataUrls = await resolveImageDataUrls(markdown);
      const { body } = renderArticle(markdown, theme, dataUrls, density);
      const blob = await renderLongImage({ body, theme, author: '稿域' });
      downloadBlob(`${safeFileName(activeDraft?.name ?? '长图')}.png`, blob);
      flash('长图已导出', 'success');
    } catch (err) {
      console.warn('长图导出失败', err);
      flash(err instanceof Error ? err.message : '长图导出失败', 'error');
    } finally {
      setExporting(false);
    }
  };

  /* ---------------- 导入 ---------------- */
  const handleImport = (files: File[]) =>
    void runMutation(async () => {
      const repo = repoRef.current;
      if (!repo) return;
      try {
        const { drafts: incoming, images: incomingImages, skipped } = await importFiles(files);
        const imageCount = Object.keys(incomingImages).length;
        if (!incoming.length && !imageCount) {
          flash(skipped.length ? '没有可导入的 Markdown 或备份文件' : '文件是空的', 'warning');
          return;
        }
        // 统一放进根目录下的新文件夹，不与现有文件混杂
        const folder = await repo.createDirectory('', `导入-${stamp()}`);
        let firstPath = '';
        for (const d of incoming) {
          const path = await repo.createTextFile(folder, `${safeFileName(d.name)}.md`, d.content);
          if (!firstPath) firstPath = path;
        }
        for (const [name, dataUrl] of Object.entries(incomingImages)) {
          await repo.createImageFile(folder, name, dataUrlToBlob(dataUrl));
        }
        await refreshRepo();
        if (firstPath) setActiveFile(firstPath);
        const parts = [incoming.length ? `${incoming.length} 篇草稿` : '', imageCount ? `${imageCount} 张图片` : ''];
        flash(
          `已导入 ${parts.filter(Boolean).join(' · ')}${skipped.length ? `（跳过 ${skipped.length} 个文件）` : ''}`,
          'success',
        );
      } catch (err) {
        console.warn('导入失败', err);
        flash('导入失败，文件可能已损坏', 'error');
      }
    });

  /** 编辑器跳转请求（文件树点击图片定位用） */
  const scrollSync = useRef(createScrollSyncChannel()).current;

  if (repoStatus !== 'ready') {
    return (
      <div className="welcome">
        <div className="welcome-card">
          <div className="welcome-brand">
            <span className="brand-mark" aria-hidden="true">稿</span>
            <span>稿域</span>
          </div>

          {repoStatus === 'unsupported' ? (
            <>
              <h1>当前浏览器暂不支持</h1>
              <p>
                稿域依赖浏览器的 File System Access 能力读写文件，你的浏览器缺少该能力。
                请换用 Chrome / Edge 后重新打开本页面。
              </p>
            </>
          ) : repoStatus === 'need-permission' ? (
            <>
              <h1>继续使用「{pendingName}」</h1>
              <p>浏览器要求在每次会话中重新确认对该目录的写入权限。</p>
              <div className="welcome-actions">
                <Button size="lg" onClick={() => void handleGrantPermission()}>授权并继续</Button>
                <button className="welcome-secondary" onClick={handleChangeRoot}>选择其它目录</button>
              </div>
            </>
          ) : repoStatus === 'need-pick' ? (
            <>
              {canPickDirectory() ? (
                <>
                  <h1>选择你的工作目录</h1>
                  <p>
                    草稿会以 .md 文件、图片会以真实图片文件保存在你指定的文件夹里，
                    与本地文件完全同构，可随时用其它工具打开。
                  </p>
                  <div className="welcome-actions">
                    <Button size="lg" onClick={() => void handlePickRoot()}>打开目录</Button>
                    <button className="welcome-secondary" onClick={() => void handleUseOpfs()}>
                      改用浏览器内置存储
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h1>使用浏览器内置存储</h1>
                  <p>
                    当前浏览器/环境禁用了「选择目录」能力（常见于企业策略或安全扩展）。
                    仍可改用浏览器内置存储继续写作：同样支持 .md 文档、文件夹与图片，
                    只是数据存放在浏览器内部，不会出现在你的电脑文件夹里。
                  </p>
                  <div className="welcome-actions">
                    <Button size="lg" onClick={() => void handleUseOpfs()}>使用内置存储</Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <h1>正在检查工作目录…</h1>
            </>
          )}

          <p className="welcome-foot">文件保存在你的本地，稿域不会上传任何内容。</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider className="app-shell">
      <Sidebar className="app-sidebar border-r-0!" collapsible="offcanvas">
        <SidebarHeader className="app-sidebar-head">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">稿</span>
            <span className="title">稿域</span>
          </div>
        </SidebarHeader>
        <SidebarContent className="app-sidebar-content">
          <FileTree
            rootName={rootName}
            tree={tree}
            activePath={activePath}
            markdownCount={mdNodes.length}
            unusedImageCount={unusedImageNodes.length}
            onSelect={setActiveFile}
            onCreateMarkdown={handleCreateMarkdown}
            onCreateDirectory={handleCreateDirectory}
            onRename={handleRenameNode}
            onDelete={handleDeleteNode}
            onRefresh={handleRefresh}
            onLocateImage={handleLocateImage}
            onCleanupImages={handleCleanupImages}
          />
        </SidebarContent>
        <SidebarRail />
      </Sidebar>

      <SidebarInset className="app">
        <div className={`workspace ${isPreviewOnly ? 'mode-preview' : ''}`}>
          <section className="workspace-panel">
            <div className="workspace-panel-head">
              <div className="workspace-panel-head-left">
                <TooltipHint content="切换侧栏">
                  <SidebarTrigger className="rounded-md" />
                </TooltipHint>
              </div>
              <ToggleGroup
                type="single"
                value={viewMode}
                variant="outline"
                size="sm"
                spacing={0}
                aria-label="工作区模式"
                className="workspace-mode-switch"
                onValueChange={(value) => value && setViewMode(value as 'split' | 'preview')}
              >
                <ToggleGroupItem value="split" aria-label="对照模式">对照</ToggleGroupItem>
                <ToggleGroupItem value="preview" aria-label="预览模式">预览</ToggleGroupItem>
              </ToggleGroup>
              <Toolbar
                onCopy={() => void handleCopy()}
                onImport={handleImport}
                onExportMarkdown={handleExportMarkdown}
                onExportBackup={() => void handleExportBackup()}
                onExportImage={() => void handleExportImage()}
                exporting={exporting}
              />
            </div>
            <ResizablePanelGroup
              key={isNarrow ? 'vertical' : 'horizontal'}
              className="split"
              orientation={isNarrow ? 'vertical' : 'horizontal'}
            >
              <ResizablePanel
                id="editor"
                className="editor-panel"
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
                  imageNames={Object.keys(imageUrls)}
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
                className="preview-panel"
                defaultSize={isNarrow ? '50%' : MIN_PREVIEW_PX}
                minSize={isNarrow ? MIN_PREVIEW_HEIGHT_PX : MIN_PREVIEW_PX}
                groupResizeBehavior={isNarrow ? 'preserve-relative-size' : 'preserve-pixel-size'}
              >
                <PreviewPane
                  body={result.body}
                  theme={theme}
                  resizeKey={`${viewMode}:${isNarrow ? 'vertical' : 'horizontal'}`}
                  sync={scrollSync}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
            <div className="workspace-statusbar">
              <div className="workspace-statusbar-left">
                <button
                  className={`outline-toggle ${outlineOpen ? 'active' : ''}`}
                  aria-label="目录"
                  aria-expanded={outlineOpen}
                  onClick={() => {
                    if (isPreviewOnly) setViewMode('split');
                    setOutlineOpen((value) => !value);
                  }}
                >
                  <ListTree size={14} />
                  <span>目录</span>
                </button>
                <TooltipHint
                  content={countLevel === 'over'
                    ? '已超过微信 2 万字上限'
                    : countLevel === 'warn'
                      ? '接近微信 2 万字上限'
                      : undefined}
                >
                  <span className={countClass}>{charCount} 字</span>
                </TooltipHint>
                <span className="pane-stat save-state">{saved ? '已保存' : '保存中'}</span>
              </div>
              <ThemeControls
                themeId={themeId}
                onThemeChange={setThemeId}
                densityId={densityId}
                onDensityChange={setDensityId}
              />
            </div>
          </section>
        </div>
      </SidebarInset>
      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => !open && setConfirmation(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmation?.description}</AlertDialogDescription>
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
  );
}
