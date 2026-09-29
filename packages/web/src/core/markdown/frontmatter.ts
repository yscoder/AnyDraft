import { parseDocument, Document, isMap } from 'yaml'

export type ArticleStatus = 'draft' | 'ready' | 'published'
export type ArticleField = 'title' | 'author' | 'status'

export interface ArticleSource {
  body: string
  bodyStart: number
  lineOffset: number
  title: string
  author: string
  status: ArticleStatus | ''
  createdAt: string
  error: string | null
  legacyTitle: boolean
  headerEnd: number
}

const STATUSES = new Set<ArticleStatus>(['draft', 'ready', 'published'])

function leadingTitle(body: string): { title: string; length: number } | null {
  const match = body.match(/^(?:\r?\n)*# ([^\r\n]+)(?:\r?\n(?:\r?\n)?)?/)
  return match ? { title: match[1].trim(), length: match[0].length } : null
}

function stringField(doc: Document, key: string): string {
  const value = doc.get(key)
  return typeof value === 'string' ? value : ''
}

export function parseArticle(source: string): ArticleSource {
  const opening = source.match(/^(?:\uFEFF)?---[ \t]*\r?\n/)
  let headerEnd = 0
  let doc: Document | null = null
  let error: string | null = null
  if (opening) {
    const rest = source.slice(opening[0].length)
    const closing = rest.match(/^---[ \t]*(?:\r?\n|$)/m)
    if (!closing || closing.index === undefined) {
      error = 'YAML 头部缺少结束分隔线 ---'
    } else {
      headerEnd = opening[0].length + closing.index + closing[0].length
      doc = parseDocument(rest.slice(0, closing.index), { uniqueKeys: true })
      if (doc.errors.length || (doc.contents && !isMap(doc.contents))) {
        error = doc.errors[0]?.message ?? 'YAML 头部必须是字段列表'
      }
    }
  }
  if (error) {
    return {
      body: source,
      bodyStart: 0,
      lineOffset: 0,
      title: '',
      author: '',
      status: '',
      createdAt: '',
      error,
      legacyTitle: false,
      headerEnd,
    }
  }
  const title = doc ? stringField(doc, 'title') : ''
  const separator = headerEnd
    ? (source.slice(headerEnd).match(/^\r?\n/)?.[0].length ?? 0)
    : 0
  const rawBody = source.slice(headerEnd + separator)
  const legacy = title ? null : leadingTitle(rawBody)
  const bodyStart = headerEnd + separator + (legacy?.length ?? 0)
  const status = doc ? stringField(doc, 'status') : ''
  return {
    body: source.slice(bodyStart),
    bodyStart,
    lineOffset: source.slice(0, bodyStart).split('\n').length - 1,
    title: title || legacy?.title || '',
    author: doc ? stringField(doc, 'author') : '',
    status: STATUSES.has(status as ArticleStatus)
      ? (status as ArticleStatus)
      : '',
    createdAt: doc ? stringField(doc, 'createdAt') : '',
    error: null,
    legacyTitle: Boolean(legacy),
    headerEnd,
  }
}

export function updateArticleBody(source: string, body: string): string {
  const article = parseArticle(source)
  return article.error ? body : source.slice(0, article.bodyStart) + body
}

export function updateArticleField(
  source: string,
  field: ArticleField,
  value: string,
): string {
  const article = parseArticle(source)
  if (article.error) return source
  if (!article.headerEnd && !article.legacyTitle && !value.trim()) return source
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const yaml = article.headerEnd
    ? source
        .slice(0, article.headerEnd)
        .replace(/^(?:\uFEFF)?---[ \t]*\r?\n/, '')
        .replace(/---[ \t]*(?:\r?\n)?$/, '')
    : ''
  const doc = article.headerEnd ? parseDocument(yaml) : new Document()
  if (article.legacyTitle) doc.set('title', article.title)
  if (value.trim()) doc.set(field, value)
  else doc.delete(field)
  if (isMap(doc.contents)) doc.contents.flow = false
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : ''
  const header = `${bom}---${newline}${doc.toString().trimEnd().replace(/\n/g, newline)}${newline}---${newline}${newline}`
  return header + article.body
}

export function createArticleSource(now = new Date()): string {
  return `---\ntitle: ''\nstatus: draft\ncreatedAt: ${now.toISOString()}\n---\n\n`
}
