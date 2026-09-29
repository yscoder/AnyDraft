import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { before, describe, it } from 'node:test'
import { createServer } from 'vite'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(HERE, '../packages/web')

let findReferencedImages
let locateImage
let imageReference
let renderArticle

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
    ;({ imageReference } = await server.ssrLoadModule(
      '/src/core/markdown/imageReference.ts',
    ))
    ;({ renderArticle } = await server.ssrLoadModule(
      '/src/core/markdown/markdown.ts',
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
      '![封面](cover.png)\n![](assets/detail.png)',
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
    assert.equal(locateImage('正文\n![封面](cover.png)', 'cover.png'), 1)
    assert.equal(locateImage('当前正文没有图片', 'cover.png'), null)
  })

  it('新图片引用采用标准语法，复杂文件名可被扫描和定位', () => {
    const name = '中文 图 (1)[终].png'
    const reference = imageReference(name)
    assert.equal(
      imageReference('image-dep.png'),
      '![image-dep.png](image-dep.png)',
    )
    assert.match(reference, /^!\[.+\]\(.+%20.+%281%29%5B.+%5D\.png\)$/)
    assert.deepEqual(
      findReferencedImages('a/article.md', reference, [
        { kind: 'image', name, path: `a/${name}` },
      ]).map(({ node }) => node.path),
      [`a/${name}`],
    )
    assert.equal(locateImage(`正文\n${reference}`, name), 1)
    assert.match(
      renderArticle(reference, undefined, {
        [name]: 'data:image/png;base64,AA==',
      }).body,
      /<img src="data:image\/png;base64,AA=="/,
    )
    assert.deepEqual(
      findReferencedImages('a/article.md', '![[cover.png]]', nodes),
      [],
    )
  })
})
