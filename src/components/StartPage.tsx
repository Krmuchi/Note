// 导入 React 相关 hooks 和类型定义
import { useState, useMemo } from "react";
import type { NoteDoc, Notebook } from "../types";

/**
 * 开始页组件属性接口
 */
interface StartPageProps {
  notebooks: Notebook[];                                    // 知识库列表
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
const quickActions = [
  {
    id: "new-doc",
    title: "新建文档",
    description: "文档、表格、画板、数据表",
    icon: "📄",
    hasDropdown: true,
    menuItems: ["新建文档", "新建表格", "新建画板", "新建数据表"]
  },
  {
    id: "new-notebook",
    title: "新建知识库",
    description: "使用知识库整理知识",
    icon: "📚",
    hasDropdown: false
  },
  {
    id: "templates",
    title: "模板中心",
    description: "从模板中获取灵感",
    icon: "🎨",
    hasDropdown: false
  },
  {
    id: "ai-write",
    title: "AI 帮你写",
    description: "AI 助手帮你一键生成文档",
    icon: "🤖",
    hasDropdown: false
  }
];

/**
 * 过滤标签配置
 */
const filterTabs: { id: FilterType; label: string }[] = [
  { id: "edited", label: "编辑过" },
  { id: "viewed", label: "浏览过" },
  { id: "mentioned", label: "提到我" },
  { id: "liked", label: "我点赞的" },
  { id: "commented", label: "我评论过" },
  { id: "collaborated", label: "邀我协作" },
  { id: "shared", label: "分享中的" }
];

/**
 * 开始页主组件
 */
export default function StartPage({
  notebooks,
  recentViews,
  onViewDoc,
  onCreateDoc,
  onCreateNotebook
}: StartPageProps) {
  const [activeFilter, setActiveFilter] = useState<FilterType>("edited"); // 当前激活的过滤器
  const [, setExpandedAction] = useState<string | null>(null); // 展开的快捷操作（预留）

  /**
   * 根据过滤器类型过滤文档列表
   */
  const filteredDocs = useMemo((): (NoteDoc & { notebook?: Notebook; viewedAt?: string })[] => {
    // 如果选择"浏览过"，从浏览记录中获取
    if (activeFilter === "viewed") {
      return recentViews
        .map(view => {
          const notebook = notebooks.find(nb => nb.id === view.notebookId);
          const doc = notebook?.docs.find(d => d.id === view.docId);
          return doc ? { ...doc, notebook, viewedAt: view.viewedAt } : null;
        })
        .filter((d): d is NonNullable<typeof d> => d !== null)
        .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime());
    }

    // 默认：获取所有文档并按更新时间排序
    const allDocs: { doc: NoteDoc; notebook: Notebook }[] = [];
    notebooks.forEach(notebook => {
      notebook.docs.forEach(doc => {
        allDocs.push({ doc, notebook });
      });
    });
    return allDocs
      .sort((a, b) => new Date(b.doc.updatedAt).getTime() - new Date(a.doc.updatedAt).getTime())
      .map(item => ({ ...item.doc, notebook: item.notebook }));
  }, [notebooks, recentViews, activeFilter]);

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
    } else {
      // 其他功能开发中
      alert(`${actionId} 功能开发中`);
    }
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
   * 格式化时间显示
   */
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `今天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `昨天 ${date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays < 7) {
      return `${diffDays} 天前`;
    } else {
      return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    }
  };

  return (
    <div className="start-page">
      {/* 页面头部 */}
      <div className="start-header">
        <h1 className="start-title">开始</h1>
      </div>

      {/* 快捷操作区域 */}
      <div className="quick-actions">
        {/* 第一行：新建文档、新建知识库、模板中心 */}
        <div className="quick-actions-row">
          {quickActions.slice(0, 3).map((action) => (
            <div
              key={action.id}
              className="quick-action-card"
              onClick={() => handleActionClick(action.id)}
            >
              <div className="action-header">
                <span className="action-icon">{action.icon}</span>
                <div className="action-info">
                  <span className="action-title">{action.title}</span>
                  <span className="action-desc">{action.description}</span>
                </div>
                {action.hasDropdown && (
                  <span className="action-arrow">▼</span>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {/* 第二行：AI 帮你写 */}
        <div className="quick-actions-row full-width">
          <div
            key={quickActions[3].id}
            className="quick-action-card"
            onClick={() => handleActionClick(quickActions[3].id)}
          >
            <div className="action-header">
              <span className="action-icon">{quickActions[3].icon}</span>
              <div className="action-info">
                <span className="action-title">{quickActions[3].title}</span>
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

        {/* 右侧筛选器 */}
        <div className="docs-filters-right">
          <select className="filter-select">
            <option>类型</option>
            <option>全部</option>
            <option>文档</option>
            <option>表格</option>
            <option>画板</option>
          </select>
          <select className="filter-select">
            <option>归属</option>
            <option>全部</option>
            {notebooks.map(nb => (
              <option key={nb.id}>{nb.title}</option>
            ))}
          </select>
          <select className="filter-select">
            <option>创建者</option>
            <option>全部</option>
            <option>我</option>
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
    </div>
  );
}