import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'
import { createServer } from 'vite'

let server
let dom
let applyPreviewDarkmode
let themes
let renderArticle
before(async () => {
  dom = new JSDOM('<!doctype html><html><head></head><body></body></html>')
  for (const key of ['window', 'self', 'document', 'HTMLElement', 'SVGElement'])
    globalThis[key] = dom.window[key]
  globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window)
  server = await createServer({
    root: new URL('../packages/web', import.meta.url).pathname,
    server: { middlewareMode: true },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  // Bundle the browser UMD dependency with the same interop used by Vite.
  const bundle = await build({
    entryPoints: ['packages/web/src/core/theme/previewDarkmode.ts'],
    bundle: true,
    platform: 'browser',
    format: 'cjs',
    write: false,
  })
  const module = { exports: {} }
  new Function('module', 'exports', bundle.outputFiles[0].text)(
    module,
    module.exports,
  )
  ;({ applyPreviewDarkmode } = module.exports)
  ;({ themes } = await server.ssrLoadModule('/src/core/theme/theme.ts'))
  ;({ renderArticle } = await server.ssrLoadModule(
    '/src/core/markdown/markdown.ts',
  ))
})
after(async () => {
  await server?.close()
  dom?.window.close()
  for (const key of [
    'window',
    'self',
    'document',
    'HTMLElement',
    'SVGElement',
    'getComputedStyle',
  ])
    delete globalThis[key]
})

test('dark preview is reversible, scoped and stable across edits and all eight themes', () => {
  assert.equal(themes.length, 8)
  assert.ok(
    themes.every(
      (theme) =>
        !['dark', 'midnight', 'graphite', 'night-sakura'].includes(theme.id),
    ),
  )
  document.body.innerHTML =
    '<aside style="color:#111;background:#fff">外部界面</aside><section class="preview-side"><div class="phone-screen" style="background:#fff;color:#191919"></div></section>'
  const screen = document.querySelector('.phone-screen')
  const outside = document.querySelector('aside')
  const outsideHTML = outside.outerHTML
  for (const theme of themes) {
    for (const text of ['初稿', '修改后的正文']) {
      const { body } = renderArticle(
        `# 标题\n\n${text} **强调** [链接](https://example.com)\n\n> 引用\n\n\`code\``,
        theme,
        {},
      )
      screen.innerHTML = body
      const original = screen.outerHTML
      const originalStyles = document.head.querySelectorAll('style').length
      const restore = applyPreviewDarkmode(screen)
      const css = [...document.head.querySelectorAll('style')]
        .map((style) => style.textContent)
        .join('')
      assert.match(css, /html\.data_color_scheme_dark \.preview-side /)
      assert.match(css, /background(?:-color)?: rgb\(25, 25, 25\)/)
      assert.ok(screen.querySelector('[class*="js_darkmode__"]'))
      assert.equal(outside.outerHTML, outsideHTML)
      // Export is generated from source, not the converted preview DOM.
      assert.equal(
        renderArticle(
          `# 标题\n\n${text} **强调** [链接](https://example.com)\n\n> 引用\n\n\`code\``,
          theme,
          {},
        ).body,
        body,
      )
      restore()
      assert.equal(screen.outerHTML, original)
      assert.equal(
        document.head.querySelectorAll('style').length,
        originalStyles,
      )
      assert.equal(
        document.documentElement.classList.contains('data_color_scheme_dark'),
        false,
      )
      for (const node of [screen, ...screen.querySelectorAll('*')]) {
        assert.ok(
          !Object.keys(node).some((key) => key.startsWith('data-darkmode-')),
        )
      }
    }
  }
})
