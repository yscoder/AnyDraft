import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

const WEB = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../packages/web',
)
let server
let dom
let renderArticle
let checkBeforeCopy
let findReferencedImages

before(async () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.DOMParser = dom.window.DOMParser
  server = await createServer({
    configFile: path.join(WEB, 'vite.config.ts'),
    root: WEB,
    logLevel: 'error',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
  })
  ;({ renderArticle } = await server.ssrLoadModule(
    '/src/core/markdown/markdown.ts',
  ))
  ;({ checkBeforeCopy } = await server.ssrLoadModule(
    '/src/features/transfer/checkBeforeCopy.ts',
  ))
  ;({ findReferencedImages } = await server.ssrLoadModule(
    '/src/core/drafts/assets.ts',
  ))
})

after(async () => {
  await server?.close()
  dom?.window.close()
  delete globalThis.DOMParser
})

const nodes = [{ kind: 'image', name: 'found.png', path: 'draft/found.png' }]
function check(markdown, unreadable = []) {
  const { body } = renderArticle(markdown)
  return checkBeforeCopy(markdown, body, 'draft/article.md', nodes, unreadable)
}

test('没有 h1 可复制，多个 h1 给出提示', () => {
  assert.deepEqual(check('正文'), [])
  assert.deepEqual(
    check('# 第一\n\n# 第二').map((item) => item.category),
    ['标题'],
  )
})

test('沿用状态栏的字数阈值', () => {
  assert.match(check('文'.repeat(18000))[0].message, /接近/)
  assert.match(check('文'.repeat(20000))[0].message, /达到或超过/)
})

test('缺失图片与读取失败会提示，代码块中的图片语法不参与检查或加载', () => {
  const markdown =
    '```md\n![](example.png)\n```\n\n![](missing.png)\n\n![已有图片](found.png)'
  assert.deepEqual(
    check(markdown, ['found.png'])
      .filter((item) => item.category === '图片')
      .map((item) => item.message),
    [
      '本地图片「missing.png」不存在，复制后会显示占位提示。',
      '本地图片「found.png」读取失败，复制后会显示占位提示。',
    ],
  )
  assert.deepEqual(
    findReferencedImages('draft/article.md', markdown, nodes).map(
      (item) => item.name,
    ),
    ['found.png'],
  )
})

test('链接只做本地格式检查，不请求网络', () => {
  const messages = check(
    '[正常](https://example.com) [相对](article) <a href="javascript:alert(1)">危险</a>',
  )
    .filter((item) => item.category === '链接')
    .map((item) => item.message)
  assert.equal(messages.length, 2)
  assert.ok(messages.some((message) => message.includes('article')))
  assert.ok(messages.some((message) => message.includes('javascript:')))
})

test('待补充正文给出提示，代码中的示例不提示', () => {
  assert.ok(check('这里待补充。').some((item) => item.category === '内容'))
  assert.deepEqual(check('正文 `TODO`'), [])
})
