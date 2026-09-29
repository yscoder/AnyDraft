import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { getDensity, getTheme } from '@/core/theme/theme'
import {
  ensureHighlighter,
  isHighlighterReady,
  renderArticle,
} from '@/core/markdown/markdown'
import { readStored, writeStored } from '@/core/storage'
import { parseArticle } from '@/core/markdown/frontmatter'

interface Options {
  markdown: string
  imageUrls: Record<string, string>
}

export function useArticlePreview({ markdown, imageUrls }: Options) {
  const [themeId, setThemeId] = useState<string>(
    () => readStored('theme') ?? 'classic',
  )
  const [darkPreview, setDarkPreview] = useState(false)
  const [densityId, setDensityId] = useState<string>(
    () => readStored('density') ?? 'standard',
  )
  const theme = useMemo(() => getTheme(themeId), [themeId])
  const density = useMemo(() => getDensity(densityId), [densityId])
  const [hlReady, setHlReady] = useState(isHighlighterReady)
  const deferredMarkdown = useDeferredValue(markdown)
  const article = useMemo(() => parseArticle(markdown), [markdown])
  const result = useMemo(
    () => renderArticle(deferredMarkdown, theme, imageUrls, density),
    // hlReady 只作为「重算一次」的信号，不参与渲染入参
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deferredMarkdown, theme, imageUrls, density, hlReady],
  )
  const charCount = useMemo(
    () => article.body.replace(/\s/g, '').length,
    [article.body],
  )
  const countLevel: 'normal' | 'warn' | 'over' =
    charCount >= 20000 ? 'over' : charCount >= 18000 ? 'warn' : 'normal'
  const countClass = `pane-stat count ${countLevel === 'warn' ? 'count-warn' : countLevel === 'over' ? 'count-over' : ''}`

  useEffect(() => {
    if (hlReady) return
    let cancelled = false
    void ensureHighlighter().then(() => {
      if (!cancelled) setHlReady(isHighlighterReady())
    })
    return () => {
      cancelled = true
    }
  }, [hlReady])

  useEffect(() => {
    writeStored('theme', theme.id)
  }, [theme.id])
  useEffect(() => {
    writeStored('density', densityId)
  }, [densityId])

  return {
    themeId,
    setThemeId,
    darkPreview,
    setDarkPreview,
    densityId,
    setDensityId,
    theme,
    density,
    result,
    article,
    charCount,
    countLevel,
    countClass,
  }
}
