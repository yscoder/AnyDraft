import { SANS } from '../fonts'
import type { Theme } from '../types'
import { classicTheme } from './classic'

type CommunityTheme = Pick<Theme, 'id' | 'name' | 'description' | 'accent'> & {
  accentSoft?: string
  body?: Partial<Theme['body']>
  heading?: Partial<Theme['heading']>
  headingSizes?: Partial<Theme['headingSizes']>
  pMargin?: string
  quote?: Partial<Theme['quote']>
  callout?: Partial<Theme['callout']>
  code?: Partial<Theme['code']>
  codeBlock?: Partial<Theme['codeBlock']>
  link?: Partial<Theme['link']>
  listPaddingLeft?: string
  listItemMargin?: string
  table?: Partial<Theme['table']>
  hr?: Partial<Theme['hr']>
  img?: Partial<Theme['img']>
  strongColor?: string
  delColor?: string
  mark?: Partial<Theme['mark']>
  footnote?: Partial<Theme['footnote']>
}

/** 将外部 CSS 主题的可内联样式合并到稿域的完整主题结构。 */
export function communityTheme(source: CommunityTheme): Theme {
  const accent = source.accent
  const quote = { ...classicTheme.quote, ...source.quote }
  return {
    ...classicTheme,
    id: source.id,
    name: source.name,
    description: source.description,
    accent,
    ...(source.accentSoft ? { accentSoft: source.accentSoft } : {}),
    ...(source.pMargin ? { pMargin: source.pMargin } : {}),
    ...(source.listPaddingLeft
      ? { listPaddingLeft: source.listPaddingLeft }
      : {}),
    ...(source.listItemMargin ? { listItemMargin: source.listItemMargin } : {}),
    ...(source.strongColor ? { strongColor: source.strongColor } : {}),
    ...(source.delColor ? { delColor: source.delColor } : {}),
    body: { ...classicTheme.body, font: SANS, ...source.body },
    heading: { ...classicTheme.heading, font: SANS, ...source.heading },
    headingSizes: { ...classicTheme.headingSizes, ...source.headingSizes },
    quote,
    callout: {
      ...classicTheme.callout,
      background: quote.background,
      color: quote.color,
      borderLeft: quote.borderLeft,
      ...source.callout,
    },
    code: { ...classicTheme.code, ...source.code },
    codeBlock: { ...classicTheme.codeBlock, ...source.codeBlock },
    link: { color: accent, textDecoration: 'underline', ...source.link },
    table: { ...classicTheme.table, ...source.table },
    hr: {
      ...classicTheme.hr,
      color: source.table?.borderColor ?? accent,
      ...source.hr,
    },
    img: { ...classicTheme.img, ...source.img },
    mark: { ...classicTheme.mark, ...source.mark },
    footnote: {
      ...classicTheme.footnote,
      refColor: accent,
      numColor: accent,
      blockBorder:
        source.table?.borderColor ?? classicTheme.footnote.blockBorder,
      ...source.footnote,
    },
  }
}
