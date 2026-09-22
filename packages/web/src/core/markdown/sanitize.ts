import sanitizeHtml from 'sanitize-html'

const ALLOWED_TAGS = [
  'a',
  'blockquote',
  'br',
  'code',
  'del',
  'details',
  'div',
  'em',
  'figcaption',
  'figure',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'img',
  'li',
  'mark',
  'ol',
  'p',
  'pre',
  'section',
  'span',
  'strong',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'ul',
]

const DANGEROUS_STYLE =
  /(?:expression\s*\(|url\s*\(|@import|behavior\s*:|-moz-binding)/i

/**
 * 清理最终渲染 HTML，使未信任 Markdown 不能借原生 HTML 获取脚本执行能力。
 * 主题生成的内联样式保留，但任何可发起 URL 加载或旧式脚本表达式的样式会被移除。
 */
export function sanitizeRenderedHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      '*': ['style', 'data-line', 'data-tip'],
      a: ['href', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'data', 'blob'],
    },
    allowProtocolRelative: false,
    transformTags: {
      '*': (tagName, attributes) => {
        const safeAttributes = { ...attributes }
        if (
          safeAttributes.style &&
          DANGEROUS_STYLE.test(safeAttributes.style)
        ) {
          delete safeAttributes.style
        }
        return { tagName, attribs: safeAttributes }
      },
    },
  })
}
