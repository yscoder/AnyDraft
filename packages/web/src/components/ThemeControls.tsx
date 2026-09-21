import { useState } from 'react';
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
      <TooltipHint key={theme.id} content={`${theme.name} — ${theme.description}`} side="left">
        <button
          type="button"
          role="radio"
          aria-checked={active}
          className={`theme-card ${active ? 'active' : ''}`}
          onClick={() => {
            onThemeChange(theme.id);
            setThemeOpen(false);
          }}
        >
          <span className="swatch" style={{ background: theme.body.bg ?? '#ffffff' }}>
            <span
              className="swatch-aa"
              style={{ fontFamily: theme.heading.font, color: theme.heading.color }}
            >
              Aa
            </span>
            <span className="swatch-bar" style={{ background: theme.accent }} />
            <span className="swatch-line" style={{ background: theme.body.color }} />
            <span className="swatch-line short" style={{ background: theme.body.color }} />
          </span>
          <span className="theme-card-name">{theme.name}</span>
        </button>
      </TooltipHint>
    );
  };

  return (
    <div className="preference-controls statusbar-preferences">
      <Drawer open={themeOpen} onOpenChange={setThemeOpen} direction="right">
        <TooltipHint content={`排版主题：${activeTheme.name}`}>
          <DrawerTrigger asChild>
            <Button variant="ghost" size="xs" className="statusbar-control">
              <span className="theme-control-swatch" style={{ background: activeTheme.accent }} aria-hidden="true" />
              {activeTheme.name}
            </Button>
          </DrawerTrigger>
        </TooltipHint>
        <DrawerPortal>
          <DrawerOverlay className="theme-drawer-overlay" />
          <DrawerContent className="theme-drawer">
            <div className="theme-drawer-head">
              <div>
                <DrawerTitle className="theme-drawer-title">排版主题</DrawerTitle>
                <DrawerDescription className="theme-drawer-description">
                  选择文章在预览与导出时使用的样式
                </DrawerDescription>
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="icon-sm" aria-label="关闭主题面板">
                  <X />
                </Button>
              </DrawerClose>
            </div>

            <div className="theme-drawer-list" role="radiogroup" aria-label="排版主题">
              <section className="theme-drawer-section">
                <h2>浅色</h2>
                <div className="theme-grid">{lightThemes.map(renderTheme)}</div>
              </section>
              <section className="theme-drawer-section">
                <h2>深色</h2>
                <div className="theme-grid">{darkThemes.map(renderTheme)}</div>
              </section>
            </div>
          </DrawerContent>
        </DrawerPortal>
      </Drawer>

      <DropdownMenu>
        <TooltipHint content={`排版密度：${activeDensity.name}`}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xs" className="statusbar-control density-trigger">
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
