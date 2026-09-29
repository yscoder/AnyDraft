import { useEffect, useRef } from 'react'
import { CalendarClock, ChevronDown, CircleDot, UserRound } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type {
  ArticleField,
  ArticleSource,
  ArticleStatus,
} from '@/core/markdown/frontmatter'

const STATUS_OPTIONS: { value: ArticleStatus; label: string }[] = [
  { value: 'draft', label: '草稿' },
  { value: 'ready', label: '待发布' },
  { value: 'published', label: '已发布' },
]

interface Props {
  article: ArticleSource
  readOnly: boolean
  focusTitleNonce?: number
  onChange: (field: ArticleField, value: string) => void
}

function createdLabel(value: string): string {
  if (!value) return '未记录'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
}

export default function ArticleHeader({
  article,
  readOnly,
  focusTitleNonce,
  onChange,
}: Props) {
  const titleRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusTitleNonce) titleRef.current?.focus()
  }, [focusTitleNonce])

  return (
    <div className="shrink-0 px-6 pt-4 md:px-8">
      <Input
        ref={titleRef}
        aria-label="文章标题"
        placeholder="无标题文档"
        value={article.title}
        readOnly={readOnly}
        onChange={(event) => onChange('title', event.target.value)}
        className="h-auto rounded-none border-0 bg-transparent px-0 py-0 text-2xl font-semibold leading-tight text-foreground shadow-none placeholder:text-muted-foreground/70 focus-visible:border-0 focus-visible:ring-0 md:text-[28px]"
      />
      <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-muted-foreground">
        <div className="flex min-w-28 items-center gap-1.5">
          <UserRound className="size-3.5 shrink-0" aria-hidden="true" />
          <Input
            aria-label="作者"
            placeholder="添加作者"
            value={article.author}
            readOnly={readOnly}
            onChange={(event) => onChange('author', event.target.value)}
            className="h-auto w-28 rounded-none border-0 bg-transparent px-0 py-0 text-xs text-muted-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0"
          />
        </div>
        <span className="text-border" aria-hidden="true">
          |
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={readOnly}>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-auto gap-1.5 px-0 py-0 text-xs font-normal text-muted-foreground hover:bg-transparent hover:text-foreground"
              aria-label="文章状态"
            >
              <CircleDot className="size-3.5" aria-hidden="true" />
              {STATUS_OPTIONS.find((option) => option.value === article.status)
                ?.label ?? '草稿'}
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {STATUS_OPTIONS.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onSelect={() => onChange('status', option.value)}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="text-border" aria-hidden="true">
          |
        </span>
        <span
          className="inline-flex items-center gap-1.5"
          title={article.createdAt || undefined}
        >
          <CalendarClock className="size-3.5" aria-hidden="true" />
          {createdLabel(article.createdAt)}
        </span>
      </div>
      {article.error && (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {article.error}。请在下方源码中修正后继续编辑文章信息。
        </p>
      )}
    </div>
  )
}
