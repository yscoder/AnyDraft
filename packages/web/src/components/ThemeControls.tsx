import { AlignJustify, ChevronsUpDown, Moon, Palette, Sun } from 'lucide-react'
import { Switch } from 'radix-ui'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TooltipHint } from '@/components/ui/tooltip'
import { DENSITIES, getTheme, themes } from '@/core/theme/theme'

interface Props {
  themeId: string
  onThemeChange: (id: string) => void
  densityId: string
  onDensityChange: (id: string) => void
  darkPreview: boolean
  onDarkPreviewChange: (dark: boolean) => void
}

export default function ThemeControls({
  themeId,
  onThemeChange,
  densityId,
  onDensityChange,
  darkPreview,
  onDarkPreviewChange,
}: Props) {
  const activeTheme = getTheme(themeId)
  const activeDensity =
    DENSITIES.find((density) => density.id === densityId) ?? DENSITIES[1]

  return (
    <div className="flex items-center gap-0.5 shrink-0 ml-auto pl-2 border-l border-border">
      <TooltipHint content={darkPreview ? '切换为浅色预览' : '切换为深色预览'}>
        <Switch.Root
          className="inline-flex h-[26px] w-10 shrink-0 items-center rounded-full border border-border p-0.5 outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:bg-primary/15"
          aria-label="深色模式预览"
          checked={darkPreview}
          onCheckedChange={onDarkPreviewChange}
        >
          <Switch.Thumb className="pointer-events-none flex size-5 items-center justify-center rounded-full bg-background text-foreground shadow-md transition-[transform,background-color,color] duration-200 data-[state=checked]:translate-x-[14px] data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground motion-reduce:transition-none [&_svg]:size-[13px]">
            {darkPreview ? (
              <Moon aria-hidden="true" />
            ) : (
              <Sun aria-hidden="true" />
            )}
          </Switch.Thumb>
        </Switch.Root>
      </TooltipHint>
      <DropdownMenu>
        <TooltipHint content={`排版主题：${activeTheme.name}`}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              aria-label={`排版主题：${activeTheme.name}`}
              className="h-[26px] px-2 rounded-md text-muted-foreground text-[11px] font-medium aria-expanded:text-foreground [&_svg]:size-[13px] [&_svg]:opacity-[0.72]"
            >
              <Palette />
              {activeTheme.name}
              <ChevronsUpDown />
            </Button>
          </DropdownMenuTrigger>
        </TooltipHint>
        <DropdownMenuContent align="end" side="top" className="min-w-36">
          <DropdownMenuRadioGroup
            value={activeTheme.id}
            onValueChange={onThemeChange}
            aria-label="排版主题"
          >
            {themes.map((theme) => (
              <DropdownMenuRadioItem key={theme.id} value={theme.id}>
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: theme.accent }}
                  aria-hidden="true"
                />
                {theme.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <TooltipHint content={`排版密度：${activeDensity.name}`}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className="h-[26px] px-2 rounded-md text-muted-foreground text-[11px] font-medium aria-expanded:text-foreground [&_svg]:size-[13px] [&_svg]:opacity-[0.72] density-trigger"
            >
              <AlignJustify data-icon="inline-start" />
              {activeDensity.name}
              <ChevronsUpDown data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipHint>
        <DropdownMenuContent align="end" side="top" className="min-w-32">
          <DropdownMenuRadioGroup
            value={densityId}
            onValueChange={onDensityChange}
          >
            {DENSITIES.map((density) => (
              <DropdownMenuRadioItem key={density.id} value={density.id}>
                {density.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
