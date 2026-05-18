// 导入 React hooks 和类型定义
import { useState, useEffect } from "react";
import type { ShareLink } from "../types";

/**
 * 分享面板组件属性接口
 */
interface SharePanelProps {
  isOpen: boolean;                                 // 面板是否打开
  onClose: () => void;                             // 关闭回调
  docTitle: string;                                // 文档标题
  docId: string;                                   // 文档 ID
  notebookId: string;                              // 知识库 ID
  shareLinks: ShareLink[];                         // 分享链接列表
  onGenerateLink: (permission: string, password: string, expiresAt: string | null) => void; // 生成分享链接回调
  onDeleteLink: (linkId: string) => void;          // 删除分享链接回调
  onCopyLink: (url: string) => void;               // 复制链接回调
}

/**
 * 权限选项配置
 */
const permissionOptions = [
  { value: 'view', label: '查看', icon: '👁️' },
  { value: 'comment', label: '评论', icon: '💬' },
  { value: 'edit', label: '编辑', icon: '✏️' },
  { value: 'manage', label: '管理', icon: '⚙️' },
];

/**
 * 有效期选项配置
 */
const expireOptions = [
  { value: null, label: '永不过期' },
  { value: '1d', label: '1天' },
  { value: '3d', label: '3天' },
  { value: '7d', label: '7天' },
  { value: '30d', label: '30天' },
];

/**
 * 分享面板组件
 */
export default function SharePanel({
  isOpen,
  onClose,
  docTitle,
  shareLinks,
  onGenerateLink,
  onDeleteLink,
  onCopyLink,
}: SharePanelProps) {
  const [selectedPermission, setSelectedPermission] = useState('view'); // 选中的权限
  const [password, setPassword] = useState('');                         // 密码
  const [expireOption, setExpireOption] = useState<string | null>(null); // 有效期选项
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);      // 已复制的 URL

  // 面板打开时重置表单
  useEffect(() => {
    if (isOpen) {
      setSelectedPermission('view');
      setPassword('');
      setExpireOption(null);
    }
  }, [isOpen]);

  /**
   * 处理生成分享链接
   */
  const handleGenerate = () => {
    let expiresAt: string | null = null;
    if (expireOption) {
      const days = parseInt(expireOption.replace('d', ''));
      const expireDate = new Date();
      expireDate.setDate(expireDate.getDate() + days);
      expiresAt = expireDate.toISOString();
    }
    onGenerateLink(selectedPermission, password, expiresAt);
    setPassword('');
    setExpireOption(null);
  };

  /**
   * 处理复制链接
   */
  const handleCopy = (url: string) => {
    onCopyLink(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  /**
   * 格式化日期显示
   */
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  /**
   * 获取有效期显示文本
   */
  const getExpireDisplay = (expiresAt: string | null) => {
    if (!expiresAt) return '永不过期';
    return `有效期至 ${formatDate(expiresAt)}`;
  };

  /**
   * 获取权限标签显示
   */
  const getPermissionLabel = (permission: string) => {
    const option = permissionOptions.find(p => p.value === permission);
    return option?.label || permission;
  };

  // 如果面板未打开，返回 null
  if (!isOpen) return null;

  return (
    <div className="share-panel-overlay" onClick={onClose}>
      <div className="share-panel" onClick={(e) => e.stopPropagation()}>
        {/* 头部 */}
        <div className="share-panel-header">
          <h3 className="share-panel-title">分享文档</h3>
          <button className="share-panel-close" onClick={onClose}>×</button>
        </div>

        <div className="share-panel-body">
          {/* 文档信息 */}
          <div className="share-doc-info">
            <span className="share-doc-icon">📄</span>
            <span className="share-doc-title">{docTitle}</span>
          </div>

          {/* 新建分享链接 */}
          <div className="share-section">
            <h4 className="share-section-title">新建分享链接</h4>
            
            <div className="share-form">
              {/* 权限选择 */}
              <div className="share-form-group">
                <label className="share-form-label">访问权限</label>
                <div className="permission-options">
                  {permissionOptions.map((option) => (
                    <button
                      key={option.value}
                      className={`permission-option ${selectedPermission === option.value ? 'active' : ''}`}
                      onClick={() => setSelectedPermission(option.value)}
                    >
                      <span className="permission-icon">{option.icon}</span>
                      <span className="permission-label">{option.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 密码保护 */}
              <div className="share-form-group">
                <label className="share-form-label">
                  <input
                    type="checkbox"
                    checked={!!password}
                    onChange={(e) => {
                      if (!e.target.checked) setPassword('');
                    }}
                    className="share-checkbox"
                  />
                  设置密码保护
                </label>
                {password && (
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="请输入密码"
                    className="share-password-input"
                  />
                )}
              </div>

              {/* 有效期 */}
              <div className="share-form-group">
                <label className="share-form-label">有效期</label>
                <select
                  value={expireOption || ''}
                  onChange={(e) => setExpireOption(e.target.value || null)}
                  className="share-select"
                >
                  {expireOptions.map((option) => (
                    <option key={option.value || 'never'} value={option.value || ''}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button className="share-generate-btn" onClick={handleGenerate}>
                生成链接
              </button>
            </div>
          </div>

          {/* 分享记录 */}
          <div className="share-section">
            <h4 className="share-section-title">分享记录</h4>
            
            {shareLinks.length === 0 ? (
              <div className="share-empty">
                <span className="share-empty-icon">🔗</span>
                <span className="share-empty-text">暂无分享链接</span>
              </div>
            ) : (
              <div className="share-links-list">
                {shareLinks.map((link) => (
                  <div key={link.id} className="share-link-item">
                    <div className="share-link-url">
                      <input
                        type="text"
                        value={link.url}
                        readOnly
                        className="share-url-input"
                      />
                      <button
                        className={`share-copy-btn ${copiedUrl === link.url ? 'copied' : ''}`}
                        onClick={() => handleCopy(link.url)}
                      >
                        {copiedUrl === link.url ? '✓ 已复制' : '复制'}
                      </button>
                    </div>
                    <div className="share-link-meta">
                      <span className="share-link-permission">{getPermissionLabel(link.permission)}</span>
                      {link.password && <span className="share-link-password">🔒</span>}
                      <span className="share-link-expire">{getExpireDisplay(link.expiresAt)}</span>
                      <span className="share-link-access">访问 {link.accessCount} 次</span>
                      <span className="share-link-date">创建于 {formatDate(link.createdAt)}</span>
                    </div>
                    <button
                      className="share-delete-btn"
                      onClick={() => onDeleteLink(link.id)}
                    >
                      删除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}