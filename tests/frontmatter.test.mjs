import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

const WEB = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages/web',
)
let server
let parseArticle
let updateArticleBody
let updateArticleField
let createArticleSource
let renderArticle

before(async () => {
  server = await createServer({
    configFile: path.join(WEB, 'vite.config.ts'),
    root: WEB,
    logLevel: 'error',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
  })
  ;({
    parseArticle,
    updateArticleBody,
    updateArticleField,
    createArticleSource,
  } = await server.ssrLoadModule('/src/core/markdown/frontmatter.ts'))
  ;({ renderArticle } = await server.ssrLoadModule(
    '/src/core/markdown/markdown.ts',
  ))
})

after(async () => server?.close())

test('读取 YAML 与正文并保持源码行号', () => {
  const source =
    '---\ntitle: 标题\nauthor: 小王\nstatus: draft\ncreatedAt: 2026-09-29T03:51:00.000Z\n---\n\n## 正文'
  const article = parseArticle(source)
  assert.equal(article.title, '标题')
  assert.equal(article.author, '小王')
  assert.equal(article.status, 'draft')
  assert.equal(article.lineOffset, 7)
  assert.equal(article.body, '## 正文')
  assert.doesNotMatch(renderArticle(source).body, /createdAt|author:/)
  assert.match(renderArticle(source).body, /正文/)
  assert.match(renderArticle(source).body, /data-line="7"/)
})

test('编辑字段保留未知字段和注释，正文编辑不改 YAML', () => {
  const source =
    '---\n# 我的备注\ntitle: 原标题\ntags: [写作, 微信]\n---\n\n旧正文'
  const changed = updateArticleField(source, 'author', '阿明')
  assert.match(changed, /# 我的备注/)
  assert.match(changed, /tags: \[\s*写作, 微信\s*\]/)
  assert.equal(parseArticle(changed).author, '阿明')
  assert.equal(
    updateArticleBody(source, '新正文'),
    source.replace('旧正文', '新正文'),
  )
  assert.equal(
    parseArticle(updateArticleField(changed, 'title', '两 个字')).title,
    '两 个字',
  )
})

test('编辑行内 YAML 后将顶层字段写成逐行格式', () => {
  const source = '---\n{ title: 从一篇草稿开始, status: draft }\n---\n\n正文'
  const changed = updateArticleField(source, 'author', '阿明')
  assert.match(
    changed,
    /^---\ntitle: 从一篇草稿开始\nstatus: draft\nauthor: 阿明\n---/,
  )
  assert.equal(parseArticle(changed).body, '正文')
})

test('旧文档首个 H1 显示为标题，首次字段编辑迁入 YAML', () => {
  const source = '# 旧标题\n\n正文'
  assert.equal(parseArticle(source).title, '旧标题')
  assert.equal(parseArticle(source).body, '正文')
  const changed = updateArticleField(source, 'title', '新标题')
  assert.equal(parseArticle(changed).title, '新标题')
  assert.equal(parseArticle(changed).body, '正文')
  assert.equal(changed.match(/# 旧标题/g), null)
})

test('无效 YAML 不被字段编辑覆盖，源码可直接修复', () => {
  const source = '---\ntitle: [未闭合\n---\n\n正文'
  assert.ok(parseArticle(source).error)
  assert.equal(updateArticleField(source, 'title', '新标题'), source)
  assert.equal(parseArticle(source).body, source)
})

test('新文档写入只读创建时间与草稿状态', () => {
  const source = createArticleSource(new Date('2026-09-29T03:51:00.000Z'))
  assert.equal(parseArticle(source).createdAt, '2026-09-29T03:51:00.000Z')
  assert.equal(parseArticle(source).status, 'draft')
  const changed = updateArticleField(source, 'status', 'ready')
  assert.equal(parseArticle(changed).createdAt, '2026-09-29T03:51:00.000Z')
  assert.equal(parseArticle(changed).status, 'ready')
  assert.doesNotMatch(source, /cover|publishedAt/)
})
