import { useState } from 'react';
import { cn } from 'cn';
import { AlignJustify, ChevronsUpDown, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TooltipHint } from '@/components/ui/tooltip';
import { DENSITIES, darkThemes, getTheme, lightThemes, type Theme } from '@/core/theme/theme';

interface Props {
  themeId: string;
  onThemeChange: (id: string) => void;
  densityId: string;
  onDensityChange: (id: string) => void;
}

export default function ThemeControls({
  themeId,
  onThemeChange,
  densityId,
  onDensityChange,
}: Props) {
  const [themeOpen, setThemeOpen] = useState(false);
  const activeTheme = getTheme(themeId);
  const activeDensity = DENSITIES.find((density) => density.id === densityId) ?? DENSITIES[1];

  const renderTheme = (theme: Theme) => {
    const active = theme.id === themeId;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={active}
        className={cn(
          'shrink-0 flex flex-col p-0 border border-border rounded-xl bg-[var(--panel-solid)] cursor-pointer overflow-hidden text-left transition-[transform,border-color,box-shadow] duration-[180ms] ease-[var(--ease)] hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[0_4px_14px_rgba(52,40,28,0.1)]',
          active && 'border-foreground shadow-[0_0_0_1px_var(--foreground),var(--shadow-sm)]',
        )}
        onClick={() => {
          onThemeChange(theme.id);
          setThemeOpen(false);
        }}
      >
        <span className="flex flex-col gap-[3px] pt-[13px] px-3.5 pb-3.5 border-b border-border" style={{ background: theme.body.bg ?? '#ffffff' }}>
          <span
            className="text-[18px] font-bold leading-none tracking-[0.3px]"
            style={{ fontFamily: theme.heading.font, color: theme.heading.color }}
          >
            Aa
          </span>
          <span className="w-7 h-[3px] rounded-[2px] mt-px mb-0.5" style={{ background: theme.accent }} />
          <span className="h-[2px] rounded-[2px] opacity-[0.26]" style={{ background: theme.body.color }} />
          <span className="h-[2px] rounded-[2px] opacity-[0.26] w-[62%]" style={{ background: theme.body.color }} />
        </span>
        <span className={cn(
          'pt-2 pr-2.5 pb-[9px] pl-2.5 text-xs leading-[1.2] text-muted-foreground transition-colors duration-[180ms] ease-[var(--ease)]',
          active && 'text-foreground font-semibold',
        )}>{theme.name}</span>
      </button>
    );
  };

  return (
    <div className="flex items-center gap-0.5 shrink-0 ml-auto pl-2 border-l border-border">
      <Drawer open={themeOpen} onOpenChange={setThemeOpen} direction="right">
        <TooltipHint content={`排版主题：${activeTheme.name}`}>
          <DrawerTrigger asChild>
            <Button variant="ghost" size="xs" className="h-[26px] px-2 rounded-md text-muted-foreground text-[11px] font-medium hover:text-foreground aria-expanded:text-foreground [&_svg]:size-[13px] [&_svg]:opacity-[0.72]">
              <span className="size-[9px] shrink-0 border border-[color-mix(in_oklch,var(--foreground)_16%,transparent)] rounded-full shadow-[inset_0_0_0_1px_rgb(255_255_255/0.35)]" style={{ background: activeTheme.accent }} aria-hidden="true" />
              {activeTheme.name}
            </Button>
          </DrawerTrigger>
        </TooltipHint>
        <DrawerPortal>
          <DrawerOverlay className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[2px]" />
          <DrawerContent className="fixed top-0 right-0 bottom-0 left-auto z-[61] w-[min(380px,100vw)] flex flex-col bg-background border-l border-border shadow-[-20px_0_60px_rgb(0_0_0/0.12)] outline-none">
            <div className="flex items-start justify-between gap-4 p-5 border-b border-border">
              <div>
                <DrawerTitle className="m-0 text-base font-[650] leading-[1.3]">排版主题</DrawerTitle>
                <DrawerDescription className="mt-[5px] mb-0 text-xs leading-[1.5] text-muted-foreground">
                  选择文章在预览与导出时使用的样式
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon-sm" aria-label="关闭主题面板">
                  <X />
                </Button>
              </DrawerClose>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-5 [&>section+section]:mt-6" role="radiogroup" aria-label="排版主题">
              <section>
                <h2 className="m-0 mb-2.5 text-xs font-semibold text-muted-foreground">浅色</h2>
                <div className="grid grid-cols-2 gap-2.5">{lightThemes.map(renderTheme)}</div>
              </section>
              <section>
                <h2 className="m-0 mb-2.5 text-xs font-semibold text-muted-foreground">深色</h2>
                <div className="grid grid-cols-2 gap-2.5">{darkThemes.map(renderTheme)}</div>
              </section>
            </div>
          </DrawerContent>
        </DrawerPortal>
      </Drawer>

      <DropdownMenu>
        <TooltipHint content={`排版密度：${activeDensity.name}`}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs" className="h-[26px] px-2 rounded-md text-muted-foreground text-[11px] font-medium hover:text-foreground aria-expanded:text-foreground [&_svg]:size-[13px] [&_svg]:opacity-[0.72] density-trigger">
              <AlignJustify data-icon="inline-start" />
              {activeDensity.name}
              <ChevronsUpDown data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipHint>
        <DropdownMenuContent align="end" side="top" className="min-w-32">
          <DropdownMenuRadioGroup value={densityId} onValueChange={onDensityChange}>
            {DENSITIES.map((density) => (
              <DropdownMenuRadioItem key={density.id} value={density.id}>
                {density.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
