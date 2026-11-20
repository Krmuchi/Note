// 导入类型定义
import type { CSSProperties, JSX } from "react";
import type { TagStats } from "@/types";
import { IconChart, IconEdit, IconLightbulb, IconStar, IconWarning } from "@/components/common/Icon";

/**
 * 「热门」「创建目标」在图标库里没有对应件（fire / target），
 * 按 DocTree 的内联 svg 先例：24 viewBox、stroke 2、currentColor、装饰性 aria-hidden。
 */
const FlameIcon = ({ size = 14 }: { size?: number }): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

const TargetIcon = ({ size = 14 }: { size?: number }): JSX.Element => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.4" />
  </svg>
);

/** 标题里的图标与文字垂直居中（原为 emoji 文本，天然同基线；CSS 不在本族，用最小 inline 处理） */
const sectionTitleStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px' };

/**
 * 标签统计面板属性接口
 */
interface TagStatsPanelProps {
  stats: TagStats;  // 标签统计数据
}

/**
 * 标签统计面板组件
 */
export default function TagStatsPanel({ stats }: TagStatsPanelProps): JSX.Element {
  /**
   * 计算进度条宽度百分比
   */
  const getBarWidth = (count: number, max: number): number => {
    if (max === 0) return 0;
    return (count / max) * 100;
  };

  // 获取最大计数值用于计算百分比
  const maxCount = Math.max(...stats.tagDistribution.map(d => d.count), 1);

  return (
    <div className="tag-stats-panel">
      {/* 统计卡片 */}
      <div className="tag-stats-cards">
        <div className="tag-stat-card">
          <div className="tag-stat-value">{stats.totalCount}</div>
          <div className="tag-stat-label">总标签数</div>
        </div>
        <div className="tag-stat-card">
          <div className="tag-stat-value used">{stats.usedCount}</div>
          <div className="tag-stat-label">已使用</div>
        </div>
        <div className="tag-stat-card">
          <div className="tag-stat-value unused">{stats.unusedCount}</div>
          <div className="tag-stat-label">未使用</div>
        </div>
      </div>

      {/* 使用分布 */}
      <div className="tag-stat-section">
        <h4 className="tag-stat-section-title" style={sectionTitleStyle}>
          <IconChart size={16} /> 使用分布
        </h4>
        <div className="tag-distribution">
          {stats.tagDistribution.map((item) => (
            <div key={item.category} className="tag-dist-item">
              <span className="tag-dist-label">{item.category}</span>
              <div className="tag-dist-bar-container">
                <div 
                  className="tag-dist-bar"
                  style={{ width: `${getBarWidth(item.count, maxCount)}%` }}
                />
              </div>
              <span className="tag-dist-count">{item.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 热门标签 */}
      <div className="tag-stat-section">
        <h4 className="tag-stat-section-title" style={sectionTitleStyle}>
          <FlameIcon size={16} /> 热门标签 TOP 10
        </h4>
        {stats.topTags.length === 0 ? (
          <div className="tag-top-empty">
            <span>暂无使用数据</span>
          </div>
        ) : (
          <div className="tag-top-list">
            {stats.topTags.map((item, index) => (
              <div key={item.tag.id} className="tag-top-item">
                <span className="tag-top-rank">{index + 1}</span>
                <span 
                  className="tag-top-color"
                  style={{ backgroundColor: item.tag.color }}
                />
                <span className="tag-top-icon">{item.tag.icon}</span>
                <span className="tag-top-name">{item.tag.name}</span>
                <span className="tag-top-count">{item.count} 次使用</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 使用建议 */}
      <div className="tag-stat-section">
        <h4 className="tag-stat-section-title" style={sectionTitleStyle}>
          <IconLightbulb size={16} /> 使用建议
        </h4>
        <div className="tag-tips">
          {stats.unusedCount > 0 && (
            <div className="tag-tip">
              <span className="tag-tip-icon"><IconWarning size={14} /></span>
              <span>有 {stats.unusedCount} 个标签从未使用，考虑删除或重新命名</span>
            </div>
          )}
          {stats.usedCount === 0 && stats.totalCount > 0 && (
            <div className="tag-tip">
              <span className="tag-tip-icon"><IconEdit size={14} /></span>
              <span>还没有标签被使用，尝试给文档添加标签吧！</span>
            </div>
          )}
          {stats.totalCount === 0 && (
            <div className="tag-tip">
              <span className="tag-tip-icon"><TargetIcon size={14} /></span>
              <span>还没有创建任何标签，点击上方按钮创建新标签</span>
            </div>
          )}
          {stats.topTags.length > 0 && stats.topTags[0].count >= 10 && (
            <div className="tag-tip">
              <span className="tag-tip-icon"><IconStar size={14} /></span>
              <span>「{stats.topTags[0].tag.name}」是最热门的标签，已使用 {stats.topTags[0].count} 次</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}