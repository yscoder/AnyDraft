/**
 * 草稿的本地持久化。
 *
 * 正文存 localStorage（量小、且需要同步读写），图片走 IndexedDB（见 core/image）。
 * 换设备 / 清缓存就没了，所以对外还有 core/transfer 的导入导出兜底。
 */

import { SAMPLE_MARKDOWN } from '@/core/markdown/sample';
import { readStored, writeStored } from '@/core/storage';
import type { Draft } from '@/core/drafts/types';

const DRAFTS = 'drafts';
const ACTIVE_DRAFT = 'active-draft';

/** 读草稿列表；损坏或为空都返回空数组，由上层决定要不要建第一篇 */
function loadDrafts(): Draft[] {
  try {
    const raw = readStored(DRAFTS);
    if (raw) {
      const parsed = JSON.parse(raw) as Draft[];
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
  } catch {
    // 损坏则重建
  }
  return [];
}

/** 首次使用：用示例内容建第一篇草稿 */
function seedInitial(): Draft[] {
  const initial: Draft = {
    id: `draft-${Date.now()}`,
    name: '未命名草稿',
    content: SAMPLE_MARKDOWN,
    updatedAt: Date.now(),
  };
  const drafts = [initial];
  try {
    writeStored(DRAFTS, JSON.stringify(drafts));
    writeStored(ACTIVE_DRAFT, initial.id);
  } catch {
    // 存储失败不影响内存使用
  }
  return drafts;
}

/** 启动初始化：草稿列表（首次使用则建一篇）与选中项一次算完，localStorage 只解析一次 */
export function initDraftState(): { drafts: Draft[]; activeId: string } {
  const existing = loadDrafts();
  const list = existing.length ? existing : seedInitial();
  const saved = readStored(ACTIVE_DRAFT);
  const activeId = saved && list.some((d) => d.id === saved) ? saved : list[0]?.id ?? '';
  return { drafts: list, activeId };
}

/** 保存草稿列表，返回是否成功（超出配额时返回 false） */
export function saveDrafts(drafts: Draft[]): boolean {
  try {
    writeStored(DRAFTS, JSON.stringify(drafts));
    return true;
  } catch {
    return false;
  }
}

/** 记住当前草稿，下次打开直接回到它 */
export function rememberActiveDraft(id: string): void {
  writeStored(ACTIVE_DRAFT, id);
}
