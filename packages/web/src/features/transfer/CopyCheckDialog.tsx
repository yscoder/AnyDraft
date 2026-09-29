import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from '@/components/ui/item'
import type { CopyWarning } from './checkBeforeCopy'

interface Props {
  warnings: CopyWarning[]
  onClose: () => void
  onContinue: () => void
}

export default function CopyCheckDialog({
  warnings,
  onClose,
  onContinue,
}: Props) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-h-[80dvh] max-w-[calc(100%-2rem)] sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>规格检查</AlertDialogTitle>
          <AlertDialogDescription>
            发现以下问题。你可以返回修改，也可以继续复制。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ItemGroup
          className="min-h-0 gap-2 overflow-y-auto"
          aria-label="检查提示"
        >
          {warnings.map((warning, index) => (
            <Item
              key={`${warning.category}-${warning.message}-${index}`}
              variant="outline"
              size="sm"
              role="listitem"
            >
              <ItemContent>
                <ItemTitle>{warning.category}</ItemTitle>
                <ItemDescription className="line-clamp-none break-all">
                  {warning.message}
                </ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>返回修改</AlertDialogCancel>
          <AlertDialogAction onClick={onContinue}>仍要复制</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
