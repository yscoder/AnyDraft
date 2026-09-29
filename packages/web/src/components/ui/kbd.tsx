import type { ComponentProps } from 'react'
import { cn } from 'cn'

export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-flex min-w-5 items-center justify-center rounded border border-border bg-muted px-1 py-0 font-sans text-xs text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}
