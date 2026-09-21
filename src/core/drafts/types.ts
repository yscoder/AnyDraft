/** 一篇草稿。id 只在本机内唯一：导入时重新生成，避免与现有草稿互撞覆盖 */
export interface Draft {
  id: string;
  name: string;
  content: string;
  updatedAt: number;
}
