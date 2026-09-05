// 导入应用状态类型
import type { AppStore } from '@/types';
import { newId } from '@/store/storeUtils';

// localStorage 存储键名常量
const DRAFT_KEY = 'notes-autosave-draft';
const DRAFT_META_KEY = 'notes-autosave-meta';
// 最大保留的草稿数量
const MAX_DRAFTS = 5;

/**
 * 草稿元数据接口
 */
interface DraftMeta {
  id: string;           // 草稿唯一标识
  timestamp: string;    // 保存时间戳
  docTitle: string;     // 当前活动文档标题
}

/**
 * 草稿条目接口
 */
interface DraftEntry {
  meta: DraftMeta;  // 草稿元数据
  data: AppStore;   // 应用状态数据
}

/**
 * 保存草稿到 localStorage
 * @param data 应用状态数据
 * @param activeDocTitle 当前活动文档标题
 */
export function saveDraft(data: AppStore, activeDocTitle?: string): void {
  try {
    // 创建草稿元数据
    const meta: DraftMeta = {
      id: newId(),
      timestamp: new Date().toISOString(),
      docTitle: activeDocTitle || '',
    };

    // 保存当前草稿
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ meta, data }));

    // 轮换旧草稿，保留最近的 MAX_DRAFTS 个
    const history = getDraftHistory();
    history.push(meta);
    if (history.length > MAX_DRAFTS) {
      history.splice(0, history.length - MAX_DRAFTS);
    }
    localStorage.setItem(DRAFT_META_KEY, JSON.stringify(history));
  } catch (e) {
    console.error('Failed to save draft to localStorage:', e);
  }
}

/**
 * 加载最新的草稿
 * @returns 草稿条目，如果没有则返回 null
 */
export function loadLatestDraft(): DraftEntry | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftEntry;
  } catch (e) {
    console.error('Failed to load draft from localStorage:', e);
    return null;
  }
}

/**
 * 获取草稿历史记录
 * @returns 草稿元数据列表
 */
export function getDraftHistory(): DraftMeta[] {
  try {
    const raw = localStorage.getItem(DRAFT_META_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DraftMeta[];
  } catch {
    return [];
  }
}

/**
 * 清除所有草稿
 */
export function clearDrafts(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_META_KEY);
  } catch {
    // 静默失败
  }
}