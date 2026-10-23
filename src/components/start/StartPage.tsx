// 导入 React 相关 hooks 和类型定义
import { useState, useMemo } from "react";
import type { JSX, ReactNode } from "react";
import {
  IconDocument,
  IconBook,
  IconTemplate,
  IconSparkle,
} from "@/components/common/Icon";
import { useNotesStore } from "@/store";
import { formatDateTime } from "@/utils/formatters";
import { getUpdatedTime } from "@/utils/docSort";
import { applyTemplateVars } from "@/utils/templateVars";
import type { NoteDoc, Notebook } from "@/types";
import type { Template } from "@/types/templates";
import TemplateCenter from "@/components/templates/TemplateCenter";
import AiWriter from "@/components/ai/AiWriter";

/**
 * 开始页组件属性接口
 */
interface StartPageProps {
  recentViews: { docId: string; notebookId: string; viewedAt: string }[]; // 最近浏览记录
  onViewDoc: (notebookId: string, docId: string) => void;   // 查看文档回调
  onCreateDoc: (notebookId: string, parentId: string | null, docData?: Partial<NoteDoc>) => void; // 新建文档回调
  onCreateNotebook: (title: string) => void;                // 新建知识库回调
}

// 文档过滤类型
type FilterType = "edited" | "viewed" | "liked" | "commented" | "shared";

/**
 * 快捷操作配置
 */
interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: ReactNode;
  hasDropdown: boolean;
  /** 未启用时卡片置灰且不可点击 */
  enabled?: boolean;
  /** 标记"即将推出" */
  comingSoon?: boolean;
}

const quickActions: QuickAction[] = [
  {
    id: "new-doc",
    title: "新建文档",
    description: "快速创建一篇新文档",
    icon: <IconDocument size={26} />,
    hasDropdown: false,
    enabled: true,
  },
  {
    id: "new-notebook",
    title: "新建知识库",
    description: "使用知识库整理知识",
    icon: <IconBook size={26} />,
    hasDropdown: false,
    enabled: true,
  },
  {
    id: "templates",
    title: "模板中心",
    description: "从模板中获取灵感",
    icon: <IconTemplate size={26} />,
    hasDropdown: false,
    enabled: true,
  },
  {
    id: "ai-write",
    title: "AI 帮你写",
    description: "AI 助手帮你一键生成文档",
    icon: <IconSparkle size={26} />,
    hasDropdown: false,
    enabled: true,
  }
];

/**
 * 过滤标签配置
 */
const filterTabs: { id: FilterType; label: string }[] = [
  { id: "edited", label: "编辑过" },
  { id: "viewed", label: "浏览过" },
  // 原名「我点赞的」实际过滤的是 favorite（收藏）—— 语义被复用成了另一个概念，
  // 改名后与数据一致；真正的"点赞"需要独立字段，本地单机场景下没有意义
  { id: "liked", label: "我收藏的" },
  { id: "commented", label: "我评论过" },
  { id: "shared", label: "分享中的" },
  // 「提到我 / 邀我协作」已移除：本机单机应用没有协作数据源，
  // 保留禁用占位只会让用户点到一个永远空着的筛选（比没有更困惑）
];

/**
 * 开始页主组件
 */
