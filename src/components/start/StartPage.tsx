// 导入 React 相关 hooks 和类型定义
import { useState, useMemo } from "react";
import { useNotesStore } from "@/store";
import { formatDateTime } from "@/utils/formatters";
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
type FilterType = "edited" | "viewed" | "mentioned" | "liked" | "commented" | "collaborated" | "shared";

/**
 * 快捷操作配置
 */
interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
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
    icon: "📄",
    hasDropdown: false,
    enabled: true,
  },
  {
    id: "new-notebook",
    title: "新建知识库",
    description: "使用知识库整理知识",
    icon: "📚",
    hasDropdown: false,
    enabled: true,
  },
  {
    id: "templates",
    title: "模板中心",
    description: "从模板中获取灵感",
    icon: "🎨",
    hasDropdown: false,
    enabled: true,
  },
  {
    id: "ai-write",
    title: "AI 帮你写",
    description: "AI 助手帮你一键生成文档",
    icon: "🤖",
    hasDropdown: false,
    enabled: true,
  }
];

/**
 * 过滤标签配置
 */
const filterTabs: { id: FilterType; label: string; enabled?: boolean }[] = [
  { id: "edited", label: "编辑过" },
  { id: "viewed", label: "浏览过" },
  { id: "liked", label: "我点赞的" },
  { id: "commented", label: "我评论过" },
  { id: "shared", label: "分享中的" },
  { id: "mentioned", label: "提到我", enabled: false },
  { id: "collaborated", label: "邀我协作", enabled: false },
];

/**
 * 开始页主组件
 */
export default function StartPage({
  recentViews,
  onViewDoc,
  onCreateDoc,
  onCreateNotebook
}: StartPageProps) {
  // 组件内自行订阅 notebooks，避免 App 顶层订阅整个 notebooks 导致每次击键全 App 重渲染
  const notebooks = useNotesStore((s) => s.notebooks);
  const [activeFilter, setActiveFilter] = useState<FilterType>("edited"); // 当前激活的过滤器
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showAiWriter, setShowAiWriter] = useState(false);
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null); // 按知识库筛选

  /**
   * 根据过滤器类型过滤文档列表
   */
  const filteredDocs = useMemo((): (NoteDoc & { notebook?: Notebook; viewedAt?: string })[] => {
    // 按知识库筛选
    const filteredNotebooks = selectedNotebookId
      ? notebooks.filter(nb => nb.id === selectedNotebookId)
      : notebooks;

    if (activeFilter === "viewed") {
      return recentViews
        .filter(view => !selectedNotebookId || view.notebookId === selectedNotebookId)
        .map(view => {
          const notebook = notebooks.find(nb => nb.id === view.notebookId);
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
          .sort((a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime())
          .map(item => ({ ...item.doc, notebook: item.notebook }));
      case "liked":
        return allDocs
          .filter(item => item.doc.favorite)
          .sort((a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime())
          .map(item => ({ ...item.doc, notebook: item.notebook }));
      case "commented":
        return allDocs
          .filter(item => item.doc.comments && item.doc.comments.length > 0)
          .sort((a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime())
          .map(item => ({ ...item.doc, notebook: item.notebook }));
      case "shared":
        return allDocs
          .filter(item => item.doc.shareLinks && item.doc.shareLinks.length > 0)
          .sort((a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime())
          .map(item => ({ ...item.doc, notebook: item.notebook }));
      case "mentioned":
      case "collaborated":
        return [];
      default:
        return allDocs
          .sort((a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime())
          .map(item => ({ ...item.doc, notebook: item.notebook }));
    }
  }, [notebooks, recentViews, activeFilter, selectedNotebookId]);

  /**
   * 处理快捷操作点击
   */
  const handleActionClick = (actionId: string) => {
    if (actionId === "new-doc") {
      // 新建文档：选择第一个知识库创建
      if (notebooks.length > 0) {
        onCreateDoc(notebooks[0].id, null, { title: "新建文档" });
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
  const handleAiInsert = (title: string, content: string) => {
    if (notebooks.length > 0) {
      onCreateDoc(notebooks[0].id, null, { title, content });
    }
  };

  /**
   * 处理模板选择
   */
  const handleSelectTemplate = (template: Template) => {
    if (notebooks.length > 0) {
      const now = new Date();
      const content = template.content
        .replace(/{week}/g, `${now.getFullYear()}年第${Math.ceil(now.getDate() / 7)}周`)
        .replace(/{date}/g, now.toLocaleDateString('zh-CN'))
        .replace(/{weekday}/g, now.toLocaleDateString('zh-CN', { weekday: 'long' }))
        .replace(/{meetingName}/g, '会议名称')
        .replace(/{location}/g, '会议室')
        .replace(/{host}/g, '主持人')
        .replace(/{projectName}/g, '项目名称')
        .replace(/{startDate}/g, now.toLocaleDateString('zh-CN'))
        .replace(/{endDate}/g, now.toLocaleDateString('zh-CN'))
        .replace(/{destination}/g, '目的地')
        .replace(/{company}/g, '公司名称')
        .replace(/{bookName}/g, '书名')
        .replace(/{topic}/g, '讨论主题');

      onCreateDoc(notebooks[0].id, null, {
        title: template.name,
        content,
      });
    }
    setShowTemplateModal(false);
  };

  /**
   * 处理文档点击
   */
  const handleDocClick = (doc: { id: string; notebook?: Notebook }) => {
    if (doc.notebook) {
      onViewDoc(doc.notebook.id, doc.id);
    }
  };

  /**
   * 格式化时间显示（统一使用 utils/formatters）
   */
  const formatTime = (dateString: string) =>
    formatDateTime(dateString, { prefixToday: true, fallbackWithTime: true });

  /**
   * 获取个性化问候语
   */
  const getGreeting = () => {
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
              className={`filter-tab ${activeFilter === tab.id ? "active" : ""} ${tab.enabled === false ? "disabled" : ""}`}
              onClick={() => tab.enabled !== false && setActiveFilter(tab.id)}
              title={tab.enabled === false ? "即将推出" : undefined}
            >
              {tab.label}
              {tab.enabled === false && <span className="coming-soon-dot" />}
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
              <span className="empty-icon">📄</span>
              <span className="empty-text">暂无{filterTabs.find(t => t.id === activeFilter)?.label}的文档</span>
            </div>
          ) : (
            <div className="docs-list">
              {filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="doc-list-item"
                  onClick={() => handleDocClick(doc)}
                >
                  <span className="doc-list-icon">📄</span>
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