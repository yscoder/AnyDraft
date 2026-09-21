import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import EditorPane from '@/components/EditorPane';
import FileTree from '@/components/FileTree';
import PreviewPane from '@/components/PreviewPane';
import Toolbar from '@/components/Toolbar';
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
import type { Draft } from '@/core/drafts/types';
import { readStored, writeStored } from '@/core/storage';
import './styles.css';

/** 编辑器侧最小宽度（拖拽时保留，预览因此可达 desktop 宽度） */
const MIN_EDITOR_PX = 180;
/** 预览最小宽度（容纳真实手机宽度） */
const MIN_PREVIEW_PX = 430;

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
  const [status, setStatus] = useState<string | null>(null);
  /** 导出进行中（长图 / 备份包都要跑一会儿） */
  const [exporting, setExporting] = useState(false);
  /** 对照 / 预览模式 */
  const [viewMode, setViewMode] = useState<'split' | 'preview'>('split');
  /** 编辑器侧宽度（百分比，默认预览最小宽度） */
  const [editorPct, setEditorPct] = useState<number>(() => {
    const w = window.innerWidth;
    return Math.round(((w - MIN_PREVIEW_PX) / w) * 1000) / 10;
  });
  /** 拖拽中禁用宽度过渡 */
  const draggingRef = useRef(false);
  const splitRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLElement>(null);

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

  const statusTimer = useRef<number | null>(null);
  const flash = (msg: string) => {
    setStatus(msg);
    if (statusTimer.current) window.clearTimeout(statusTimer.current);
    statusTimer.current = window.setTimeout(() => setStatus(null), 2200);
  };
  useEffect(
    () => () => {
      if (statusTimer.current) window.clearTimeout(statusTimer.current);
    },
    [],
  );

  // 挂载时：加载全部图片
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const all = await getAllImages();
        if (!cancelled) setImages(all);
      } catch {
        if (!cancelled) flash('图片库加载失败');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 防抖自动保存草稿（多草稿列表）
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!saveDrafts(drafts)) flash('草稿过大，本地保存失败');
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts]);

  // 记住主题与密度
  useEffect(() => {
    writeStored('theme', theme.id);
  }, [theme.id]);
  useEffect(() => {
    writeStored('density', densityId);
  }, [densityId]);

  /** 新建草稿 */
  const handleNewDraft = () => {
    const id = `draft-${Date.now()}`;
    const name = `草稿 ${drafts.length + 1}`;
    setDrafts((prev) => [...prev, { id, name, content: '', updatedAt: Date.now() }]);
    setActiveDraft(id); // 内部已写入 STORAGE_ACTIVE_DRAFT
    flash(`已新建「${name}」`);
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
    if (!window.confirm(`删除草稿「${target.name}」？此操作不可恢复。`)) return;
    const remaining = drafts.filter((d) => d.id !== id);
    // 删光了就补一篇空草稿；选中项必须落在新列表里，否则后续编辑会写不进任何草稿
    const next = remaining.length
      ? remaining
      : [{ id: `draft-${Date.now()}`, name: '未命名草稿', content: '', updatedAt: Date.now() }];
    setDrafts(next);
    if (id === activeId) setActiveDraft(next[0].id);
    flash(`已删除「${target.name}」`);
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
      flash(`「${name}」还没有被任何草稿引用`);
      return;
    }
    if (hit.draft.id !== activeId) {
      setActiveDraft(hit.draft.id);
      flash(`已跳到「${hit.draft.name}」`);
    }
    jumpNonce.current += 1;
    setJumpRequest({ line: hit.line, nonce: jumpNonce.current });
  };

  /** 删除单张图片；仍被引用时先确认（删掉后正文会退回占位提示） */
  const handleDeleteImage = (name: string) => {
    if (usedImageNames.has(name) && !window.confirm(`「${name}」还被正文引用，删除后那里会变成占位提示。仍要删除？`)) {
      return;
    }
    setImages((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
    deleteImage(name).catch(() => flash('图片删除失败'));
    flash(`已删除「${name}」`);
  };

  /** 一键清理所有草稿都没引用的图片（长期使用后这些是占用大头） */
  const handleCleanupImages = () => {
    const unused = Object.keys(images).filter((n) => !usedImageNames.has(n));
    if (!unused.length) {
      flash('没有未引用的图片');
      return;
    }
    if (!window.confirm(`删除 ${unused.length} 张未被任何草稿引用的图片？`)) return;
    setImages((prev) => {
      const next = { ...prev };
      for (const n of unused) delete next[n];
      return next;
    });
    void Promise.all(unused.map((n) => deleteImage(n))).catch(() => flash('部分图片删除失败'));
    flash(`已清理 ${unused.length} 张未引用图片`);
  };

  /** 编辑器拖入/粘贴图片后注册到注册表（写 IndexedDB） */
  const handleAddImage = (name: string, dataUrl: string) => {
    setImages((prev) => (prev[name] === dataUrl ? prev : { ...prev, [name]: dataUrl }));
    putImage(name, dataUrl).catch(() => flash('图片保存失败，存储空间可能已满'));
  };

  const handleCopy = async () => {
    // 预览走的是延迟值、且高亮可能还没加载完，导出必须按当前正文重新渲染一次
    await ensureHighlighter();
    const { html } = renderArticle(markdown, theme, images, density);
    const ok = await copyRichText(html);
    flash(ok ? '已复制，去公众号 ⌘V 粘贴' : '复制失败，请用浏览器 Chrome/Edge');
  };

  /* ---------------- 导入 / 导出 ---------------- */

  /** 导入 .md / .zip：草稿追加到列表末尾并跳过去，图片并入图片库 */
  const handleImport = async (files: File[]) => {
    try {
      const { drafts: incoming, images: incomingImages, skipped } = await importFiles(files);
      const imageCount = Object.keys(incomingImages).length;
      if (!incoming.length && !imageCount) {
        flash(skipped.length ? '没有可导入的 Markdown 或备份文件' : '文件是空的');
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
          flash('部分图片写入本地库失败'),
        );
      }
      const parts = [incoming.length ? `${incoming.length} 篇草稿` : '', imageCount ? `${imageCount} 张图片` : ''];
      flash(`已导入 ${parts.filter(Boolean).join(' · ')}${skipped.length ? `（跳过 ${skipped.length} 个文件）` : ''}`);
    } catch (err) {
      console.warn('导入失败', err);
      flash('导入失败，文件可能已损坏');
    }
  };

  /** 导出当前草稿为 .md */
  const handleExportMarkdown = () => {
    if (!activeDraft) return;
    exportDraftMarkdown(activeDraft);
    flash(`已导出「${activeDraft.name}.md」`);
  };

  /** 导出全部草稿 + 图片为 zip 备份 */
  const handleExportBackup = async () => {
    setExporting(true);
    try {
      await exportBackupZip(drafts, images);
      flash(`已导出备份（${drafts.length} 篇草稿 · ${Object.keys(images).length} 张图片）`);
    } catch (err) {
      console.warn('备份失败', err);
      flash('备份导出失败');
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
      flash('长图已导出');
    } catch (err) {
      console.warn('长图导出失败', err);
      flash(err instanceof Error ? err.message : '长图导出失败');
    } finally {
      setExporting(false);
    }
  };

  /** 拖拽分割条：同步更新编辑器 DOM 宽度（跟手），mouseup 时落回 state */
  const handleDrag = (clientX: number) => {
    const split = splitRef.current;
    const editor = editorRef.current;
    if (!split || !editor) return;
    const rect = split.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    // 编辑器宽度范围：[MIN_EDITOR_PX, W - MIN_PREVIEW_PX]（预览最小保留真实手机宽度）
    const minPct = (MIN_EDITOR_PX / rect.width) * 100;
    const maxPct = ((rect.width - MIN_PREVIEW_PX) / rect.width) * 100;
    const clamped = Math.max(minPct, Math.min(maxPct, pct));
    editor.style.width = `${clamped}%`; // 直接改 DOM，跳过 React 渲染延迟
    void editor.offsetHeight; // 强制 reflow，跳过宽度过渡
  };

  /** 拖拽开始/结束：直接控制 DOM 类（ref 不触发渲染，类必须手动切换） */
  const setDraggingUi = (on: boolean) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.classList.toggle('no-transition', on);
  };

  const endDrag = () => {
    draggingRef.current = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.documentElement.classList.remove('split-dragging');
    setDraggingUi(false);
    const editor = editorRef.current;
    const split = splitRef.current;
    if (editor && split) {
      const rect = split.getBoundingClientRect();
      // 把最终宽度写回 state（供预览模式切换 / 复位引用）
      setEditorPct(Math.max(0, Math.min(100, (editor.getBoundingClientRect().width / rect.width) * 100)));
    }
  };

  // 全局拖拽监听（常驻挂载，回调内检查拖拽标志）
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingRef.current) handleDrag(e.clientX);
    };
    const onUp = () => {
      if (draggingRef.current) endDrag();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  /** 双击分割条复位（预览最小宽度） */
  const resetSplit = () => {
    const editor = editorRef.current;
    const split = splitRef.current;
    if (!editor || !split) return;
    setDraggingUi(true);
    const rect = split.getBoundingClientRect();
    const pct = Math.round(((rect.width - MIN_PREVIEW_PX) / rect.width) * 1000) / 10;
    editor.style.width = `${pct}%`;
    void editor.offsetHeight;
    setDraggingUi(false);
    setEditorPct(pct);
  };

  /**
   * 滚动同步通道：编辑器发布位置、预览订阅。
   * 走可变对象而非 state —— 滚动不该让整棵树重渲染一次。
   */
  const scrollSync = useRef(createScrollSyncChannel()).current;

  const isPreviewOnly = viewMode === 'preview';

  return (
    <div className="app">
      <Toolbar
        viewMode={viewMode}
        onViewMode={setViewMode}
        status={status}
        onCopy={handleCopy}
        onImport={(files) => void handleImport(files)}
        onExportMarkdown={handleExportMarkdown}
        onExportBackup={() => void handleExportBackup()}
        onExportImage={() => void handleExportImage()}
        exporting={exporting}
        themeId={themeId}
        onThemeChange={setThemeId}
        densityId={densityId}
        onDensityChange={setDensityId}
      />
      <main className={`workspace ${isPreviewOnly ? 'mode-preview' : ''}`}>
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
        <div className="split" ref={splitRef}>
          <EditorPane
            ref={editorRef}
            value={markdown}
            onChange={setMarkdown}
            onAddImage={handleAddImage}
            imageNames={Object.keys(images)}
            draftId={activeId}
            sync={scrollSync}
            jumpRequest={jumpRequest}
            collapsed={isPreviewOnly}
            widthPct={editorPct}
          />
          <div
            className="split-bar"
            title="拖动调整 · 双击复位"
            onMouseDown={(e) => {
              draggingRef.current = true;
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
              document.documentElement.classList.add('split-dragging');
              setDraggingUi(true);
              handleDrag(e.clientX);
            }}
            onDoubleClick={resetSplit}
          />
          <PreviewPane
            body={result.body}
            theme={theme}
            hasImage={result.hasImage}
            resizeKey={`${viewMode}:${editorPct}`}
            sync={scrollSync}
          />
        </div>
      </main>
    </div>
  );
}
