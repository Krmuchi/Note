import { useState, useEffect, useRef } from "react";
import type { JSX } from "react";
import type { ShareLink } from "@/types";
import { useNotesStore } from "@/store";
import { exportHtmlDoc } from "@/services/storage";
import { toast } from "@/components/common/Toast";

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
  docId,
  notebookId,
  shareLinks,
  onGenerateLink,
  onDeleteLink,
  onCopyLink,
}: SharePanelProps): JSX.Element | null {
  const [selectedPermission, setSelectedPermission] = useState('view');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [expireOption, setExpireOption] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [isOpen]);

  /**
   * 处理生成分享链接
   */
  const handleGenerate = (): void => {
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
   * 导出当前文档为自包含 HTML —— 单机应用里"分享"唯一能真正落地的形态。
   *
   * 为什么不直接用链接：ShareLink.url 只是本机标识，复制给别打不开。
   * 与其让用户复制一个打不开的地址，不如给一个能直接发出去的文件。
   * 内容从 store 现读（而不是 props）：面板打开期间用户可能在编辑器里改过。
   */
  const onExportShareHtml = async (): Promise<void> => {
    const state = useNotesStore.getState()
    const doc = state.notebooks
      .find((nb) => nb.id === notebookId)
      ?.docs.find((d) => d.id === docId)
    if (!doc) {
      toast.error('文档已不存在，无法导出')
      return
    }
    try {
      const ok = await exportHtmlDoc({ title: doc.title, content: doc.content })
      if (ok) toast.success('已导出为 HTML，可直接发送给他人')
    } catch (err) {
      console.error('导出分享 HTML 失败:', err)
      toast.error('导出失败，请重试')
    }
  };

  /**
   * 处理复制链接（记录定时器 id，避免面板关闭后 setState）
   */
  const handleCopy = (url: string): void => {
    onCopyLink(url);
    setCopiedUrl(url);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopiedUrl(null), 2000);
  };

  /**
   * 格式化日期显示
   */
  const formatDate = (dateString: string): string => {
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
  const getExpireDisplay = (expiresAt: string | null): string => {
    if (!expiresAt) return '永不过期';
    return `有效期至 ${formatDate(expiresAt)}`;
  };

  /**
   * 获取权限标签显示
   */
  const getPermissionLabel = (permission: string): string => {
    const option = permissionOptions.find(p => p.value === permission);
    return option?.label || permission;
  };

  const isLinkExpired = (expiresAt: string | null): boolean => {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() < now;
  };

  const getExpireStatusClass = (expiresAt: string | null): string => {
    if (!expiresAt) return '';
    const remaining = new Date(expiresAt).getTime() - now;
    if (remaining <= 0) return 'expired';
    if (remaining <= 86400000) return 'expiring-soon';
    return '';
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
            <div className="share-local-hint">
              <span className="hint-icon">ℹ️</span>
              <span className="hint-text">链接是本机标识，复制给别人打不开；要分享内容请用「导出 HTML」</span>
            </div>
            
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
                      if (!e.target.checked) {
                        setPassword('');
                        setShowPassword(false);
                      } else {
                        setPassword(' ');
                      }
                    }}
                    className="share-checkbox"
                  />
                  设置密码保护
                </label>
                {password !== '' && (
                  <div className="share-password-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password.trim()}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入密码"
                      className="share-password-input"
                    />
                    <button
                      type="button"
                      className="share-password-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? '隐藏密码' : '显示密码'}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
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
                  <div key={link.id} className={`share-link-item ${isLinkExpired(link.expiresAt) ? 'link-expired' : ''}`}>
                    <div className="share-link-url">
                      <input
                        type="text"
                        value={link.url}
                        readOnly
                        className="share-url-input"
                        title="本地标识，仅供本机识别；发给别人请用「导出 HTML」"
                      />
                      <button
                        className={`share-copy-btn ${copiedUrl === link.url ? 'copied' : ''}`}
                        onClick={() => handleCopy(link.url)}
                        disabled={isLinkExpired(link.expiresAt)}
                      >
                        {copiedUrl === link.url ? '✓ 已复制' : '复制'}
                      </button>
                      {/*
                        链接是本机标识，复制出去对方打不开 —— 所以额外给一个真正能发出去的出口：
                        导出为自包含的 HTML 文件（复用已有的 buildExportDocument，样式与打印一致）。
                        这是"分享"在本机单机应用里唯一有意义的形态。
                      */}
                      <button
                        type="button"
                        className="share-export-btn"
                        onClick={() => void onExportShareHtml()}
                        title="导出为可发给别人的 HTML 文件"
                      >
                        导出 HTML
                      </button>
                    </div>
                    <div className="share-link-meta">
                      <span className="share-link-permission">{getPermissionLabel(link.permission)}</span>
                      {link.password && <span className="share-link-password">🔒</span>}
                      <span className={`share-link-expire ${getExpireStatusClass(link.expiresAt)}`}>
                        {isLinkExpired(link.expiresAt) ? '已过期' : getExpireDisplay(link.expiresAt)}
                      </span>
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