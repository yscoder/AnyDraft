import type { RepoNode } from '@any-draft/shared'

export interface SearchMatch {
  from: number
  to: number
  line: number
  before: string
  text: string
  after: string
}

export interface SearchResult {
  path: string
  name: string
  nameMatch: boolean
  matches: SearchMatch[]
}

export function recentMarkdown(nodes: RepoNode[]): RepoNode[] {
  return nodes
    .filter((node) => node.kind === 'markdown')
    .sort(
      (a, b) =>
        (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || a.path.localeCompare(b.path),
    )
    .slice(0, 10)
}

/** RegExp preserves source offsets even when Unicode case folding changes length. */
export function findMatches(
  source: string,
  query: string,
  limit = 1000,
): SearchMatch[] {
  if (!query || limit <= 0) return []
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(escaped, 'giu')
  const matches: SearchMatch[] = []
  let line = 1
  let previous = 0
  for (const match of source.matchAll(pattern)) {
    const from = match.index
    const to = from + match[0].length
    for (let i = previous; i < from; i++) if (source[i] === '\n') line++
    previous = from
    const start = Math.max(source.lastIndexOf('\n', from - 1) + 1, from - 60)
    const newline = source.indexOf('\n', to)
    const end = Math.min(newline < 0 ? source.length : newline, to + 100)
    matches.push({
      from,
      to,
      line,
      before: source.slice(start, from),
      text: match[0],
      after: source.slice(to, end),
    })
    if (matches.length >= limit) break
  }
  return matches
}
