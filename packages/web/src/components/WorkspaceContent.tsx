import type { ComponentProps } from 'react'
import EditorPane from '@/components/EditorPane'
import ArticleHeader from '@/components/ArticleHeader'
import PreviewPane from '@/components/PreviewPane'
import ThemeControls from '@/components/ThemeControls'
import Toolbar from '@/components/Toolbar'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
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
import { shortcutLabel } from '@/features/shortcuts/shortcuts'
import type { Theme } from '@/core/theme/theme'
import {
  parseArticle,
  updateArticleBody,
  updateArticleField,
} from '@/core/markdown/frontmatter'

/** 编辑器侧最小宽度（拖拽时保留，预览因此可达 desktop 宽度） */
const MIN_EDITOR_PX = 180
/** 预览最小宽度（容纳真实手机宽度） */
const MIN_PREVIEW_PX = 430
const MIN_EDITOR_HEIGHT_PX = 160
const MIN_PREVIEW_HEIGHT_PX = 220

interface Props {
  isPreviewOnly: boolean
  viewMode: 'split' | 'preview'
  setViewMode: (mode: 'split' | 'preview') => void
  isNarrow: boolean
  activeDraft: boolean
  markdown: string
  setMarkdown: (value: string) => void
  trashDocument: { id: string; relativePath: string } | null
  activePath: string
  editorPanelRef: ComponentProps<typeof ResizablePanel>['panelRef']
  handleAddImage: ComponentProps<typeof EditorPane>['onAddImage']
  onHelp: () => void
  onViewMode: () => void
  availableImageNames: string[]
  scrollSync: ComponentProps<typeof EditorPane>['sync']
  jumpRequest: ComponentProps<typeof EditorPane>['jumpRequest']
  outlineOpen: boolean
  setOutlineOpen: (update: (value: boolean) => boolean) => void
  body: string
  articleTitle: string
  articleAuthor: string
  legacyTitle: boolean
  theme: Theme
  darkPreview: boolean
  charCount: number
  countLevel: 'normal' | 'warn' | 'over'
  countClass: string
  saveFailed: boolean
  saved: boolean
  themeId: string
  setThemeId: (id: string) => void
  densityId: string
  setDensityId: (id: string) => void
  setDarkPreview: (value: boolean) => void
  exporting: boolean
  copying: boolean
  handleCopy: ComponentProps<typeof Toolbar>['onCopy']
  handleImport: ComponentProps<typeof Toolbar>['onImport']
  handleExportMarkdown: ComponentProps<typeof Toolbar>['onExportMarkdown']
  handleExportBackup: ComponentProps<typeof Toolbar>['onExportBackup']
  handleExportImage: ComponentProps<typeof Toolbar>['onExportImage']
}

export default function WorkspaceContent({
  isPreviewOnly,
  viewMode,
  setViewMode,
  isNarrow,
  activeDraft,
  markdown,
  setMarkdown,
  trashDocument,
  activePath,
  editorPanelRef,
  handleAddImage,
  onHelp,
  onViewMode,
  availableImageNames,
  scrollSync,
  jumpRequest,
  outlineOpen,
  setOutlineOpen,
  body,
  articleTitle,
  articleAuthor,
  legacyTitle,
  theme,
  darkPreview,
  charCount,
  countLevel,
  countClass,
  saveFailed,
  saved,
  themeId,
  setThemeId,
  densityId,
  setDensityId,
  setDarkPreview,
  exporting,
  copying,
  handleCopy,
  handleImport,
  handleExportMarkdown,
  handleExportBackup,
  handleExportImage,
}: Props) {
  const article = parseArticle(markdown)
  const headerJump =
    jumpRequest &&
    (jumpRequest.from !== undefined
      ? jumpRequest.from < article.bodyStart
      : jumpRequest.line < article.lineOffset)
  const bodyJump =
    jumpRequest && !headerJump
      ? {
          ...jumpRequest,
          line: Math.max(0, jumpRequest.line - article.lineOffset),
          from:
            jumpRequest.from === undefined
              ? undefined
              : Math.max(0, jumpRequest.from - article.bodyStart),
          to:
            jumpRequest.to === undefined
              ? undefined
              : Math.max(0, jumpRequest.to - article.bodyStart),
        }
      : null
  return (
    <SidebarInset className="h-full min-w-0 p-2 overflow-hidden">
      <section
        className={`workspace-panel ${isPreviewOnly ? 'mode-preview' : ''}`}
      >
        <div className="workspace-panel-head">
          <div className="workspace-panel-head-left">
            <TooltipHint content={`切换侧栏 ${shortcutLabel('sidebar')}`}>
              <SidebarTrigger className="rounded-md" />
            </TooltipHint>
          </div>
          <TooltipHint content={`对照 / 预览 ${shortcutLabel('viewMode')}`}>
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
          </TooltipHint>
          <Toolbar
            onCopy={() => void handleCopy()}
            onImport={handleImport}
            onExportMarkdown={() => void handleExportMarkdown()}
            onExportBackup={() => void handleExportBackup()}
            onExportImage={() => void handleExportImage()}
            exporting={exporting}
            copying={copying}
            hasActiveDraft={Boolean(activeDraft && !trashDocument)}
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
              className="flex min-w-0 min-h-0 flex-col overflow-hidden"
              panelRef={editorPanelRef}
              collapsible
              collapsedSize={0}
              defaultSize={isNarrow ? '50%' : undefined}
              minSize={isNarrow ? MIN_EDITOR_HEIGHT_PX : MIN_EDITOR_PX}
            >
              <EditorPane
                key={trashDocument ? 'trash' : 'workspace'}
                articleHeader={
                  <ArticleHeader
                    article={article}
                    readOnly={Boolean(trashDocument) || Boolean(article.error)}
                    focusTitleNonce={
                      headerJump ? jumpRequest?.nonce : undefined
                    }
                    onChange={(field, value) =>
                      setMarkdown(updateArticleField(markdown, field, value))
                    }
                  />
                }
                value={article.body}
                onChange={(value) =>
                  setMarkdown(updateArticleBody(markdown, value))
                }
                readOnly={Boolean(trashDocument)}
                onHelp={onHelp}
                onViewMode={onViewMode}
                onAddImage={handleAddImage}
                imageNames={availableImageNames}
                fileKey={
                  trashDocument
                    ? `trash:${trashDocument.id}:${trashDocument.relativePath}`
                    : activePath
                }
                lineOffset={article.lineOffset}
                sync={scrollSync}
                jumpRequest={bodyJump}
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
                body={body}
                articleTitle={articleTitle}
                articleAuthor={articleAuthor}
                legacyTitle={legacyTitle}
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
                {trashDocument
                  ? '回收站 · 只读'
                  : saveFailed
                    ? '保存失败'
                    : saved
                      ? '已保存'
                      : '保存中'}
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
  )
}
