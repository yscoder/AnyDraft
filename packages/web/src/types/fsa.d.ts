/**
 * File System Access API 中 TypeScript lib.dom 未覆盖的部分。
 * 只补充 Window 上的选目录入口；句柄上的权限查询 / move 方法
 * 以交叉类型的方式在 core/fs/fsa.ts 内局部声明，避免污染全局。
 */

declare global {
  interface Window {
    /** File System Access API 的目录选择器（标准名，见 MDN） */
    showDirectoryPicker?: (options?: {
      id?: string;
      mode?: 'read' | 'readwrite';
      startIn?: string;
    }) => Promise<FileSystemDirectoryHandle>;
  }
}

export {};
