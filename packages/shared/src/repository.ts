/**
 * 内容仓库接口 —— 平台适配层。
 *
 * Web 端用 File System Access API 操作用户授权的真实目录（见 web/src/core/fs）；
 * 桌面端（Tauri）未来用原生文件系统实现同一接口，UI 与业务逻辑只依赖这里。
 *
 * 路径约定：一律使用相对根目录的 '/' 分隔路径，根目录本身为 ''。
 */

/** 树节点种类：目录 / Markdown 文档 / 图片 / 其他文件 */
export type RepoNodeKind = 'dir' | 'markdown' | 'image' | 'other'

export interface RepoNode {
  kind: RepoNodeKind
  name: string
  /** 相对根目录路径，'/' 分隔；根为 '' */
  path: string
  /** 文件最后修改时间（目录无此字段） */
  updatedAt?: number
  /** 文件字节数（目录无此字段） */
  size?: number
}

export interface ContentRepository {
  /** 根目录显示名（如用户选择的文件夹名） */
  readonly rootName: string

  /** 扫描整棵目录树（跳过隐藏文件），返回扁平节点列表 */
  list(): Promise<RepoNode[]>

  readTextFile(path: string): Promise<string>
  writeTextFile(path: string, content: string): Promise<void>

  /** 在目录下新建文本文件；重名自动加序号，返回最终路径 */
  createTextFile(
    dirPath: string,
    desiredName: string,
    content?: string,
  ): Promise<string>

  /** 新建子目录；重名自动加序号，返回最终路径 */
  createDirectory(dirPath: string, desiredName: string): Promise<string>

  /** 重命名（保留 Markdown 扩展名）；目标已存在时抛错。返回新路径 */
  renameNode(path: string, newName: string): Promise<string>

  removeNode(path: string): Promise<void>

  /** 保存图片文件（重名自动加序号），返回最终路径 */
  createImageFile(
    dirPath: string,
    desiredName: string,
    blob: Blob,
  ): Promise<string>

  /** 读图片为 data URL —— 复制富文本 / 导出时内嵌 HTML 用 */
  readImageAsDataUrl(path: string): Promise<string>

  /** 取可直接用于 <img src> 的 URL（Web 为 blob:，桌面端可为 asset 协议） */
  imageUrl(path: string): Promise<string>
}
