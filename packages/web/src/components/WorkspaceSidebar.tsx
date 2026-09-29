import type { ComponentProps } from 'react'
import { Brand } from '@/components/Brand'
import FileTree from '@/components/FileTree'
import SidebarLinks from '@/components/SidebarLinks'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'

interface Props extends Omit<ComponentProps<typeof FileTree>, 'onSearch'> {
  onSearch: () => void
  onHelp: () => void
}

export default function WorkspaceSidebar({
  onSearch,
  onHelp,
  ...fileTreeProps
}: Props) {
  return (
    <Sidebar className="app-sidebar border-r-0!" collapsible="offcanvas">
      <SidebarHeader className="min-h-[55px] justify-center px-3.5 py-3">
        <Brand />
      </SidebarHeader>
      <SidebarContent className="overflow-hidden">
        <FileTree onSearch={onSearch} {...fileTreeProps} />
      </SidebarContent>
      <SidebarLinks onHelp={onHelp} />
      <SidebarRail />
    </Sidebar>
  )
}
