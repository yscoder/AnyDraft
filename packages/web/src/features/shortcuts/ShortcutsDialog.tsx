import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { isShortcutAvailable, shortcutKeys, shortcuts } from './shortcuts'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const groups = ['文件', '编辑', '通用'] as const

export default function ShortcutsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[min(80dvh,38rem)] gap-4 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>快捷键</DialogTitle>
          <DialogDescription>
            在编辑器中按加粗键时，优先加粗文字。
          </DialogDescription>
        </DialogHeader>
        {groups
          .filter((group) =>
            Object.entries(shortcuts).some(
              ([id, shortcut]) =>
                shortcut.group === group &&
                isShortcutAvailable(id as keyof typeof shortcuts),
            ),
          )
          .map((group) => (
            <section key={group} aria-label={group}>
              <h3 className="mb-1 text-xs font-semibold text-muted-foreground">
                {group}
              </h3>
              <div className="divide-y divide-border">
                {Object.entries(shortcuts)
                  .filter(
                    ([id, shortcut]) =>
                      shortcut.group === group &&
                      isShortcutAvailable(id as keyof typeof shortcuts),
                  )
                  .map(([id, shortcut]) => (
                    <div
                      key={id}
                      className="flex min-h-10 items-center justify-between gap-3 py-2 text-sm"
                    >
                      <span>{shortcut.label}</span>
                      <span className="flex shrink-0 items-center gap-1">
                        {shortcutKeys(id as keyof typeof shortcuts).map(
                          (key, index) => (
                            <Kbd key={`${key}-${index}`}>{key}</Kbd>
                          ),
                        )}
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          ))}
      </DialogContent>
    </Dialog>
  )
}
