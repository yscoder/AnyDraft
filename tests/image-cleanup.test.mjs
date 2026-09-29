import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { before, describe, it } from 'node:test'
import { createServer } from 'vite'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WEB = path.resolve(HERE, '../packages/web')

let scanUnusedImages

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
    ;({ scanUnusedImages } = await server.ssrLoadModule(
      '/src/features/image-cleanup/scan.ts',
    ))
  } finally {
    await server.close()
  }
})

function repository(nodes, contents, unreadable = '') {
  return {
    list: async () => nodes,
    readTextFile: async (file) => {
      if (file === unreadable) throw new Error('read failed')
      return contents[file]
    },
  }
}

describe('未引用图片扫描', () => {
  it('扫描所有 Markdown，按完整路径处理同名图片，忽略代码块示例', async () => {
    const nodes = [
      { kind: 'markdown', path: 'a/article.md' },
      { kind: 'markdown', path: 'b/article.md' },
      { kind: 'image', path: 'a/cover.png' },
      { kind: 'image', path: 'b/cover.png' },
      { kind: 'image', path: 'unused.png' },
      { kind: 'image', path: 'sample.png' },
    ]
    const repo = repository(nodes, {
      'a/article.md': '![[cover.png]]\n```md\n![[sample.png]]\n```',
      'b/article.md': '![](cover.png)',
    })
    const progress = []
    const result = await scanUnusedImages(repo, {}, (done, total) =>
      progress.push([done, total]),
    )
    assert.deepEqual(
      result.unused.map((node) => node.path),
      ['sample.png', 'unused.png'],
    )
    assert.deepEqual(progress, [
      [0, 2],
      [1, 2],
      [2, 2],
    ])
  })

  it('全局同名回退有歧义时保留所有图片，并使用未保存正文', async () => {
    const nodes = [
      { kind: 'markdown', path: 'article.md' },
      { kind: 'image', path: 'a/cover.png' },
      { kind: 'image', path: 'b/cover.png' },
      { kind: 'image', path: 'other.png' },
    ]
    const result = await scanUnusedImages(
      repository(nodes, { 'article.md': '' }),
      { 'article.md': '![[cover.png]]' },
      () => {},
    )
    assert.deepEqual(
      result.unused.map((node) => node.path),
      ['other.png'],
    )
  })

  it('同一文档中的两条显式路径不会按文件名去重', async () => {
    const nodes = [
      { kind: 'markdown', path: 'article.md' },
      { kind: 'image', path: 'a/cover.png' },
      { kind: 'image', path: 'b/cover.png' },
    ]
    const result = await scanUnusedImages(
      repository(nodes, {
        'article.md': '![](a/cover.png)\n![](b/cover.png)',
      }),
      {},
      () => {},
    )
    assert.deepEqual(result.unused, [])
  })

  it('任一文档读取失败时停止，不给出候选清单', async () => {
    const nodes = [
      { kind: 'markdown', path: 'article.md' },
      { kind: 'image', path: 'cover.png' },
    ]
    await assert.rejects(
      scanUnusedImages(repository(nodes, {}, 'article.md'), {}, () => {}),
      /无法读取「article.md」/,
    )
  })
})
