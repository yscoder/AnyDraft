import { findMatches } from './search'

self.onmessage = (
  event: MessageEvent<{
    path: string
    text: string
    query: string
    limit: number
  }>,
) => {
  const { path, text, query, limit } = event.data
  self.postMessage({
    path,
    matches: findMatches(text, query, limit),
  })
}
