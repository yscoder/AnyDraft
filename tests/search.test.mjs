import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { createServer } from 'vite'
import path from 'node:path'
let findMatches, recentMarkdown
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
    ;({ findMatches, recentMarkdown } = await server.ssrLoadModule(
      '/src/features/search/search.ts',
    ))
  } finally {
    await server.close()
  }
})
describe('工作区搜索', () => {
  it('中文短词、重复命中与 CRLF 行号保持源码位置', () => {
    const source = '😀标题\r\n正文排版，排版'
    const matches = findMatches(source, '排版')
    assert.equal(matches.length, 2)
    for (const hit of matches) {
      assert.equal(hit.line, 2)
      assert.equal(source.slice(hit.from, hit.to), '排版')
    }
  })
  it('将正则字符作为字面内容，并默认忽略大小写', () => {
    assert.equal(findMatches('a.b axb A.B', 'a.b').length, 2)
    assert.equal(findMatches('a.b axb A.B', 'A.B').length, 2)
    assert.equal(findMatches('[x] + $', '[x]').length, 1)
  })
  it('Unicode 大小写匹配不改变源码偏移', () => {
    const source = 'İ 😀 ABC'
    const hit = findMatches(source, 'abc')[0]
    assert.equal(source.slice(hit.from, hit.to), 'ABC')
  })
  it('空查询、命中上限与片段边界', () => {
    assert.deepEqual(findMatches('正文', ''), [])
    assert.equal(findMatches('文文文', '文', 2).length, 2)
    assert.deepEqual(findMatches('正文', '文', 0), [])
    const hit = findMatches('前一行\n前正文后\n下一行', '正文')[0]
    assert.equal(hit.before, '前')
    assert.equal(hit.after, '后')
  })
  it('最近列表仅包含 Markdown，按修改时间排序且不修改原数组', () => {
    const nodes = Array.from({ length: 12 }, (_, i) => ({
      kind: 'markdown',
      path: `${i}.md`,
      name: `${i}.md`,
      updatedAt: i,
    }))
    nodes.push({ kind: 'image', path: 'image.png', updatedAt: 100 })
    const before = [...nodes]
    const recent = recentMarkdown(nodes)
    assert.equal(recent.length, 10)
    assert.equal(recent[0].path, '11.md')
    assert.deepEqual(nodes, before)
  })
})
