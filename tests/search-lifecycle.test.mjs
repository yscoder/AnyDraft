import assert from 'node:assert/strict'
import { after, before, it } from 'node:test'
import { JSDOM } from 'jsdom'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { createServer } from 'vite'
import path from 'node:path'

let useWorkspaceSearch, findMatches, server
const dom = new JSDOM('<div id="root"></div>')
globalThis.window = dom.window
globalThis.document = dom.window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true
class TestWorker {
  terminated = false
  postMessage(message) {
    queueMicrotask(() => {
      if (!this.terminated)
        this.onmessage({
          data: {
            path: message.path,
            matches: findMatches(message.text, message.query, message.limit),
          },
        })
    })
  }
  terminate() {
    this.terminated = true
  }
}
globalThis.Worker = TestWorker
before(async () => {
  server = await createServer({
    configFile: path.resolve('packages/web/vite.config.ts'),
    root: path.resolve('packages/web'),
    logLevel: 'error',
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false },
  })
  ;({ useWorkspaceSearch } = await server.ssrLoadModule(
    '/src/features/search/useWorkspaceSearch.ts',
  ))
  ;({ findMatches } = await server.ssrLoadModule(
    '/src/features/search/search.ts',
  ))
})
after(async () => {
  await server.close()
  dom.window.close()
})
const nodes = [
  { kind: 'markdown', path: 'a.md', name: 'a.md', updatedAt: 1, size: 10 },
]
const empty = {}
const wait = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 190))
  })
async function harness() {
  const root = createRoot(document.getElementById('root'))
  let state
  function Probe({ repo, query, overlays = empty, files = nodes }) {
    state = useWorkspaceSearch(repo, files, query, overlays)
    return null
  }
  return {
    render: (props) =>
      act(async () => root.render(React.createElement(Probe, props))),
    get state() {
      return state
    },
    close: () => act(async () => root.unmount()),
  }
}
it('未保存的空文本覆盖磁盘旧命中；空查询不读取正文', async () => {
  const h = await harness()
  let reads = 0
  const repo = {
    readTextFile: async () => {
      reads++
      return '旧正文'
    },
  }
  try {
    await h.render({ repo, query: '' })
    await wait()
    assert.equal(reads, 0)
    await h.render({ repo, query: '正文', overlays: { 'a.md': '' } })
    await wait()
    assert.equal(reads, 0)
    assert.equal(h.state.results.length, 0)
    assert.equal(h.state.busy, false)
  } finally {
    await h.close()
  }
})
it('切换工作区后旧读取不能污染结果，删除节点移除结果', async () => {
  const h = await harness()
  let resolveOld
  const oldRepo = {
    readTextFile: () =>
      new Promise((resolve) => {
        resolveOld = resolve
      }),
  }
  const newRepo = { readTextFile: async () => '新正文' }
  try {
    await h.render({ repo: oldRepo, query: '正文' })
    await wait()
    await h.render({ repo: newRepo, query: '正文' })
    await wait()
    await act(async () => resolveOld('旧正文'))
    assert.equal(h.state.results[0].matches[0].before, '新')
    await h.render({ repo: newRepo, query: '正文', files: [] })
    await wait()
    assert.equal(h.state.results.length, 0)
  } finally {
    await h.close()
  }
})
it('复用缓存、元数据变化重读，读取失败不阻断其它文件', async () => {
  const h = await harness()
  let reads = 0
  const repo = {
    readTextFile: async (file) => {
      reads++
      if (file === 'bad.md') throw Error('denied')
      return '正文内容'
    },
  }
  try {
    await h.render({ repo, query: '正文' })
    await wait()
    await h.render({ repo, query: '内容' })
    await wait()
    assert.equal(reads, 1)
    await h.render({
      repo,
      query: '内容',
      files: [
        { ...nodes[0], updatedAt: 2 },
        { ...nodes[0], path: 'bad.md' },
      ],
    })
    await wait()
    assert.equal(reads, 3)
    assert.equal(h.state.failed, 1)
    assert.equal(h.state.results.length, 1)
  } finally {
    await h.close()
  }
})
it('并发返回仍遵守总命中上限', async () => {
  const h = await harness()
  const repo = { readTextFile: async () => '文'.repeat(800) }
  try {
    await h.render({
      repo,
      query: '文',
      files: [...nodes, { ...nodes[0], path: 'b.md' }],
    })
    await wait()
    assert.equal(
      h.state.results.reduce((sum, result) => sum + result.matches.length, 0),
      1000,
    )
    assert.equal(h.state.limited, true)
  } finally {
    await h.close()
  }
})
