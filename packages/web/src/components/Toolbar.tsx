import { useRef } from 'react'
import {
  Archive,
  ChevronDown,
  Clipboard,
  Download,
  FileText,
  ImageIcon,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { TooltipHint } from '@/components/ui/tooltip'
interface Props {
  onCopy: () => void
  /** 导入 .md / .zip 备份 */
  onImport: (files: File[]) => void
  /** 导出当前草稿为 .md */
  onExportMarkdown: () => void
  /** 导出全部草稿 + 图片为 zip 备份 */
  onExportBackup: () => void
  /** 导出正文长图 PNG */
  onExportImage: () => void
  /** 导出进行中：禁用菜单，避免重复触发 */
  exporting: boolean
}

export default function Toolbar({
  onCopy,
  onImport,
  onExportMarkdown,
  onExportBackup,
  onExportImage,
  exporting,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-2 justify-self-end min-w-0 max-[700px]:gap-1">
      {/* 导入：.md 各建一篇草稿，.zip 按备份包整体还原 */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".md,.markdown,.txt,.zip"
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) onImport(files)
          e.target.value = '' // 同一文件连选两次也要触发
        }}
      />
      <TooltipHint content="导入 Markdown 文件或备份包">
        <Button
          variant="outline"
          size="sm"
          aria-label="导入 Markdown 文件或备份包"
          onClick={() => fileRef.current?.click()}
        >
          <Upload data-icon="inline-start" />
          <span className="max-[700px]:hidden">导入</span>
        </Button>
      </TooltipHint>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting}
            aria-label={exporting ? '导出中' : '导出'}
          >
            <Download data-icon="inline-start" />
            <span className="max-[700px]:hidden">
              {exporting ? '导出中…' : '导出'}
            </span>
            <ChevronDown
              className="max-[700px]:hidden"
              data-icon="inline-end"
            />
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
            <span className="ml-auto text-xs text-muted-foreground">
              草稿 + 图片
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" onClick={onCopy} aria-label="复制到公众号">
        <Clipboard data-icon="inline-start" />
        <span className="max-[700px]:hidden">复制到公众号</span>
      </Button>
    </div>
  )
}
