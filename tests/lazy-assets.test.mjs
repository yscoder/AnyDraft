import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { before, describe, it } from 'node:test'
import { createServer } from 'vite'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(HERE, '../packages/web')

let findReferencedImages
let locateImage

before(async () => {
  const server = await createServer({
    configFile: path.join(WEB, 'vite.config.ts'),
    root: WEB,
    logLevel: 'error',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
  })
  try {
    ;({ findReferencedImages } = await server.ssrLoadModule(
      '/src/core/drafts/assets.ts',
    ))
    ;({ locateImage } = await server.ssrLoadModule(
      '/src/core/drafts/locate.ts',
    ))
  } finally {
    await server.close()
  }
})

describe('当前 Markdown 图片范围', () => {
  const nodes = [
    { kind: 'image', name: 'cover.png', path: 'a/cover.png' },
    { kind: 'image', name: 'cover.png', path: 'b/cover.png' },
    { kind: 'image', name: 'detail.png', path: 'a/assets/detail.png' },
    { kind: 'image', name: 'unused.png', path: 'a/unused.png' },
  ]

  it('只返回当前文档引用的图片，并优先同目录与精确相对路径', () => {
    const images = findReferencedImages(
      'a/article.md',
      '![[cover.png]]\n![](assets/detail.png)',
      nodes,
    )

    assert.deepEqual(
      images.map(({ name, node }) => [name, node.path]),
      [
        ['cover.png', 'a/cover.png'],
        ['detail.png', 'a/assets/detail.png'],
      ],
    )
  })

  it('图片定位不搜索其它 Markdown', () => {
    assert.equal(locateImage('正文\n![[cover.png]]', 'cover.png'), 1)
    assert.equal(locateImage('当前正文没有图片', 'cover.png'), null)
  })
})
