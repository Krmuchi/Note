/**
 * 版本对比视图：顶部对比目标下拉 + 左右双栏逐行 diff 展示。
 * 自 VersionHistoryPanel 抽出，diff 算法改为引用 @/utils/diff 的纯函数，DOM 结构保持不变。
 */
import type { JSX } from 'react'
import type { DocVersion } from '@/types'
import { computeDiff } from '@/utils/diff'

interface VersionDiffViewProps {
  versions: DocVersion[];                       // 可选的历史版本列表
  selectedVersion: DocVersion | null;           // 当前版本
  compareVersion: DocVersion | null;            // 对比版本
  onCompareVersionChange: (version: DocVersion | null) => void; // 切换对比版本
  onCompare: () => void;                        // 点击对比
}

/**
 * 版本对比视图组件
 */
export default function VersionDiffView({
  versions,
  selectedVersion,
  compareVersion,
  onCompareVersionChange,
  onCompare,
}: VersionDiffViewProps): JSX.Element {
  /**
   * 渲染版本对比内容
   */
  const renderDiff = (): JSX.Element | null => {
    if (!selectedVersion || !compareVersion) return null;

    const currentContent = selectedVersion.content.split('\n');
    const compareContent = compareVersion.content.split('\n');
    const diff = computeDiff(currentContent, compareContent);

    return (
      <div className="diff-view">
        <div className="diff-header">
          <span className="diff-label">当前版本:</span>
          <span className="diff-time">{new Date(selectedVersion.createdAt).toLocaleString('zh-CN')}</span>
          <span className="diff-separator">vs</span>
          <span className="diff-label">对比版本:</span>
          <span className="diff-time">{new Date(compareVersion.createdAt).toLocaleString('zh-CN')}</span>
        </div>
        <div className="diff-content">
          <div className="diff-panel">
            <div className="diff-panel-header">
              <span>{new Date(selectedVersion.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <div className="diff-body">
              {diff.current.map((line, idx) => (
                <div key={idx} className={`diff-line diff-line-${line.type}`}>
                  <span className="diff-line-number">{idx + 1}</span>
                  <span className="diff-line-prefix">{line.type === 'added' ? '+' : ' '}</span>
                  <span className="diff-line-content">{line.text || ' '}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="diff-panel">
            <div className="diff-panel-header">
              <span>{new Date(compareVersion.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <div className="diff-body">
              {diff.compare.map((line, idx) => (
                <div key={idx} className={`diff-line diff-line-${line.type}`}>
                  <span className="diff-line-number">{idx + 1}</span>
                  <span className="diff-line-prefix">{line.type === 'removed' ? '-' : ' '}</span>
                  <span className="diff-line-content">{line.text || ' '}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="compare-header">
        <span className="compare-label">与</span>
        <select
          className="compare-select"
          value={compareVersion?.id || ''}
          onChange={(e) => {
            const v = versions.find(v => v.id === e.target.value);
            onCompareVersionChange(v || null);
          }}
        >
          <option value="">请选择历史版本</option>
          {versions.map(v => (
            <option key={v.id} value={v.id}>
              {new Date(v.createdAt).toLocaleString('zh-CN')}
            </option>
          ))}
        </select>
        <button className="compare-btn" onClick={onCompare}>
          对比
        </button>
      </div>
      {renderDiff()}
    </>
  );
}