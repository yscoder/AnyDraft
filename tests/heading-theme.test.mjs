import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

let server
let renderArticle
let extractTitle
let getTheme

before(async () => {
  server = await createServer({
    root: new URL('../packages/web', import.meta.url).pathname,
    server: { middlewareMode: true },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  ;({ renderArticle, extractTitle } = await server.ssrLoadModule(
    '/src/core/markdown/markdown.ts',
  ))
  ;({ getTheme } = await server.ssrLoadModule('/src/core/theme/theme.ts'))
})

after(async () => {
  await server?.close()
})

test('symbol decor adds one visible # per heading without changing the article title', () => {
  const base = getTheme('classic')
  const theme = {
    ...base,
    heading: { ...base.heading, textAlign: 'center', decor: 'symbol' },
  }
  const { body } = renderArticle('# 文章标题\n\n## 二级标题', theme)
  const dom = new JSDOM(body)
  const headings = [...dom.window.document.querySelectorAll('h1, h2')]

  assert.equal(headings.length, 2)
  for (const heading of headings) {
    assert.equal(heading.style.textAlign, 'center')
    const symbol = heading.querySelector('[data-heading-decor="symbol"]')
    assert.equal(symbol?.textContent, '#')
    assert.equal(symbol?.getAttribute('aria-hidden'), 'true')
    assert.ok(symbol?.getAttribute('style')?.includes(`color:${base.accent}`))
    assert.equal(heading.querySelectorAll('[data-heading-decor]').length, 1)
  }
  assert.equal(extractTitle(body), '文章标题')
  dom.window.close()
})

test('left-bar decor is an inline heading border and does not alter its text', () => {
  const base = getTheme('classic')
  const theme = {
    ...base,
    heading: { ...base.heading, textAlign: 'right', decor: 'left-bar' },
  }
  const { body } = renderArticle('## 二级标题', theme)
  const dom = new JSDOM(body)
  const heading = dom.window.document.querySelector('h2')

  assert.equal(heading?.style.textAlign, 'right')
  assert.ok(
    heading
      ?.getAttribute('style')
      ?.includes(`border-left:4px solid ${base.accent}`),
  )
  assert.equal(heading?.style.paddingLeft, '12px')
  assert.equal(heading?.textContent, '二级标题')
  assert.equal(heading?.querySelector('[data-heading-decor]'), null)
  dom.window.close()
})

test('themes without the new fields keep the existing heading output', () => {
  const { body } = renderArticle('# 标题', getTheme('classic'))
  const dom = new JSDOM(body)
  const heading = dom.window.document.querySelector('h1')

  assert.equal(heading?.style.textAlign, '')
  assert.equal(heading?.style.borderLeft, '')
  assert.equal(heading?.textContent, '标题')
  dom.window.close()
})
