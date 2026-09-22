import { cn } from 'cn'

interface BrandProps {
  /** 附加到容器的额外类名（覆盖布局/间距等） */
  className?: string
  /** 图标边长，默认 24px */
  iconSize?: number
}

/** 品牌标识：图标 + 标题，供侧边栏、欢迎页等多处复用 */
export function Brand({ className, iconSize }: BrandProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <img
        className={cn(
          'rounded-sm object-contain block size-6',
          iconSize ? `size-[${iconSize}]px` : '',
        )}
        src="./icon.svg"
        alt="稿域"
        aria-hidden="true"
      />
      <span className="text-base font-bold">稿域</span>
    </div>
  )
}
