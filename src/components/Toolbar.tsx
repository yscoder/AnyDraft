import { useRef } from 'react';
import {
  Archive,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  ImageIcon,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import ThemeControls from './ThemeControls';

interface Props {
  viewMode: 'split' | 'preview';
  onViewMode: (m: 'split' | 'preview') => void;
  status: string | null;
  onCopy: () => void;
  /** 导入 .md / .zip 备份 */
  onImport: (files: File[]) => void;
  /** 导出当前草稿为 .md */
  onExportMarkdown: () => void;
  /** 导出全部草稿 + 图片为 zip 备份 */
  onExportBackup: () => void;
  /** 导出正文长图 PNG */
  onExportImage: () => void;
  /** 导出进行中：禁用菜单，避免重复触发 */
  exporting: boolean;
  themeId: string;
  onThemeChange: (id: string) => void;
  densityId: string;
  onDensityChange: (id: string) => void;
}

export default function Toolbar({
  viewMode,
  onViewMode,
  status,
  onCopy,
  onImport,
  onExportMarkdown,
  onExportBackup,
  onExportImage,
  exporting,
  themeId,
  onThemeChange,
  densityId,
  onDensityChange,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <header className="toolbar">
      <div className="brand">
        {/* 印章式字标：平涂描边，不用发光徽标 */}
        <span className="brand-mark" aria-hidden="true">火</span>
        <span className="title">火星编辑器</span>
      </div>

      {/* 对照 / 预览 */}
      <ToggleGroup
        type="single"
        value={viewMode}
        variant="outline"
        size="sm"
        spacing={0}
        aria-label="工作区模式"
        onValueChange={(value) => value && onViewMode(value as 'split' | 'preview')}
      >
        <ToggleGroupItem value="split" aria-label="对照模式">对照</ToggleGroupItem>
        <ToggleGroupItem value="preview" aria-label="预览模式">预览</ToggleGroupItem>
      </ToggleGroup>

      <div className="toolbar-right">
        <ThemeControls
          themeId={themeId}
          onThemeChange={onThemeChange}
          densityId={densityId}
          onDensityChange={onDensityChange}
        />

        {/* 导入：.md 各建一篇草稿，.zip 按备份包整体还原 */}
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".md,.markdown,.txt,.zip"
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onImport(files);
            e.target.value = ''; // 同一文件连选两次也要触发
          }}
        />
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} title="导入 Markdown 文件或备份包">
          <Upload data-icon="inline-start" />
          导入
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting}>
              <Download data-icon="inline-start" />
              {exporting ? '导出中…' : '导出'}
              <ChevronDown data-icon="inline-end" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem onSelect={onExportMarkdown}>
              <FileText />
              当前草稿 .md
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onExportImage}>
              <ImageIcon />
              正文长图 .png
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onExportBackup}>
              <Archive />
              全部备份 .zip
              <span className="ml-auto text-xs text-muted-foreground">草稿 + 图片</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button size="sm" onClick={onCopy}>
          <Clipboard data-icon="inline-start" />
          复制到公众号
        </Button>

        {status && <span className="status show">{status}</span>}
      </div>
    </header>
  );
}
