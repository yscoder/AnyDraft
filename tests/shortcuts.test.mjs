import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import path from 'node:path'
import { createServer } from 'vite'

let matchesShortcut,
  shortcutKeys,
  shortcutLabel,
  codeMirrorKey,
  isShortcutAvailable

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
    ;({
      matchesShortcut,
      shortcutKeys,
      shortcutLabel,
      codeMirrorKey,
      isShortcutAvailable,
    } = await server.ssrLoadModule('/src/features/shortcuts/shortcuts.ts'))
  } finally {
    await server.close()
  }
})

const event = (key, modifiers = {}) => ({
  key,
  code: key === '/' ? 'Slash' : `Key${key.toUpperCase()}`,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...modifiers,
})

describe('工作区快捷键', () => {
  it('Mac 和 Windows 使用各自的 Mod，刷新始终使用 Ctrl', () => {
    assert.equal(
      matchesShortcut(event('n', { metaKey: true }), 'newDocument', true),
      true,
    )
    assert.equal(
      matchesShortcut(event('n', { ctrlKey: true }), 'newDocument', true),
      false,
    )
    assert.equal(
      matchesShortcut(event('n', { ctrlKey: true }), 'newDocument', false),
      true,
    )
    assert.equal(
      matchesShortcut(event('r', { ctrlKey: true }), 'refresh', true),
      true,
    )
    assert.equal(
      matchesShortcut(event('r', { metaKey: true }), 'refresh', true),
      false,
    )
  })

  it('精确匹配修饰键，避免额外 Shift 或 Alt 误触发', () => {
    assert.equal(
      matchesShortcut(
        event('F', { metaKey: true, shiftKey: true }),
        'search',
        true,
      ),
      true,
    )
    assert.equal(
      matchesShortcut(event('f', { metaKey: true }), 'search', true),
      false,
    )
    assert.equal(
      matchesShortcut(
        event('f', { metaKey: true, shiftKey: true, altKey: true }),
        'search',
        true,
      ),
      false,
    )
    assert.equal(
      matchesShortcut(event('/', { metaKey: true }), 'help', true),
      true,
    )
    assert.equal(
      matchesShortcut(event(']', { metaKey: true }), 'viewMode', true),
      true,
    )
    assert.equal(
      matchesShortcut(
        event(']', { metaKey: true, shiftKey: true }),
        'viewMode',
        true,
      ),
      false,
    )
  })

  it('Web 隐藏文件类快捷键，桌面端保留', () => {
    for (const id of ['newDocument', 'openDirectory', 'refresh']) {
      assert.equal(isShortcutAvailable(id, 'web'), false)
      assert.equal(isShortcutAvailable(id, 'tauri'), true)
    }
    assert.equal(isShortcutAvailable('viewMode', 'web'), true)
  })

  it('加粗与侧栏共享键位，界面文字来自同一定义', () => {
    const bold = event('b', { metaKey: true })
    assert.equal(matchesShortcut(bold, 'bold', true), true)
    assert.equal(matchesShortcut(bold, 'sidebar', true), true)
    assert.equal(codeMirrorKey('bold'), 'Mod-b')
    assert.equal(codeMirrorKey('help'), 'Mod-/')
    assert.equal(codeMirrorKey('viewMode'), 'Mod-]')
    assert.equal(shortcutLabel('search', true), '⌘ ⇧ F')
    assert.deepEqual(shortcutKeys('search', false), ['Ctrl', 'Shift', 'F'])
  })
})
