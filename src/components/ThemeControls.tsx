import { useState } from 'react';
import { Palette, X } from 'lucide-react';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DENSITIES, darkThemes, getTheme, lightThemes, type Theme } from '../theme';

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

  const renderTheme = (theme: Theme) => {
    const active = theme.id === themeId;
    return (
      <button
        key={theme.id}
        type="button"
        role="radio"
        aria-checked={active}
        className={`theme-card ${active ? 'active' : ''}`}
        title={`${theme.name} — ${theme.description}`}
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
    );
  };

  return (
    <div className="preference-controls">
      <Drawer open={themeOpen} onOpenChange={setThemeOpen} direction="right">
        <DrawerTrigger asChild>
          <Button variant="outline" size="sm" title="选择排版主题">
            <Palette data-icon="inline-start" />
            {activeTheme.name}
          </Button>
        </DrawerTrigger>
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

      <div className="density-control">
        <ToggleGroup
          type="single"
          value={densityId}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="排版密度"
          onValueChange={(value) => value && onDensityChange(value)}
        >
          {DENSITIES.map((density) => (
            <ToggleGroupItem
              key={density.id}
              value={density.id}
              aria-label={`${density.name}密度`}
              className="data-[state=on]:relative data-[state=on]:z-1 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:font-semibold data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary/90"
            >
              {density.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </div>
  );
}
