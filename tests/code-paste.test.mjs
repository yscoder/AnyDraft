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
const code =
  "type Draft = { title: string; saved: boolean }\n\nconst draft: Draft = { title: '排版测试', saved: true }\nconsole.log(draft.title)"
let server
let dom
let renderArticle
let ensureHighlighter
let copyRichText

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
  ;({ renderArticle, ensureHighlighter } = await server.ssrLoadModule(
    '/src/core/markdown/markdown.ts',
  ))
  ;({ copyRichText } = await server.ssrLoadModule(
    '/src/core/transfer/clipboard.ts',
  ))
  await ensureHighlighter()
})

after(async () => {
  await server?.close()
  dom?.window.close()
  delete globalThis.DOMParser
})

test('高亮代码复制后保留空格，纯文本仍使用普通空格', async () => {
  const { html } = renderArticle(`\`\`\`typescript\n${code}\n\`\`\``)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const lines = [...doc.querySelectorAll('pre code')]
  assert.equal(lines.length, 4)
  assert.equal(
    lines
      .map((line) =>
        line.textContent === '\u00a0'
          ? ''
          : line.textContent.replace(/\u00a0/g, ' '),
      )
      .join('\n'),
    code,
  )
  assert.match(lines[0].innerHTML, /type<\/span>&nbsp;<span[^>]*>Draft/)
  assert.match(lines[2].innerHTML, /const<\/span>&nbsp;<span[^>]*>draft/)
  for (const line of lines) {
    const walker = doc.createTreeWalker(line, dom.window.NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      assert.doesNotMatch(walker.currentNode.textContent, / /)
    }
  }

  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    'navigator',
  )
  const originalClipboardItem = globalThis.ClipboardItem
  let item
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { write: async (items) => ([item] = items) } },
  })
  globalThis.ClipboardItem = class {
    constructor(data) {
      this.data = data
    }
  }
  try {
    assert.equal(await copyRichText(html), true)
    assert.equal(await item.data['text/plain'].text(), code)
    assert.match(
      await item.data['text/html'].text(),
      /type<\/span>&nbsp;<span[^>]*>Draft/,
    )
  } finally {
    if (originalNavigator)
      Object.defineProperty(globalThis, 'navigator', originalNavigator)
    else delete globalThis.navigator
    globalThis.ClipboardItem = originalClipboardItem
  }
})
