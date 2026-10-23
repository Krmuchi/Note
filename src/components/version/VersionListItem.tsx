/**
 * 版本列表项：展示单个历史版本的时间、类型标签与自定义标签，点击触发选中。
 * 自 VersionHistoryPanel 抽出，DOM 结构与 class 名保持不变。
 */
import type { JSX } from 'react'
import type { DocVersion } from '@/types'

interface VersionListItemProps {
  version: DocVersion;   // 当前版本
  index: number;         // 在列表中的下标（0 为最新）
  selected: boolean;     // 是否为当前选中版本
  compare: boolean;      // 是否为对比版本
  onSelect: (version: DocVersion) => void; // 选中回调
}

/**
 * 获取版本类型标签
 */
function getVersionTypeLabel(type: string): string {
  switch (type) {
    case 'manual': return '手动保存';
    case 'published': return '已发布';
    default: return '自动保存';
  }
}

/**
 * 获取版本类型样式类名
 */
function getVersionTypeClass(type: string): string {
  switch (type) {
    case 'manual': return 'version-type-manual';
    case 'published': return 'version-type-published';
    default: return 'version-type-auto';
  }
}

/**
 * 版本列表项组件
 */
export default function VersionListItem({ version, index, selected, compare, onSelect }: VersionListItemProps): JSX.Element {
  return (
    <div
      className={`version-item ${selected ? 'selected' : ''} ${compare ? 'compare' : ''}`}
      onClick={() => onSelect(version)}
    >
      <div className="version-item-header">
        <span className="version-date">
          {new Date(version.createdAt).toLocaleDateString('zh-CN')}
        </span>
        <span className="version-time">
          {new Date(version.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
        </span>
        <span className={`version-type ${getVersionTypeClass(version.type)}`}>
          {getVersionTypeLabel(version.type)}
        </span>
      </div>
      {version.versionTag && (
        <div className="version-tag">{version.versionTag}</div>
      )}
      {index === 0 && (
        <span className="version-latest">最新</span>
      )}
    </div>
  );
}