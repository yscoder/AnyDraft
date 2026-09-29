import { useEffect } from 'react'
import { useSidebar } from '@/components/ui/sidebar'
import { isShortcutAvailable, matchesShortcut } from './shortcuts'

interface Props {
  blocked: boolean
  helpOpen: boolean
  onNewDocument: () => void
  onOpenDirectory: () => void
  onRefresh: () => void
  onSearch: () => void
  onHelp: () => void
  onViewMode: () => void
}

export default function WorkspaceShortcuts({
  blocked,
  helpOpen,
  onNewDocument,
  onOpenDirectory,
  onRefresh,
  onSearch,
  onHelp,
  onViewMode,
}: Props) {
  const { toggleSidebar } = useSidebar()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return
      if (matchesShortcut(event, 'help')) {
        if (blocked && !helpOpen) return
        event.preventDefault()
        onHelp()
        return
      }
      if (blocked || helpOpen) return
      const target = event.target
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, [role="menu"], [role="dialog"]',
        )
      )
        return

      const actions = [
        ['newDocument', onNewDocument],
        ['openDirectory', onOpenDirectory],
        ['refresh', onRefresh],
        ['search', onSearch],
        ['viewMode', onViewMode],
        ['sidebar', toggleSidebar],
      ] as const
      for (const [id, action] of actions) {
        if (!isShortcutAvailable(id) || !matchesShortcut(event, id)) continue
        event.preventDefault()
        action()
        return
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    blocked,
    helpOpen,
    onNewDocument,
    onOpenDirectory,
    onRefresh,
    onSearch,
    onHelp,
    onViewMode,
    toggleSidebar,
  ])

  return null
}
