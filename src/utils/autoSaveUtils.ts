// 导入应用状态类型
import type { AppStore, NoteDoc } from '@/types';
import { newId } from '@/store/storeUtils';

// localStorage 存储键名常量
const DRAFT_KEY = 'notes-autosave-draft';
// 旧版本写入的草稿索引键，功能已移除，仅用于清理遗留数据
const LEGACY_DRAFT_META_KEY = 'notes-autosave-meta';

/**
 * 草稿体积上限。
 *
 * localStorage 在各浏览器/Electron 下的配额通常只有 5–10MB，且**超出时抛异常而不是截断**。
 * 旧实现每次把整个库（含每篇最多 50 份全量版本快照）序列化后写入：
 * 200 篇 20KB 文档 × 50 份快照 ≈ 195MB，远超配额 —— 于是每次写入都抛错、被 catch 吞掉，
 * 草稿从功能上完全失效，而 800ms 一次的 stringify 仍在白白消耗主线程。
 *
 * 这里改为：只保留"最可能丢、也最值得救"的内容（活动文档正文 + 结构信息），
 * 并且超过上限时继续裁掉版本快照，保证草稿一定写得进去。
 */
const MAX_DRAFT_BYTES = 2 * 1024 * 1024; // 2MB，留足余量给 meta 与其它 localStorage 使用

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
 * 生成"适合落进 localStorage"的精简快照：去掉版本快照与评论这类可以从备份恢复的大字段，
 * 但保留正文、标题、层级、标签 —— 崩溃恢复真正要救的就是这些。
 */
function slimForDraft(data: AppStore): AppStore {
  return {
    ...data,
    notebooks: data.notebooks.map((notebook) => ({
      ...notebook,
      docs: notebook.docs.map((doc) => {
        // versions 是最大的膨胀源（每份都是完整正文拷贝），草稿里一律不带
        const { versions: _versions, comments: _comments, ...rest } = doc as NoteDoc & {
          versions?: unknown;
          comments?: unknown;
        };
        return rest as NoteDoc;
      }),
    })),
  };
}

/**
 * 最后兜底：整个库实在太大时，只保留活动文档所在的知识库里的**当前文档正文**。
 * 宁可只救回正在写的那一篇，也不要因为超限而一份都不写 ——
 * "草稿写不进去"正是修复前那个缺陷的真实形态。
 */
function minimalForDraft(data: AppStore, activeDocId?: string): AppStore {
  const docId = activeDocId || data.activeDocId;
  for (const notebook of data.notebooks) {
    const doc = docId ? notebook.docs.find((d) => d.id === docId) : undefined;
    if (doc) {
      const { versions: _versions, comments: _comments, ...rest } = doc as NoteDoc & {
        versions?: unknown;
        comments?: unknown;
      };
      return {
        ...data,
        notebooks: [{ ...notebook, docs: [rest as NoteDoc] }],
        trash: [],
        searchHistory: [],
      };
    }
  }
  // 没有活动文档：只留结构（知识库与标题），保住"有哪些文档"这层信息
  return {
    ...data,
    notebooks: data.notebooks.map((notebook) => ({
      ...notebook,
      docs: notebook.docs.map((doc) => ({
        ...doc,
        content: '',
        versions: [],
        comments: [],
      })),
    })),
    trash: [],
    searchHistory: [],
  };
}

/**
 * 保存草稿到 localStorage（只保留最新一份，供崩溃恢复使用）
 * @param data 应用状态数据
 * @param activeDocTitle 当前活动文档标题
 */
export function saveDraft(data: AppStore, activeDocTitle?: string): void {
  try {
    const meta: DraftMeta = {
      id: newId(),
      timestamp: new Date().toISOString(),
      docTitle: activeDocTitle || '',
    };

    const slim = slimForDraft(data);
    let json = JSON.stringify({ meta, data: slim });

    // 仍然超限：先去掉回收站与搜索历史（它们本身已在磁盘数据里，恢复价值最低）
    if (json.length > MAX_DRAFT_BYTES) {
      json = JSON.stringify({
        meta,
        data: { ...slim, trash: [], searchHistory: [] },
      });
    }

    // 还是超限：退化为"只救当前文档"
    if (json.length > MAX_DRAFT_BYTES) {
      json = JSON.stringify({ meta, data: minimalForDraft(slim) });
    }

    // 极端情况（单篇正文就超过上限）：仍然写，但截断正文尾部并标注 ——
    // 保留开头总比彻底没有草稿强，用户至少能看到自己写了什么。
    if (json.length > MAX_DRAFT_BYTES) {
      const minimal = minimalForDraft(slim);
      const doc = minimal.notebooks[0]?.docs[0];
      if (doc && typeof doc.content === 'string') {
        const overBy = json.length - MAX_DRAFT_BYTES;
        const keep = Math.max(0, doc.content.length - overBy - 1024);
        doc.content = doc.content.slice(0, keep) + '\n\n…（草稿体积超限，后半部分未保存）';
        json = JSON.stringify({ meta, data: minimal });
      }
    }

    if (json.length > MAX_DRAFT_BYTES) {
      console.warn(
        `[draft] 草稿体积 ${(json.length / 1024 / 1024).toFixed(1)}MB 仍超过上限，已跳过本次草稿写入`,
      );
      return;
    }

    localStorage.setItem(DRAFT_KEY, json);
  } catch (e) {
    // 配额满 / 隐私模式：草稿是尽力而为的兜底，失败不应影响正常保存链路
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
 * 清除所有草稿
 */
export function clearDrafts(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(LEGACY_DRAFT_META_KEY);
  } catch {
    // 静默失败
  }
}
