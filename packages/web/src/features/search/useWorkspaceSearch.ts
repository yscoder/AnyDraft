import { useEffect, useRef, useState } from 'react'
import type { ContentRepository, RepoNode } from '@any-draft/shared'
import { findMatches, type SearchMatch, type SearchResult } from './search'

export function useWorkspaceSearch(
  repo: ContentRepository,
  nodes: RepoNode[],
  query: string,
  overlays: Record<string, string>,
) {
  const cache = useRef(new Map<string, { stamp: string; text: string }>())
  const [state, setState] = useState({
    results: [] as SearchResult[],
    scanned: 0,
    total: 0,
    busy: false,
    failed: 0,
    limited: false,
  })

  useEffect(() => {
    cache.current.clear()
  }, [repo])

  useEffect(() => {
    const files = nodes.filter((node) => node.kind === 'markdown')
    if (!query) {
      setState({
        results: [],
        scanned: 0,
        total: files.length,
        busy: false,
        failed: 0,
        limited: false,
      })
      return
    }
    let cancelled = false
    let worker: Worker | undefined
    let scanned = 0
    let failed = 0
    let count = 0
    let cursor = 0
    const results = new Map<string, SearchResult>()
    for (const file of files) {
      if (findMatches(file.name, query, 1).length) {
        results.set(file.path, {
          path: file.path,
          name: file.name,
          nameMatch: true,
          matches: [],
        })
        if (++count >= 1000) break
      }
    }
    const publish = (busy: boolean) => {
      if (cancelled) return
      setState({
        results: [...results.values()].sort(
          (a, b) =>
            Number(b.nameMatch) - Number(a.nameMatch) ||
            a.path.localeCompare(b.path),
        ),
        scanned,
        total: files.length,
        busy,
        failed,
        limited: count >= 1000,
      })
    }
    publish(true)
    const timer = window.setTimeout(() => {
      try {
        worker = new Worker(new URL('./search.worker.ts', import.meta.url), {
          type: 'module',
        })
      } catch {
        failed = files.length
        publish(false)
        return
      }
      const pending = new Map<string, (matches: SearchMatch[]) => void>()
      worker.onmessage = (
        event: MessageEvent<{ path: string; matches: SearchMatch[] }>,
      ) => {
        pending.get(event.data.path)?.(event.data.matches)
        pending.delete(event.data.path)
      }
      worker.onerror = () => {
        cancelled = true
        worker?.terminate()
        setState((previous) => ({
          ...previous,
          busy: false,
          failed: previous.failed + 1,
        }))
      }
      const run = async () => {
        while (!cancelled && cursor < files.length && count < 1000) {
          const file = files[cursor++]!
          try {
            const stamp = `${file.updatedAt}:${file.size}`
            const cached = cache.current.get(file.path)
            const text =
              overlays[file.path] ??
              (cached?.stamp === stamp
                ? cached.text
                : await repo.readTextFile(file.path))
            if (cancelled) return
            if (!(file.path in overlays)) {
              cache.current.delete(file.path)
              cache.current.set(file.path, { stamp, text })
              let size = [...cache.current.values()].reduce(
                (sum, item) => sum + item.text.length * 2,
                0,
              )
              while (size > 16 * 1024 * 1024 && cache.current.size) {
                const key = cache.current.keys().next().value!
                size -= cache.current.get(key)!.text.length * 2
                cache.current.delete(key)
              }
            }
            const matches = await new Promise<SearchMatch[]>((resolve) => {
              pending.set(file.path, resolve)
              worker!.postMessage({
                path: file.path,
                text,
                query,
                limit: 1000 - count,
              })
            })
            if (cancelled) return
            const kept = matches.slice(0, 1000 - count)
            count += kept.length
            if (kept.length)
              results.set(file.path, {
                path: file.path,
                name: file.name,
                nameMatch: results.get(file.path)?.nameMatch ?? false,
                matches: kept,
              })
          } catch {
            failed++
          }
          scanned++
          publish(true)
        }
      }
      void Promise.all(Array.from({ length: 4 }, run)).then(() => {
        publish(false)
        worker?.terminate()
      })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
      worker?.terminate()
    }
  }, [repo, nodes, query, overlays])

  return state
}
