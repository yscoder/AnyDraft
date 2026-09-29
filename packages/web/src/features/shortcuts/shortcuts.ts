export const shortcuts = {
  newDocument: { label: '新建文档', group: '文件', key: 'n', mod: true },
  openDirectory: { label: '切换目录', group: '文件', key: 'o', mod: true },
  refresh: { label: '刷新目录', group: '文件', key: 'r', ctrl: true },
  bold: { label: '加粗', group: '编辑', key: 'b', mod: true },
  italic: { label: '斜体', group: '编辑', key: 'i', mod: true },
  sidebar: { label: '切换侧栏', group: '通用', key: 'b', mod: true },
  search: {
    label: '搜索工作区',
    group: '通用',
    key: 'f',
    mod: true,
    shift: true,
  },
  help: { label: '快捷键帮助', group: '通用', key: '/', mod: true },
  viewMode: {
    label: '对照 / 预览',
    group: '通用',
    key: ']',
    mod: true,
  },
} as const

export type ShortcutId = keyof typeof shortcuts

export function isShortcutAvailable(
  id: ShortcutId,
  runtime: 'web' | 'tauri' = import.meta.env.VITE_APP_RUNTIME,
): boolean {
  return shortcuts[id].group !== '文件' || runtime === 'tauri'
}

export const isMacPlatform = () =>
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function matchesShortcut(
  event: Pick<
    KeyboardEvent,
    'key' | 'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey'
  >,
  id: ShortcutId,
  mac = isMacPlatform(),
): boolean {
  const shortcut = shortcuts[id]
  const mod = 'mod' in shortcut && shortcut.mod
  const ctrl = 'ctrl' in shortcut && shortcut.ctrl
  const shift = 'shift' in shortcut && shortcut.shift
  return (
    (shortcut.key === '/'
      ? event.code === 'Slash'
      : event.key.toLowerCase() === shortcut.key) &&
    event.metaKey === Boolean(mod && mac) &&
    event.ctrlKey === Boolean(ctrl || (mod && !mac)) &&
    event.shiftKey === Boolean(shift) &&
    !event.altKey
  )
}

export function shortcutKeys(id: ShortcutId, mac = isMacPlatform()): string[] {
  const shortcut = shortcuts[id]
  const keys: string[] = []
  if ('mod' in shortcut && shortcut.mod) keys.push(mac ? '⌘' : 'Ctrl')
  if ('ctrl' in shortcut && shortcut.ctrl) keys.push('Ctrl')
  if ('shift' in shortcut && shortcut.shift) keys.push(mac ? '⇧' : 'Shift')
  keys.push(shortcut.key === '/' ? '/' : shortcut.key.toUpperCase())
  return keys
}

export function shortcutLabel(id: ShortcutId, mac = isMacPlatform()): string {
  const keys = shortcutKeys(id, mac)
  return mac ? keys.join(' ') : keys.join('+')
}

export function codeMirrorKey(
  id: 'bold' | 'italic' | 'help' | 'viewMode',
): string {
  return `Mod-${shortcuts[id].key}`
}
