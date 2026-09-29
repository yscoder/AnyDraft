import { useEffect, useRef, useState } from 'react'
import type { ContentRepository, RepoNode } from '@any-draft/shared'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog'
import { scanUnusedImages, type CleanupScan } from './scan'

interface Props {
  repo: ContentRepository
  overlays: Record<string, string>
  onClose: () => void
  onMoved: () => Promise<void>
}

type Phase = 'scanning' | 'ready' | 'error' | 'verifying' | 'deleting' | 'done'

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function sameCandidates(a: RepoNode[], b: RepoNode[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (item, index) =>
        item.path === b[index]?.path &&
        item.updatedAt === b[index]?.updatedAt &&
        item.size === b[index]?.size,
    )
  )
}

export default function ImageCleanupDialog({
  repo,
  overlays,
  onClose,
  onMoved,
}: Props) {
  const [phase, setPhase] = useState<Phase>('scanning')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [scan, setScan] = useState<CleanupScan | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState('')
  const [moved, setMoved] = useState(0)
  const [failed, setFailed] = useState<string[]>([])
  const runId = useRef(0)

  const startScan = async () => {
    const id = ++runId.current
    setPhase('scanning')
    setError('')
    setProgress({ done: 0, total: 0 })
    try {
      const next = await scanUnusedImages(
        repo,
        overlays,
        (done, total) => {
          if (id === runId.current) setProgress({ done, total })
        },
        () => id !== runId.current,
      )
      if (!next || id !== runId.current) return
      setScan(next)
      setSelected(new Set(next.unused.map((node) => node.path)))
      setPhase('ready')
    } catch (cause) {
      if (id !== runId.current) return
      setError(cause instanceof Error ? cause.message : '扫描失败，请重试')
      setPhase('error')
    }
  }

  useEffect(() => {
    void startScan()
    return () => {
      runId.current += 1
    }
    // 只在弹窗挂载或工作区切换时启动；正文变化由确认前的复核处理。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo])

  const moveSelected = async () => {
    if (!scan || !selected.size) return
    const id = ++runId.current
    setPhase('verifying')
    setError('')
    try {
      const latest = await scanUnusedImages(
        repo,
        overlays,
        (done, total) => {
          if (id === runId.current) setProgress({ done, total })
        },
        () => id !== runId.current,
      )
      if (!latest || id !== runId.current) return
      if (!sameCandidates(scan.unused, latest.unused)) {
        setError('工作区内容已变化，请重新扫描后查看候选图片')
        setPhase('error')
        return
      }
      setPhase('deleting')
      const failures: string[] = []
      let success = 0
      for (const path of selected) {
        try {
          await repo.trashNode(path)
          success += 1
        } catch {
          failures.push(path)
        }
      }
      setMoved(success)
      setFailed(failures)
      try {
        await onMoved()
      } catch {
        setError('目录刷新失败，请手动刷新文件树')
      }
      setPhase('done')
    } catch (cause) {
      if (id !== runId.current) return
      setError(cause instanceof Error ? cause.message : '复核失败，请重试')
      setPhase('error')
    }
  }

  const toggle = (path: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && phase !== 'deleting') onClose()
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[80dvh] flex-col gap-4 sm:max-w-xl"
      >
        <DialogTitle>清理未引用图片</DialogTitle>
        <DialogDescription>
          仅检查当前工作区 Markdown
          中的图片引用；其他应用使用的图片无法识别。选中的图片将移入回收站，可稍后恢复。
        </DialogDescription>

        {(phase === 'scanning' || phase === 'verifying') && (
          <p className="text-sm" role="status">
            {phase === 'verifying' ? '正在复核' : '正在扫描'} Markdown…{' '}
            {progress.done} / {progress.total} 篇
          </p>
        )}

        {phase === 'error' && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}

        {phase === 'ready' && scan && (
          <>
            <p className="text-sm" role="status">
              已扫描 {scan.markdownCount} 篇 Markdown，发现 {scan.unused.length}{' '}
              张候选图片。
            </p>
            {scan.unused.length > 0 && (
              <>
                <label className="flex items-center gap-2 border-b border-border pb-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={selected.size === scan.unused.length}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? new Set(scan.unused.map((node) => node.path))
                          : new Set(),
                      )
                    }
                  />
                  全选
                </label>
                <div
                  className="min-h-0 overflow-y-auto"
                  role="group"
                  aria-label="候选图片"
                >
                  {scan.unused.map((node) => (
                    <label
                      key={node.path}
                      className="flex items-center gap-2 rounded-md px-1 py-2 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        className="accent-primary"
                        checked={selected.has(node.path)}
                        onChange={() => toggle(node.path)}
                      />
                      <span className="min-w-0 flex-1 break-all">
                        {node.path}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {fileSize(node.size ?? 0)}
                      </span>
                    </label>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {phase === 'deleting' && (
          <p className="text-sm" role="status">
            正在移入回收站…
          </p>
        )}

        {phase === 'done' && (
          <div className="space-y-2 text-sm" role="status">
            <p>已移入回收站 {moved} 张图片，可在左侧回收站恢复。</p>
            {failed.length > 0 && (
              <p className="text-destructive">
                {failed.length} 张未能移动：{failed.join('、')}
              </p>
            )}
            {error && <p className="text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {phase === 'error' && (
            <Button variant="outline" onClick={() => void startScan()}>
              重新扫描
            </Button>
          )}
          <Button
            variant="outline"
            onClick={onClose}
            disabled={phase === 'deleting'}
          >
            {phase === 'done' || (phase === 'ready' && !scan?.unused.length)
              ? '关闭'
              : '取消'}
          </Button>
          {phase === 'ready' && selected.size > 0 && (
            <Button variant="destructive" onClick={() => void moveSelected()}>
              移入回收站（{selected.size}）
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
