import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import EditorPane from '@/components/EditorPane';
import FileTree from '@/components/FileTree';
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
import { deleteImage, getAllImages, putImage } from '@/core/image/imagedb';
import { createScrollSyncChannel } from '@/core/editor/scrollSync';
import { locateImage } from '@/core/drafts/locate';
import { initDraftState, rememberActiveDraft, saveDrafts } from '@/core/drafts/storage';
import type { Draft } from '@any-draft/shared';
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
  onConfirm: () => void;
}

export default function App() {
  const [initial] = useState(initDraftState);
  const [drafts, setDrafts] = useState<Draft[]>(initial.drafts);
  const [activeDraftId, setActiveDraftId] = useState<string>(initial.activeId);
  // 选中项兜底：id 万一失效就回落到第一篇，且后续写入都用这个真实存在的 id
  const activeDraft = drafts.find((d) => d.id === activeDraftId) ?? drafts[0];
  const activeId = activeDraft?.id ?? '';
  const markdown = activeDraft?.content ?? '';
  const setMarkdown = (v: string) => {
    setDrafts((prev) => {
      const now = Date.now();
      return prev.map((d) => (d.id === activeId ? { ...d, content: v, updatedAt: now } : d));
    });
  };
  const setActiveDraft = (id: string) => {
    setActiveDraftId(id);
    rememberActiveDraft(id);
  };
  // 图片注册表存 IndexedDB（容量大），挂载后异步加载到内存供同步渲染
  const [images, setImages] = useState<Record<string, string>>({});
  const [themeId, setThemeId] = useState<string>(() => readStored('theme') ?? 'classic');
  const [densityId, setDensityId] = useState<string>(() => readStored('density') ?? 'standard');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  /** 导出进行中（长图 / 备份包都要跑一会儿） */
  const [exporting, setExporting] = useState(false);
  /** 对照 / 预览模式 */
  const [viewMode, setViewMode] = useState<'split' | 'preview'>('split');
  const isPreviewOnly = viewMode === 'preview';
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [saved, setSaved] = useState(true);
  const [isNarrow, setIsNarrow] = useState(() => window.matchMedia('(max-width: 900px)').matches);
  const editorPanelRef = useRef<PanelImperativeHandle>(null);

  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const density = useMemo(() => getDensity(densityId), [densityId]);
  /** 高亮器就绪后翻转一次，触发补高亮的重渲染 */
  const [hlReady, setHlReady] = useState(isHighlighterReady);
  // 整篇重渲染让给输入：打字时先用上一版预览，空闲时再补算新版
  const deferredMarkdown = useDeferredValue(markdown);
  const result = useMemo(
    () => renderArticle(deferredMarkdown, theme, images, density),
    // hlReady 只作为「重算一次」的信号，不参与渲染入参
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deferredMarkdown, theme, images, density, hlReady],
  );
  const charCount = useMemo(() => markdown.replace(/\s/g, '').length, [markdown]);
  /** 微信正文上限 2 万字：18000 预警、20000 红线 */
  const countLevel = charCount >= 20000 ? 'over' : charCount >= 18000 ? 'warn' : 'normal';
  const countClass = `pane-stat count ${countLevel === 'warn' ? 'count-warn' : countLevel === 'over' ? 'count-over' : ''}`;

  // highlight.js 懒加载（不阻塞首屏），就绪后补上代码高亮
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

  const flash = (msg: string, kind: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    toast[kind](msg);
  };

  // 挂载时：加载全部图片
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const all = await getAllImages();
        if (!cancelled) setImages(all);
      } catch {
        if (!cancelled) flash('图片库加载失败', 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 防抖自动保存草稿（多草稿列表）
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!saveDrafts(drafts)) flash('草稿过大，本地保存失败', 'error');
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  // 状态栏中的保存反馈与草稿自动保存节奏保持一致
  useEffect(() => {
    setSaved(false);
    const timer = window.setTimeout(() => setSaved(true), 700);
    return () => window.clearTimeout(timer);
  }, [markdown]);

  // 记住主题与密度
  useEffect(() => {
    writeStored('theme', theme.id);
  }, [theme.id]);
  useEffect(() => {
    writeStored('density', densityId);
  }, [densityId]);

  // 与 CSS 断点保持一致：桌面左右分栏，窄屏上下分栏
  useEffect(() => {
    const media = window.matchMedia('(max-width: 900px)');
    const update = () => setIsNarrow(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  // “预览”模式通过 ResizablePanel 的折叠 API 收起编辑器，返回时恢复原尺寸
  useEffect(() => {
    const panel = editorPanelRef.current;
    if (!panel) return;
    if (isPreviewOnly) panel.collapse();
    else panel.expand();
  }, [isPreviewOnly, isNarrow]);

  /** 新建草稿 */
  const handleNewDraft = () => {
    const id = `draft-${Date.now()}`;
    const name = `草稿 ${drafts.length + 1}`;
    setDrafts((prev) => [...prev, { id, name, content: '', updatedAt: Date.now() }]);
    setActiveDraft(id); // 内部已写入 STORAGE_ACTIVE_DRAFT
    flash(`已新建「${name}」`, 'success');
  };

  /** 重命名草稿 */
  const handleRenameDraft = (id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, name: trimmed } : d)));
  };

  /** 删除草稿 */
  const handleDeleteDraft = (id: string) => {
    const target = drafts.find((d) => d.id === id);
    if (!target) return;
    setConfirmation({
      title: '删除草稿？',
      description: `「${target.name}」将被永久删除，此操作无法撤销。`,
      actionLabel: '删除草稿',
      onConfirm: () => {
        const remaining = drafts.filter((d) => d.id !== id);
        // 删光了就补一篇空草稿；选中项必须落在新列表里，否则后续编辑会写不进任何草稿
        const next = remaining.length
          ? remaining
          : [{ id: `draft-${Date.now()}`, name: '未命名草稿', content: '', updatedAt: Date.now() }];
        setDrafts(next);
        if (id === activeId) setActiveDraft(next[0].id);
        flash(`已删除「${target.name}」`, 'success');
      },
    });
  };

  /** 正文里被引用到的图片名（两种语法都算，跨全部草稿） */
  const usedImageNames = useMemo(() => {
    const used = new Set<string>();
    for (const d of drafts) {
      for (const name of collectImageRefs(d.content)) used.add(name);
    }
    return used;
  }, [drafts]);

  /** 编辑器跳转请求（文件树点击图片定位用） */
  const [jumpRequest, setJumpRequest] = useState<{ line: number; nonce: number } | null>(null);
  const jumpNonce = useRef(0);

  /** 点击图片：定位到引用它的那一行（必要时先切到对应草稿） */
  const handleLocateImage = (name: string) => {
    const hit = locateImage(drafts, activeId, name);
    if (!hit) {
      flash(`「${name}」还没有被任何草稿引用`, 'warning');
      return;
    }
    if (hit.draft.id !== activeId) {
      setActiveDraft(hit.draft.id);
      flash(`已跳到「${hit.draft.name}」`, 'info');
    }
    jumpNonce.current += 1;
    setJumpRequest({ line: hit.line, nonce: jumpNonce.current });
  };

  /** 删除单张图片；仍被引用时先确认（删掉后正文会退回占位提示） */
  const handleDeleteImage = (name: string) => {
    const removeImage = () => {
      setImages((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      deleteImage(name).catch(() => flash('图片删除失败', 'error'));
      flash(`已删除「${name}」`, 'success');
    };

    if (usedImageNames.has(name)) {
      setConfirmation({
        title: '删除仍被引用的图片？',
        description: `「${name}」仍在正文中使用，删除后对应位置将显示为占位提示。`,
        actionLabel: '仍要删除',
        onConfirm: removeImage,
      });
      return;
    }

    removeImage();
  };

  /** 一键清理所有草稿都没引用的图片（长期使用后这些是占用大头） */
  const handleCleanupImages = () => {
    const unused = Object.keys(images).filter((n) => !usedImageNames.has(n));
    if (!unused.length) {
      flash('没有未引用的图片', 'info');
      return;
    }
    setConfirmation({
      title: '清理未引用图片？',
      description: `将永久删除 ${unused.length} 张未被任何草稿引用的图片，此操作无法撤销。`,
      actionLabel: `删除 ${unused.length} 张图片`,
      onConfirm: () => {
        setImages((prev) => {
          const next = { ...prev };
          for (const n of unused) delete next[n];
          return next;
        });
        void Promise.all(unused.map((n) => deleteImage(n))).catch(() => flash('部分图片删除失败', 'warning'));
        flash(`已清理 ${unused.length} 张未引用图片`, 'success');
      },
    });
  };

  /** 编辑器拖入/粘贴图片后注册到注册表（写 IndexedDB） */
  const handleAddImage = (name: string, dataUrl: string) => {
    setImages((prev) => (prev[name] === dataUrl ? prev : { ...prev, [name]: dataUrl }));
    putImage(name, dataUrl).catch(() => flash('图片保存失败，存储空间可能已满', 'error'));
  };

  const handleCopy = async () => {
    // 预览走的是延迟值、且高亮可能还没加载完，导出必须按当前正文重新渲染一次
    await ensureHighlighter();
    const { html } = renderArticle(markdown, theme, images, density);
    const ok = await copyRichText(html);
    flash(
      ok ? '已复制，去公众号 ⌘V 粘贴' : '复制失败，请用浏览器 Chrome/Edge',
      ok ? 'success' : 'error',
    );
  };

  /* ---------------- 导入 / 导出 ---------------- */

  /** 导入 .md / .zip：草稿追加到列表末尾并跳过去，图片并入图片库 */
  const handleImport = async (files: File[]) => {
    try {
      const { drafts: incoming, images: incomingImages, skipped } = await importFiles(files);
      const imageCount = Object.keys(incomingImages).length;
      if (!incoming.length && !imageCount) {
        flash(skipped.length ? '没有可导入的 Markdown 或备份文件' : '文件是空的', 'warning');
        return;
      }
      if (incoming.length) {
        setDrafts((prev) => [...prev, ...incoming]);
        setActiveDraft(incoming[0].id);
      }
      if (imageCount) {
        setImages((prev) => ({ ...prev, ...incomingImages }));
        // 写盘失败不该拦住已经进内存的内容，只提示
        await Promise.all(Object.entries(incomingImages).map(([n, url]) => putImage(n, url))).catch(() =>
          flash('部分图片写入本地库失败', 'warning'),
        );
      }
      const parts = [incoming.length ? `${incoming.length} 篇草稿` : '', imageCount ? `${imageCount} 张图片` : ''];
      flash(
        `已导入 ${parts.filter(Boolean).join(' · ')}${skipped.length ? `（跳过 ${skipped.length} 个文件）` : ''}`,
        'success',
      );
    } catch (err) {
      console.warn('导入失败', err);
      flash('导入失败，文件可能已损坏', 'error');
    }
  };

  /** 导出当前草稿为 .md */
  const handleExportMarkdown = () => {
    if (!activeDraft) return;
    exportDraftMarkdown(activeDraft);
    flash(`已导出「${activeDraft.name}.md」`, 'success');
  };

  /** 导出全部草稿 + 图片为 zip 备份 */
  const handleExportBackup = async () => {
    setExporting(true);
    try {
      await exportBackupZip(drafts, images);
      flash(`已导出备份（${drafts.length} 篇草稿 · ${Object.keys(images).length} 张图片）`, 'success');
    } catch (err) {
      console.warn('备份失败', err);
      flash('备份导出失败', 'error');
    } finally {
      setExporting(false);
    }
  };

  /** 导出正文长图 PNG（按当前正文重新渲染，不用延迟预览值） */
  const handleExportImage = async () => {
    setExporting(true);
    try {
      await ensureHighlighter();
      const { body } = renderArticle(markdown, theme, images, density);
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

  /**
   * 滚动同步通道：编辑器发布位置、预览订阅。
   * 走可变对象而非 state —— 滚动不该让整棵树重渲染一次。
   */
  const scrollSync = useRef(createScrollSyncChannel()).current;

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
            drafts={drafts}
            activeId={activeId}
            onSelect={setActiveDraft}
            onNew={handleNewDraft}
            onRename={handleRenameDraft}
            onDelete={handleDeleteDraft}
            images={images}
            usedImageNames={usedImageNames}
            onDeleteImage={handleDeleteImage}
            onCleanupImages={handleCleanupImages}
            onLocateImage={handleLocateImage}
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
                onCopy={handleCopy}
                onImport={(files) => void handleImport(files)}
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
                  imageNames={Object.keys(images)}
                  draftId={activeId}
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
            <AlertDialogAction variant="destructive" onClick={() => confirmation?.onConfirm()}>
              {confirmation?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
