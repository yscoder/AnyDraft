import type { ContentRepository } from './repository'

export type AppRuntimeKind = 'web' | 'tauri'

export type RepositoryStartup =
  | { status: 'ready'; repository: ContentRepository }
  | { status: 'unsupported' }
  | { status: 'need-pick' }
  | { status: 'need-permission'; rootName: string }

/**
 * 应用运行时边界。
 *
 * React 只处理统一的仓库状态，不直接接触浏览器目录句柄或 Tauri IPC。
 */
export interface AppRuntime {
  readonly kind: AppRuntimeKind

  initializeRepository(): Promise<RepositoryStartup>
  canPickRepository(): boolean
  pickRepository(): Promise<ContentRepository | null>
  grantRepositoryPermission(): Promise<ContentRepository | null>

  /** 仅 Web 在目录选择器不可用或用户主动选择时提供 OPFS。 */
  canUseInternalStorage(): boolean
  openInternalStorage(): Promise<ContentRepository>

  /** 由各平台选择保存位置；用户取消时返回 false。 */
  exportFile(suggestedName: string, blob: Blob): Promise<boolean>
}
