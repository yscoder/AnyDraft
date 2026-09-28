import { useEffect, useRef, useState } from 'react'
import { Dialog } from 'radix-ui'
import { FileText, Search } from 'lucide-react'
import type { ContentRepository, RepoNode } from '@any-draft/shared'
import { Input } from '@/components/ui/input'
import { recentMarkdown, type SearchMatch } from './search'
import { useWorkspaceSearch } from './useWorkspaceSearch'

interface Props {
  repo: ContentRepository
  nodes: RepoNode[]
  onNodes: (nodes: RepoNode[]) => void
  overlays: Record<string, string>
  onClose: () => void
  onSelect: (
    path: string,
    query: string,
    match?: SearchMatch,
  ) => Promise<boolean>
}

export default function SearchDialog({
  repo,
  nodes,
  overlays,
  onNodes,
  onClose,
  onSelect,
}: Props) {
  const [value, setValue] = useState('')
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState(nodes)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState(false)
  const [loading, setLoading] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)
  const selected = useRef(false)
  const state = useWorkspaceSearch(repo, files, query, overlays)
  useEffect(() => {
    let cancelled = false
    void repo
      .list()
      .then((next) => {
        if (!cancelled) {
          setFiles(next)
          onNodes(next)
        }
      })
      .catch(() => {
        if (!cancelled) setError('目录刷新失败，正在使用已有文件列表')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repo, onNodes])
  const choose = async (path: string, match?: SearchMatch) => {
    if (opening) return
    setOpening(true)
    try {
      if (await onSelect(path, query, match)) {
        selected.current = true
        onClose()
      } else setError('文件已变化或无法打开，请重新搜索')
    } catch {
      setError('文件打开失败，请重试')
    } finally {
      setOpening(false)
    }
  }
  const rowClass =
    'w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none disabled:opacity-50'
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-xs" />
        <Dialog.Content
          className="fixed left-1/2 top-[12vh] z-50 flex max-h-[76dvh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 flex-col rounded-xl border border-border bg-card text-card-foreground shadow-xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault()
            if (selected.current)
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>('.cm-content')?.focus(),
              )
            if (!selected.current)
              document
                .querySelector<HTMLButtonElement>(
                  'button[aria-label="搜索工作区"]',
                )
                ?.focus()
          }}
          onKeyDown={(event) => {
            if (
              !['ArrowDown', 'ArrowUp'].includes(event.key) ||
              event.nativeEvent.isComposing
            )
              return
            const buttons = Array.from(
              listRef.current?.querySelectorAll<HTMLButtonElement>(
                'button:not(:disabled)',
              ) ?? [],
            )
            if (!buttons.length) return
            event.preventDefault()
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            )
            const next =
              index < 0
                ? event.key === 'ArrowDown'
                  ? 0
                  : buttons.length - 1
                : (index +
                    (event.key === 'ArrowDown' ? 1 : -1) +
                    buttons.length) %
                  buttons.length
            buttons[next]?.focus()
          }}
        >
          <Dialog.Description className="sr-only">
            搜索 Markdown 文件名和源码，选择结果打开文档。
          </Dialog.Description>
          <div className="border-b border-border p-4">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                className="pl-9"
                ref={inputRef}
                aria-label="搜索文件名、标题或正文"
                placeholder="搜索文件名、标题或正文…"
                value={value}
                onCompositionStart={() => {
                  composing.current = true
                }}
                onCompositionEnd={(event) => {
                  composing.current = false
                  setQuery(event.currentTarget.value)
                }}
                onChange={(event) => {
                  setValue(event.target.value)
                  if (!composing.current) setQuery(event.target.value)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.nativeEvent.isComposing)
                    listRef.current
                      ?.querySelector<HTMLButtonElement>('button')
                      ?.click()
                }}
              />
            </div>
          </div>
          <div
            className="min-h-0 overflow-y-auto p-2"
            ref={listRef}
            aria-busy={state.busy || loading || opening}
          >
            {!query ? (
              <>
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  最近修改的 Markdown 文件
                </p>
                {recentMarkdown(files).map((file) => (
                  <button
                    key={file.path}
                    className={rowClass}
                    disabled={opening}
                    onClick={() => void choose(file.path)}
                  >
                    <span className="flex items-center gap-2">
                      <FileText className="size-4 text-muted-foreground" />
                      {file.name}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground">
                      {file.path}
                    </span>
                  </button>
                ))}
                {!loading && !recentMarkdown(files).length && (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    暂无 Markdown 文件
                  </p>
                )}
              </>
            ) : (
              <>
                {state.results.map((result) => (
                  <div key={result.path} className="mb-2">
                    <button
                      className={rowClass}
                      disabled={opening}
                      onClick={() => void choose(result.path)}
                    >
                      <span className="font-medium">{result.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {result.matches.length
                          ? `${result.matches.length} 处`
                          : '文件名匹配'}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {result.path}
                      </span>
                    </button>
                    {result.matches.map((match) => (
                      <button
                        key={match.from}
                        className={`${rowClass} flex gap-3`}
                        disabled={opening}
                        onClick={() => void choose(result.path, match)}
                      >
                        <span className="w-8 shrink-0 text-right text-xs text-muted-foreground">
                          {match.line}
                        </span>
                        <span className="min-w-0 truncate">
                          {match.before}
                          <mark className="rounded-sm bg-primary/15 text-primary">
                            {match.text}
                          </mark>
                          {match.after}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
                {!state.busy && !state.results.length && (
                  <p className="p-6 text-center text-sm text-muted-foreground">
                    没有匹配结果
                  </p>
                )}
              </>
            )}
          </div>
          <div
            className="border-t border-border px-5 py-3 text-xs text-muted-foreground"
            role="status"
          >
            {error ||
              (loading
                ? '正在刷新目录…'
                : query
                  ? `${state.busy ? '正在搜索 · ' : ''}已扫描 ${state.scanned} / ${state.total} 个文件${state.limited ? ' · 结果已截断（上限 1,000 条）' : ''}${state.failed ? ` · ${state.failed} 个文件搜索失败` : ''}`
                  : '按修改时间排序 · ↑ ↓ 选择 · Enter 打开')}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
