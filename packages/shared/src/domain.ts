/**
 * 领域类型（跨运行时共用：Web 应用 / 未来的 Tauri 桌面端）。
 * 后续 ContentRepository 接口、ImageMeta、EditorSnapshot 与错误码也会落在本包
 * （见 docs/TAURI_DESKTOP_MIGRATION_PLAN.md 第 11 节）。
 */

/** 一篇草稿。id 只在本机内唯一：导入时重新生成，避免与现有草稿互撞覆盖 */
export interface Draft {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
}
