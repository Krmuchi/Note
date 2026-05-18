// 导入类型定义
import type { TagStats } from "../types";

/**
 * 标签统计面板属性接口
 */
interface TagStatsPanelProps {
  stats: TagStats;  // 标签统计数据
}

/**
 * 标签统计面板组件
 */
export default function TagStatsPanel({ stats }: TagStatsPanelProps) {
  /**
   * 计算进度条宽度百分比
   */
  const getBarWidth = (count: number, max: number) => {
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
        <h4 className="tag-stat-section-title">📊 使用分布</h4>
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
        <h4 className="tag-stat-section-title">🔥 热门标签 TOP 10</h4>
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
        <h4 className="tag-stat-section-title">💡 使用建议</h4>
        <div className="tag-tips">
          {stats.unusedCount > 0 && (
            <div className="tag-tip">
              <span className="tag-tip-icon">⚠️</span>
              <span>有 {stats.unusedCount} 个标签从未使用，考虑删除或重新命名</span>
            </div>
          )}
          {stats.usedCount === 0 && stats.totalCount > 0 && (
            <div className="tag-tip">
              <span className="tag-tip-icon">📝</span>
              <span>还没有标签被使用，尝试给文档添加标签吧！</span>
            </div>
          )}
          {stats.totalCount === 0 && (
            <div className="tag-tip">
              <span className="tag-tip-icon">🎯</span>
              <span>还没有创建任何标签，点击上方按钮创建新标签</span>
            </div>
          )}
          {stats.topTags.length > 0 && stats.topTags[0].count >= 10 && (
            <div className="tag-tip">
              <span className="tag-tip-icon">⭐</span>
              <span>「{stats.topTags[0].tag.name}」是最热门的标签，已使用 {stats.topTags[0].count} 次</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}