export default function StartPage({
  recentViews,
  onViewDoc,
  onCreateDoc,
  onCreateNotebook
}: StartPageProps): JSX.Element {
  // 组件内自行订阅 notebooks，避免 App 顶层订阅整个 notebooks 导致每次击键全 App 重渲染
  const notebooks = useNotesStore((s) => s.notebooks);
  const activeNotebookId = useNotesStore((s) => s.activeNotebookId);
  const recordTemplateUsage = useNotesStore((s) => s.recordTemplateUsage);

  /**
   * 新建内容该落到哪个知识库：优先"当前激活的知识库"（用户此刻的上下文），
   * 其次第一个知识库；一个都没有时顺手建一个，
   * 避免点了「新建文档」却毫无反应（旧实现固定取 notebooks[0] 且空库时静默无操作）。
   */
  const resolveTargetNotebookId = (): string | null => {
    const active = notebooks.find((nb) => nb.id === activeNotebookId);
    if (active) return active.id;
    if (notebooks.length > 0) return notebooks[0].id;
    const created = useNotesStore.getState().createNotebook('我的知识库');
    return created || null;
  };
  const [activeFilter, setActiveFilter] = useState<FilterType>("edited"); // 当前激活的过滤器
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAiWriter, setShowAiWriter] = useState(false);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null); // 按知识库筛选

  /**
   * 根据过滤器类型过滤文档列表。
   *
   * 依赖仍是 `notebooks`（列表要反映最新标题/时间），但排序比较已改用
   * `getUpdatedTime` 的 WeakMap 缓存（见 utils/docSort），不再每次 new Date 解析。
   * 正文变化虽然会带来新的 notebooks 引用，但下面的过滤/排序只扫标题与时间戳，
   * 不做任何内容级操作。
   */
  const filteredDocs = useMemo((): (NoteDoc & { notebook?: Notebook; viewedAt?: string })[] => {
    const currentNotebooks = notebooks;
    // 按知识库筛选
    const filteredNotebooks = selectedNotebookId
      ? currentNotebooks.filter(nb => nb.id === selectedNotebookId)
      : currentNotebooks;

    if (activeFilter === "viewed") {
      return recentViews
        .filter(view => !selectedNotebookId || view.notebookId === selectedNotebookId)
        .map(view => {
          const notebook = currentNotebooks.find(nb => nb.id === view.notebookId);
          const doc = notebook?.docs.find(d => d.id === view.docId);
          return doc ? { ...doc, notebook, viewedAt: view.viewedAt } : null;
        })
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .sort((a, b) => new Date(b.viewedAt!).getTime() - new Date(a.viewedAt!).getTime());
    }

    const allDocs: { doc: NoteDoc; notebook: Notebook }[] = [];
    filteredNotebooks.forEach(notebook => {
      notebook.docs.forEach(doc => {
        allDocs.push({ doc, notebook });
      });
    });

    switch (activeFilter) {
      case "edited":
        return allDocs
          .sort((a, b) => getUpdatedTime(b.doc) - getUpdatedTime(a.doc))
          .map(item => ({ ...item.doc, notebook: item.notebook }));
      case "liked":
        return allDocs
          .filter(item => item.doc.favorite)
          .sort((a, b) => getUpdatedTime(b.doc) - getUpdatedTime(a.doc))
          .map(item => ({ ...item.doc, notebook: item.notebook }));
      case "commented":
        return allDocs
          .filter(item => item.doc.comments && item.doc.comments.length > 0)
          .sort((a, b) => getUpdatedTime(b.doc) - getUpdatedTime(a.doc))
          .map(item => ({ ...item.doc, notebook: item.notebook }));
      case "shared":
        return allDocs
          .filter(item => item.doc.shareLinks && item.doc.shareLinks.length > 0)
          .sort((a, b) => getUpdatedTime(b.doc) - getUpdatedTime(a.doc))
          .map(item => ({ ...item.doc, notebook: item.notebook }));
      default:
        return allDocs
          .sort((a, b) => getUpdatedTime(b.doc) - getUpdatedTime(a.doc))
          .map(item => ({ ...item.doc, notebook: item.notebook }));
    }
  }, [notebooks, recentViews, activeFilter, selectedNotebookId]);

  /**
   * 处理快捷操作点击
   */
  const handleActionClick = (actionId: string): void => {
    if (actionId === "new-doc") {
      // 新建文档：落到当前激活的知识库（空库时自动创建）
      const targetNotebookId = resolveTargetNotebookId();
      if (targetNotebookId) {
        onCreateDoc(targetNotebookId, null, { title: "新建文档" });
      }
    } else if (actionId === "new-notebook") {
      // 新建知识库
      onCreateNotebook("新建知识库");
    } else if (actionId === "templates") {
      // 打开模板中心
      setShowTemplateModal(true);
    } else if (actionId === "ai-write") {
      // 打开 AI 写作助手
      setShowAiWriter(true);
    }
  };

  /**
   * 处理 AI 写作助手插入
   */
  const handleAiInsert = (title: string, content: string): void => {
    const targetNotebookId = resolveTargetNotebookId();
    if (targetNotebookId) {
      onCreateDoc(targetNotebookId, null, { title, content });
    }
  };

  /**
   * 处理模板选择
   */
  const handleSelectTemplate = (template: Template): void => {
    const targetNotebookId = resolveTargetNotebookId();
    if (targetNotebookId) {
      // 占位符替换统一走 utils/templateVars（文档树"从模板新建"共用同一份）
      const content = applyTemplateVars(template.content, { title: template.name });

      onCreateDoc(targetNotebookId, null, {
        title: template.name,
        content,
      });
      // 记录真实使用次数（内置模板的 baseUsageCount 仅作冷启动权重）
      recordTemplateUsage(template.id);
    }
    setShowTemplateModal(false);
  };

  /**
   * 处理文档点击
   */
  const handleDocClick = (doc: { id: string; notebook?: Notebook }): void => {
    if (doc.notebook) {
      onViewDoc(doc.notebook.id, doc.id);
    }
  };

  /**
   * 格式化时间显示（统一使用 utils/formatters）
   */
  const formatTime = (dateString: string): string =>
    formatDateTime(dateString, { prefixToday: true, fallbackWithTime: true });

  /**
   * 获取个性化问候语
   */
  const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了';
    if (hour < 9) return '早上好';
    if (hour < 12) return '上午好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    if (hour < 22) return '晚上好';
    return '夜深了';
  };

  return (
    <div className="start-page">
      {/* 页面头部 */}
      <div className="start-header">
        <h1 className="start-title">{getGreeting()}</h1>
        <p className="start-subtitle">{new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}</p>
      </div>

      {/* 快捷操作区域 */}
      <div className="quick-actions">
        {/* 第一行：新建文档、新建知识库、模板中心 */}
        <div className="quick-actions-row">
          {quickActions.slice(0, 3).map((action) => (
            <div
              key={action.id}
              className={`quick-action-card ${!action.enabled ? 'disabled' : ''}`}
              onClick={() => action.enabled && handleActionClick(action.id)}
            >
              <div className="action-header">
                <span className="action-icon">{action.icon}</span>
                <div className="action-info">
                  <span className="action-title">
                    {action.title}
                    {action.comingSoon && <span className="coming-soon-badge">即将推出</span>}
                  </span>
                  <span className="action-desc">{action.description}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* 第二行：AI 帮你写 */}
        <div className="quick-actions-row full-width">
          <div
            key={quickActions[3].id}
            className={`quick-action-card ${!quickActions[3].enabled ? 'disabled' : ''}`}
            onClick={() => quickActions[3].enabled && handleActionClick(quickActions[3].id)}
          >
            <div className="action-header">
              <span className="action-icon">{quickActions[3].icon}</span>
              <div className="action-info">
                <span className="action-title">
                  {quickActions[3].title}
                  {quickActions[3].comingSoon && <span className="coming-soon-badge">即将推出</span>}
                </span>
                <span className="action-desc">{quickActions[3].description}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 文档列表区域 */}
      <div className="docs-section">
        <div className="docs-section-header">
          <h2 className="docs-section-title">文档</h2>
        </div>

        {/* 过滤标签 */}
        <div className="docs-filter-tabs">
          {filterTabs.map((tab) => (
            <button
              key={tab.id}
              className={`filter-tab ${activeFilter === tab.id ? "active" : ""}`}
              onClick={() => setActiveFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* 右侧筛选器 - 按知识库筛选 */}
        <div className="docs-filters-right">
          <select
            className="filter-select"
            value={selectedNotebookId || ''}
            onChange={(e) => setSelectedNotebookId(e.target.value || null)}
          >
            <option value="">全部知识库</option>
            {notebooks.map(nb => (
              <option key={nb.id} value={nb.id}>{nb.title}</option>
            ))}
          </select>
        </div>

        {/* 文档列表容器 */}
        <div className="docs-list-container">
          {filteredDocs.length === 0 ? (
            <div className="empty-docs">
              <span className="empty-icon"><IconDocument size={40} /></span>
              <span className="empty-text">暂无{filterTabs.find(t => t.id === activeFilter)?.label}的文档</span>
              {/* 空状态必须给出下一步：只显示"暂无"会让新用户停在这里 */}
              <button className="empty-docs-action" onClick={() => handleActionClick('new-doc')}>
                新建文档
              </button>
            </div>
          ) : (
            <div className="docs-list">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="doc-list-item"
                  onClick={() => handleDocClick(doc)}
                >
                  <span className="doc-list-icon"><IconDocument size={18} /></span>
                  <span className="doc-list-title">{doc.title || "未命名文档"}</span>
                  <span className="doc-list-belong">
                    {doc.notebook?.title || "未知知识库"}
                  </span>
                  <span className="doc-list-time">
                    {formatTime(doc.viewedAt || doc.updatedAt)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 模板中心模态框 */}
      {showTemplateModal && (
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div className="modal-content template-center-modal" onClick={(e) => e.stopPropagation()}>
            <TemplateCenter
              onSelectTemplate={handleSelectTemplate}
              onClose={() => setShowTemplateModal(false)}
            />
          </div>
        </div>
      )}

      {/* AI 写作助手 */}
      <AiWriter
        isOpen={showAiWriter}
        onClose={() => setShowAiWriter(false)}
        onInsert={handleAiInsert}
      />
    </div>
  );
}