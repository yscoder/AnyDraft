import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { createServer } from 'vite'
import path from 'node:path'

let FsaRepository
before(async () => {
  const server = await createServer({
    configFile: path.resolve('packages/web/vite.config.ts'),
    root: path.resolve('packages/web'),
    logLevel: 'error',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false },
  })
  try {
    ;({ FsaRepository } = await server.ssrLoadModule('/src/core/fs/fsa.ts'))
  } finally {
    await server.close()
  }
})

function missing() {
  return new DOMException('Entry not found', 'NotFoundError')
}

class MemoryFile {
  kind = 'file'
  data = new Blob([])

  constructor(name) {
    this.name = name
  }

  async getFile() {
    return new File([this.data], this.name)
  }

  async createWritable() {
    return {
      write: async (data) => {
        this.data = data instanceof Blob ? data : new Blob([data])
      },
      close: async () => {},
    }
  }
}

class MemoryDirectory {
  kind = 'directory'
  entriesMap = new Map()

  constructor(name) {
    this.name = name
  }

  async getFileHandle(name, options = {}) {
    let entry = this.entriesMap.get(name)
    if (!entry && options.create) {
      entry = new MemoryFile(name)
      this.entriesMap.set(name, entry)
    }
    if (entry?.kind !== 'file') throw missing()
    return entry
  }

  async getDirectoryHandle(name, options = {}) {
    let entry = this.entriesMap.get(name)
    if (!entry && options.create) {
      entry = new MemoryDirectory(name)
      this.entriesMap.set(name, entry)
    }
    if (entry?.kind !== 'directory') throw missing()
    return entry
  }

  async removeEntry(name) {
    if (!this.entriesMap.delete(name)) throw missing()
  }

  async *entries() {
    yield* this.entriesMap.entries()
  }
}

describe('回收站', () => {
  it('删除和恢复文档，原位置重名时保留两份内容', async () => {
    const root = new MemoryDirectory('test')
    const repo = new FsaRepository(root)
    await repo.createTextFile('', '文章.md', '原稿')
    await repo.trashNode('文章.md')
    assert.equal((await repo.list()).length, 0)
    const [entry] = await repo.listTrash()
    assert.equal(entry.originalPath, '文章.md')
    const trash = await (
      await root.getDirectoryHandle('.anydraft')
    ).getDirectoryHandle('trash')
    const index = JSON.parse(
      await (await (await trash.getFileHandle('index.json')).getFile()).text(),
    )
    assert.deepEqual(index, { version: 1, entries: [entry] })
    await assert.rejects(
      (await trash.getDirectoryHandle(entry.id)).getFileHandle('info.json'),
    )
    await repo.createTextFile('', '文章.md', '新稿')
    assert.equal(await repo.restoreTrash(entry.id), '文章 2.md')
    assert.equal(await repo.readTextFile('文章.md'), '新稿')
    assert.equal(await repo.readTextFile('文章 2.md'), '原稿')
    assert.deepEqual(await repo.listTrash(), [])
    const emptyIndex = JSON.parse(
      await (await (await trash.getFileHandle('index.json')).getFile()).text(),
    )
    assert.deepEqual(emptyIndex.entries, [])
  })

  it('文件夹及图片整体进入回收站，并可永久删除', async () => {
    const repo = new FsaRepository(new MemoryDirectory('test'))
    await repo.createDirectory('', '专题')
    await repo.createTextFile('专题', '文章.md', '正文')
    await repo.createDirectory('专题', '子目录')
    await repo.createTextFile('专题/子目录', '续篇.md', '续篇')
    await repo.createImageFile(
      '专题',
      '图片.png',
      new Blob(['image'], { type: 'image/png' }),
    )
    await repo.trashNode('专题')
    assert.deepEqual(await repo.list(), [])
    const [entry] = await repo.listTrash()
    assert.equal(entry.kind, 'dir')
    assert.deepEqual(
      (await repo.listTrashNodes(entry.id)).map((node) => node.path).sort(),
      ['图片.png', '子目录', '子目录/续篇.md', '文章.md'],
    )
    assert.equal(await repo.readTrashText(entry.id, '文章.md'), '正文')
    assert.equal(await repo.readTrashText(entry.id, '子目录/续篇.md'), '续篇')
    const imageUrl = await repo.trashImageUrl(entry.id, '图片.png')
    assert.match(imageUrl, /^blob:/)
    URL.revokeObjectURL(imageUrl)
    await repo.removeTrash(entry.id)
    assert.deepEqual(await repo.listTrash(), [])
  })

  it('并发删除共用一个索引，不丢失其它条目', async () => {
    const root = new MemoryDirectory('test')
    const repo = new FsaRepository(root)
    await repo.createTextFile('', '甲.md', '甲')
    await repo.createTextFile('', '乙.md', '乙')
    await Promise.all([repo.trashNode('甲.md'), repo.trashNode('乙.md')])
    const entries = await repo.listTrash()
    assert.deepEqual(entries.map((entry) => entry.name).sort(), [
      '乙.md',
      '甲.md',
    ])
    const trash = await (
      await root.getDirectoryHandle('.anydraft')
    ).getDirectoryHandle('trash')
    const index = JSON.parse(
      await (await (await trash.getFileHandle('index.json')).getFile()).text(),
    )
    assert.equal(index.entries.length, 2)
    await repo.removeTrash(entries[0].id)
    assert.equal((await repo.listTrash()).length, 1)
  })

  it('单独删除图片后可恢复，且不会覆盖同名新图片', async () => {
    const root = new MemoryDirectory('test')
    const repo = new FsaRepository(root)
    await repo.createImageFile(
      '',
      '配图.png',
      new Blob(['原图'], { type: 'image/png' }),
    )
    await repo.trashNode('配图.png')
    const [entry] = await repo.listTrash()
    assert.equal(entry.kind, 'image')
    assert.deepEqual(await repo.list(), [])
    await repo.createImageFile(
      '',
      '配图.png',
      new Blob(['新图'], { type: 'image/png' }),
    )
    assert.equal(await repo.restoreTrash(entry.id), '配图 2.png')
    assert.equal(
      await (await (await root.getFileHandle('配图.png')).getFile()).text(),
      '新图',
    )
    assert.equal(
      await (await (await root.getFileHandle('配图 2.png')).getFile()).text(),
      '原图',
    )
  })
})
