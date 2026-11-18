import '@/styles/settings.css';
import { useCallback, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useTheme, THEME_OPTIONS, useFont, FONT_OPTIONS, applyCustomPrimaryColor } from '@/shared/hooks';
import { aiClient } from '@/services/ai';
// 别名导入：本地 state setter 也叫 setAppSettings，直接用会互相遮蔽
import { getAppInfo, getAppSettings, openDataDir, setAppSettings as saveAppSettings } from '@/services/storage';
import type { AppInfo, AppSettings } from '@/types';
import BackupPanel from './BackupPanel';
import { clearErrorLogs, formatErrorLogs, readErrorLogs } from '@/utils/errorLog';
import { formatPerfSnapshot } from '@/utils/perfMarks';
import {
  checkForUpdate,
  clearCrashLog,
  isWebMode as isWebModeRaw,
  getFileAssociation,
  migrateDataDir,
  openExternal,
  setFileAssociation,
  readCrashLog,
  relaunchApp,
} from '@/services/storage';
import { confirmAction } from '@/hooks/useConfirmAction';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { CrashLogResult, FileAssociationState, UpdateCheckResult } from '@/types';
import { copyToClipboard } from '@/utils/clipboard';
import { requestOnboarding } from '@/utils/onboarding';
import { setRichEditorEnabled, useRichEditorEnabled } from '@/utils/richEditorFlag';
import { uiActions, useUIState, useUIStateSelector } from '@/hooks/useUIState';
import type { SettingsTabId } from '@/hooks/useUIState';
import { toast } from '@/services/toast';
import type { AiConfigView, AiFailure } from '@/types/ai';
import AiSettingsTab from './AiSettingsTab';
import ShortcutsTab from './ShortcutsTab';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/** 界面缩放范围与步进：与 electron/app-settings.cjs 的 clampZoom 一致（0.75~2） */
const ZOOM_MIN = 0.75;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

// 预设主题色
const PRESET_COLORS = [
  { name: '蓝色', value: '#1677ff' },
  { name: '绿色', value: '#52c41a' },
  { name: '红色', value: '#ff4d4f' },
  { name: '橙色', value: '#fa8c16' },
  { name: '紫色', value: '#722ed1' },
  { name: '粉色', value: '#eb2f96' },
  { name: '青色', value: '#13c2c2' },
  { name: '金色', value: '#faad14' },
];

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps): JSX.Element | null {
  const { theme, setCustomTheme } = useTheme();
  const { font, setCustomFont } = useFont();
  /** 字号来自全局 UI store：设置页不再需要 App 透传 fontSize / onFontSizeChange */
  const { fontSize } = useUIState();
  const { setFontSize } = uiActions;
  /** 富文本内核开关：切换后编辑器立即生效，不需要刷新页面 */
  const richEditorEnabled = useRichEditorEnabled();
  /**
   * 页签以全局 UI store 为单一数据源：AI 错误条的「去设置」通过
   * uiActions.openSettings('ai') 打开并定位页签，面板已打开时也能即时切换。
   */
  const activeTab = useUIStateSelector((s) => s.settingsTab);
  /** AI 设置是否有未保存修改（AiSettingsTab 上报）：关闭前据此弹确认 */
  const aiSettingsDirty = useUIStateSelector((s) => s.aiSettingsDirty);
  /** 焦点陷阱：Tab 在面板内循环，关闭后归还焦点（A2） */
  const panelRef = useFocusTrap<HTMLDivElement>(isOpen);
  /** 关于信息（版本 / 数据目录）：面板打开时读取一次 */
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  /** 错误日志（R3）：进入面板时读取一次，清空后同步刷新 */
  const [errorLogs, setErrorLogs] = useState(() => readErrorLogs());
  const [showErrorLogs, setShowErrorLogs] = useState(false);
  /** 本机偏好（托盘 / 全局快捷键）：仅 Electron 下可用，读不到就不渲染这一节 */
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  /** AI 配置在切到该页签时才加载：放在事件处理器里而不是 effect 中，避免级联渲染 */
  const [aiConfig, setAiConfig] = useState<AiConfigView | AiFailure | null>(null);
  /** D5 崩溃记录：进入面板时读一次，清空/刷新后同步 */
  const [crashLog, setCrashLog] = useState<CrashLogResult>({ ok: true, latest: null });
  /** P1-9：崩溃日志是否真的读到了 —— 读取中不能显示成"暂无记录" */
  const [crashLogLoaded, setCrashLogLoaded] = useState(false);
  /** 设置内搜索：只过滤当前已渲染的分区（AI/快捷键含本地状态，不因搜索被挂载） */
  const [searchQuery, setSearchQuery] = useState('');
  /** D3 更新检查结果：只在用户点「检查更新」后才有值 */
  const [updateState, setUpdateState] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  /** P5：.md 文件关联状态（仅 Windows 支持） */
  const [fileAssociation, setFileAssociationState] = useState<FileAssociationState | null>(null);
  /** 平台集成能力（崩溃记录 / 检查更新）只在 Electron 下存在 */
  const isElectronMode = !isWebModeRaw;

  useEffect(() => {
    if (!isOpen || appInfo) return;
    let alive = true;
    void getAppInfo().then((result) => {
      if (alive && result.ok) setAppInfo(result.info);
    });
    return () => {
      alive = false;
    };
  }, [isOpen, appInfo]);

  useEffect(() => {
    if (!isOpen || appSettings) return;
    let alive = true;
    void getAppSettings().then((result) => {
      if (alive && result.ok) setAppSettings(result.settings);
    });
    return () => {
      alive = false;
    };
  }, [isOpen, appSettings]);

  useEffect(() => {
    // 用模块级常量判断平台，避免把每次渲染重建的局部变量塞进依赖数组
    if (!isOpen || isWebModeRaw) return;
    let alive = true;
    void readCrashLog().then((result) => {
      if (alive) {
        setCrashLog(result);
        setCrashLogLoaded(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isWebModeRaw) return;
    let alive = true;
    void getFileAssociation().then((result) => {
      if (alive && result.ok) setFileAssociationState(result);
    });
    return () => {
      alive = false;
    };
  }, [isOpen]);

  const handleToggleFileAssociation = useCallback(async (enabled: boolean) => {
    const result = await setFileAssociation(enabled)
    if (!result.ok) {
      toast.error(result.error || '设置文件关联失败')
      return
    }
    setFileAssociationState(result)
    toast.success(enabled ? '已把 .md 关联到本应用，双击 Markdown 文件即可打开' : '已恢复原来的 .md 关联')
  }, [])

  const refreshCrashLog = useCallback(async () => {
    setCrashLog(await readCrashLog());
    setCrashLogLoaded(true);
  }, []);

  const handleClearCrashLog = useCallback(async () => {
    const result = await clearCrashLog();
    if (result.ok) {
      setCrashLog({ ok: true, latest: null, entries: [] });
      setCrashLogLoaded(true);
      toast.success('崩溃记录已清空');
    } else {
      toast.error(result.error || '清空失败');
    }
  }, []);

  /**
   * O5：迁移数据目录。
   * 全站确认交互都走 confirmAction（回调式单例），所以这里也用回调串起来，
   * 而不是自己 await 一个弹窗结果。
   */
  const runMigration = useCallback(async () => {
    const result = await migrateDataDir()
    if (!result.ok) {
      if (!result.canceled && result.error) toast.error(result.error)
      return
    }

    const detail = [
      result.copiedDataFile ? '数据文件已复制' : '没有找到数据文件（只复制了备份）',
      result.copiedBackups > 0 ? '备份 ' + result.copiedBackups + ' 份已复制' : '没有备份需要复制',
    ].join('，')

    confirmAction({
      title: '迁移完成',
      message: detail + '。\n新目录：' + result.dataDir + '\n需要重启应用才会生效。',
      confirmText: '立即重启',
      cancelText: '稍后手动重启',
      onConfirm: () => {
        void (async () => {
          const relaunched = await relaunchApp()
          if (!relaunched.ok) toast.error(relaunched.error || '重启失败，请手动重启应用')
        })()
      },
    })
  }, [])

  const handleMigrateDataDir = useCallback(() => {
    confirmAction({
      title: '更换数据目录',
      message:
        '会把当前数据文件与备份复制到你选择的目录，然后需要重启应用生效。原目录的数据不会被删除。',
      confirmText: '选择目录…',
      onConfirm: () => {
        void runMigration()
      },
    })
  }, [runMigration])

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const result = await checkForUpdate();
      setUpdateState(result);
      if (!result.ok) {
        toast.error(result.error || '检查更新失败');
      } else if (!result.hasUpdate) {
        toast.success('已是最新版本');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '检查更新失败');
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  const handleToggleSetting = useCallback(async (key: keyof AppSettings, value: boolean) => {
    // 乐观更新：失败时用主进程返回的真实状态回滚（例如快捷键被占用会强制关回去）
    setAppSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    const result = await saveAppSettings({ [key]: value });
    if (!result.ok) {
      toast.error(result.error);
      if (result.settings) setAppSettings(result.settings);
    } else {
      setAppSettings(result.settings);
    }
  }, []);

  const handleOpenDataDir = useCallback(async () => {
    const result = await openDataDir();
    if (!result.ok) toast.error(result.error);
  }, []);

  const handleCopyDataDir = useCallback(async () => {
    if (!appInfo?.dataDir) return;
    await copyToClipboard(appInfo.dataDir);
    toast.success('已复制数据目录路径');
  }, [appInfo]);

  const handleCopyDiagnostics = useCallback(async () => {
    const lines = [
      '# 笔记 · 诊断信息',
      '时间：' + new Date().toLocaleString('zh-CN'),
      '版本：' + (appInfo?.version || (isWebModeRaw ? '浏览器模式' : '（读取中）')),
      '数据目录：' + (appInfo?.dataDir || (isWebModeRaw ? '浏览器模式（数据存在 IndexedDB）' : '（读取中）')),
      '错误日志条数：' + errorLogs.length,
      '启动耗时：' + formatPerfSnapshot(),
      '崩溃记录：' + (crashLog.latest ? crashLog.summary || crashLog.latest.message : '（无）'),
      '',
      formatErrorLogs(errorLogs.slice(-5)),
    ];
    await copyToClipboard(lines.join('\n'));
    toast.success('诊断信息已复制');
  }, [appInfo, errorLogs, crashLog]);

  const handleClearErrorLogs = useCallback(() => {
    clearErrorLogs();
    setErrorLogs([]);
    toast.success('错误日志已清空');
  }, []);

  /*
   * P0-1：切页签同样会丢草稿 —— AI 页签是条件渲染，切走即卸载，草稿与已输入的 API Key
   * 随之消失。关闭面板已有 aiSettingsDirty 守卫（requestClose、App 的全局 Esc 链），
   * 切页签必须走同一语义，否则"关不掉"的守卫拦不住"点一下页签"这条最常见的路径。
   */
  const handleSelectTab = useCallback(
    (tabId: SettingsTabId): void => {
      if (tabId === activeTab) return;
      if (aiSettingsDirty) {
        confirmAction({
          title: '放弃未保存的 AI 配置？',
          message: 'AI 设置页还有未保存的修改（可能包含尚未保存的 API Key），切换页签会丢失这些修改。',
          confirmText: '放弃并切换',
          cancelText: '留在 AI 设置',
          variant: 'danger',
          onConfirm: () => {
            uiActions.setAiSettingsDirty(false);
            uiActions.setSettingsTab(tabId);
          },
        });
        return;
      }
      uiActions.setSettingsTab(tabId);
    },
    [activeTab, aiSettingsDirty],
  );

  const handleSearchChange = useCallback((value: string): void => {
    setSearchQuery(value);
  }, []);

  /**
   * AI 配置在页签可见时加载：既覆盖手动点页签，也覆盖「去设置」直接以 ai 页签打开。
   * 异步回调里 setState（与 appInfo/appSettings 同一模式），不在 effect 中同步 setState。
   */
  useEffect(() => {
    if (!isOpen || activeTab !== 'ai' || aiConfig !== null) return;
    let alive = true;
    void aiClient.config.get().then((result) => {
      if (alive) setAiConfig(result);
    });
    return () => {
      alive = false;
    };
  }, [isOpen, activeTab, aiConfig]);

  /**
   * 关闭守卫：AI 页签有未保存修改（草稿或未保存的密钥）时先弹确认，
   * 避免用户点遮罩/× 把填了一半的配置静默丢掉。全局 Esc 链由 App 层消费
   * 同一个 aiSettingsDirty 标志，走同样的确认语义。
   */
  const requestClose = useCallback((): void => {
    if (aiSettingsDirty) {
      confirmAction({
        title: '有未保存的 AI 配置',
        message: 'AI 设置中还有未保存的修改（可能包含尚未保存的 API Key）。现在关闭会丢失这些修改，确定要关闭吗？',
        confirmText: '放弃修改并关闭',
        cancelText: '继续编辑',
        variant: 'danger',
        onConfirm: () => {
          uiActions.setAiSettingsDirty(false);
          onClose();
        },
      });
      return;
    }
    onClose();
  }, [aiSettingsDirty, onClose]);

  /*
   * 面板卸载 == 设置真正关闭（AppPanels 只在 showSettings 时挂载本面板）。
   * dirty 的清理点必须在这里，而不是 AiSettingsTab 的卸载 cleanup ——
   * 后者在切页签时也会执行，会把"有未保存的 AI 配置"守卫提前失效（P0-1）。
   */
  useEffect(() => () => {
    uiActions.setAiSettingsDirty(false);
  }, []);

  const [customColor, setCustomColor] = useState(() => {
    // 从 localStorage 加载自定义颜色
    try {
      return localStorage.getItem('notes-custom-primary-color') || '#1677ff';
    } catch {
      return '#1677ff';
    }
  });

  // 应用自定义颜色（主题感知：色阶由 applyCustomPrimaryColor 按亮/暗主题分别生成，
  // 切换主题时自动跟随，重启后由 useTheme 挂载时的 restore 恢复）
  const handleApplyCustomColor = (color: string): void => {
    setCustomColor(color);
    applyCustomPrimaryColor(color);
  };

  // 清除自定义主题色，恢复当前主题的默认色
  const handleResetCustomColor = (): void => {
    setCustomColor('#1677ff');
    applyCustomPrimaryColor(null);
  };

  /*
   * P1-6：界面缩放此前唯一入口是原生菜单（设置里只读显示 100%）——
   * 浏览器模式没有菜单栏，等于该设置不可达。范围与 electron/app-settings.cjs 的
   * clampZoom 一致（0.75~2，步进 0.1），写入经 notes:app-settings:set 由主进程
   * 同步应用到窗口（webContents.setZoomFactor）。
   */
  const handleZoomStep = useCallback(
    async (delta: number): Promise<void> => {
      const base = appSettings?.zoomFactor ?? 1;
      const next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((base + delta) * 100) / 100));
      if (next === base) return;
      const result = await saveAppSettings({ zoomFactor: next });
      if (!result.ok) {
        toast.error(result.error || '调整缩放失败');
        if (result.settings) setAppSettings(result.settings);
        return;
      }
      setAppSettings(result.settings);
    },
    [appSettings],
  );

  /*
   * 设置内搜索：按文本过滤当前已渲染的分区。
   * 不 setState —— 面板内容里有异步到位的行（appInfo / 崩溃日志 / 备份），
   * 每次渲染后重跑一遍，新到的行才会被同一份查询继续过滤。
   * AI / 快捷键页签含本地状态（草稿、录制中的按键），只在自己页签打开时渲染，
   * 不为了搜索把它们挂载出来 —— 那会重演"卸载丢草稿"（P0-1）。
   */
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const q = searchQuery.trim().toLowerCase();
    const sections = Array.from(panel.querySelectorAll<HTMLElement>('.settings-section'));
    for (const section of sections) {
      const children = Array.from(section.children) as HTMLElement[];
      let title: HTMLElement | null = null;
      let matched = 0;
      const flush = (): void => {
        if (title) title.hidden = q !== '' && matched === 0;
      };
      for (const child of children) {
        if (child.classList.contains('settings-section-title')) {
          flush();
          title = child;
          matched = 0;
          child.hidden = false;
          continue;
        }
        const hit = q === '' || (child.textContent ?? '').toLowerCase().includes(q);
        child.hidden = !hit;
        if (hit) matched += 1;
      }
      flush();
      const anyVisible = children.some((child) => !child.hidden);
      section.hidden = q !== '' && !anyVisible;
    }
  });

  if (!isOpen) return null;

  const tabs = [
    { id: 'general' as const, label: '通用', icon: '⚙️' },
    { id: 'editor' as const, label: '编辑器', icon: '📝' },
    { id: 'ai' as const, label: 'AI', icon: '🤖' },
    { id: 'shortcuts' as const, label: '快捷键', icon: '⌨️' },
  ];

  /** 搜索生效时把「通用 / 编辑器」两个纯外部状态页签一并铺开，跨页签定位分区 */
  const filterActive = searchQuery.trim() !== '';

  /*
   * P1-9：异步信息未到位时不能显示成"浏览器模式 / 开发版 / 暂无记录" ——
   * 数据位置是信任最敏感的字段，桌面版闪一句"数据存在 IndexedDB"会被当成数据存错了地方。
   * 浏览器模式的分支由 isWebMode 决定，与 getAppInfo 是否返回无关（web 下它恒为失败信封）。
   */
  const LOADING_TEXT = '读取中…';
  const dataPathText = isWebModeRaw ? '浏览器模式（数据存在 IndexedDB）' : appInfo ? appInfo.dataPath : LOADING_TEXT;
  const backupDirText = isWebModeRaw ? '浏览器模式没有本地备份' : appInfo ? appInfo.backupDir : LOADING_TEXT;
  const dataDirText = isWebModeRaw ? '浏览器模式（数据存在 IndexedDB）' : appInfo ? appInfo.dataDir : LOADING_TEXT;
  const versionText = appInfo ? appInfo.version : isWebModeRaw ? '浏览器模式（未打包运行）' : LOADING_TEXT;
  const crashLogText = !isElectronMode
    ? '浏览器模式没有崩溃日志'
    : !crashLogLoaded
      ? LOADING_TEXT
      : crashLog.ok && crashLog.latest
        ? crashLog.latest.message || '有记录'
        : '暂无记录';
  const zoomPercent = Math.round((appSettings?.zoomFactor ?? 1) * 100);

  return (
    <div className="settings-overlay" onClick={requestClose}>
      <div className="settings-panel" ref={panelRef} onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">⚙️ 设置</h2>
          <button
            className="settings-close"
            onClick={requestClose}
            aria-label="关闭设置"
            title="关闭设置（Esc）"
          >
            ×
          </button>
        </div>

        {/* 设置内搜索：只过滤已渲染的分区；AI / 快捷键页签含本地状态，不因搜索被挂载 */}
        <div className="settings-search">
          <input
            type="text"
            className="settings-search-input"
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="搜索设置项，如：缩放、备份、富文本"
            aria-label="搜索设置项"
          />
          {filterActive && (
            <button
              type="button"
              className="settings-search-clear"
              aria-label="清除设置搜索"
              onClick={() => handleSearchChange('')}
            >
              ×
            </button>
          )}
        </div>
        {filterActive && (
          <p className="settings-search-hint" role="status">
            正在「通用 / 编辑器」{activeTab !== 'general' && activeTab !== 'editor' && ' 与当前页签'}中筛选；
            AI 与快捷键页签含未保存状态，未自动展开，请切换页签继续查找。
          </p>
        )}

        <div className="settings-tabs" role="tablist" aria-label="设置页签">
          {tabs.map(tab => (
            <button
              key={tab.id}
              id={`settings-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls="settings-body"
              className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => handleSelectTab(tab.id)}
            >
              <span className="settings-tab-icon">{tab.icon}</span>
              <span className="settings-tab-text">{tab.label}</span>
            </button>
          ))}
        </div>

        <div
          className="settings-body"
          id="settings-body"
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
        >
          {(activeTab === 'general' || filterActive) && (
            <div className="settings-section">
              <h3 className="settings-section-title">外观</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">主题模式</span>
                  <span className="settings-item-desc">选择喜欢的主题风格</span>
                </div>
              </div>
              <div className="theme-grid">
                {THEME_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    className={`theme-option ${theme === option.id ? 'active' : ''}`}
                    onClick={() => setCustomTheme(option.id)}
                    title={option.description}
                  >
                    <span className="theme-option-icon">{option.icon}</span>
                    <span className="theme-option-name">{option.name}</span>
                  </button>
                ))}
              </div>
              
              <div className="settings-item" style={{ marginTop: '16px' }}>
                <div className="settings-item-info">
                  <span className="settings-item-label">主题色</span>
                  <span className="settings-item-desc">自定义应用的主色调</span>
                </div>
              </div>
              <div className="color-picker-section">
                <div className="preset-colors">
                  {PRESET_COLORS.map(color => (
                    <button
                      key={color.value}
                      className={`color-preset ${customColor === color.value ? 'active' : ''}`}
                      style={{ backgroundColor: color.value }}
                      onClick={() => handleApplyCustomColor(color.value)}
                      title={color.name}
                    />
                  ))}
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={customColor}
                      onChange={(e) => handleApplyCustomColor(e.target.value)}
                      className="color-input"
                    />
                    <span className="color-value">{customColor}</span>
                  </div>
                  <button className="color-reset-btn" onClick={handleResetCustomColor} title="恢复默认主题色">
                    恢复默认
                  </button>
                </div>
              </div>

              {/*
                P2-14：字体选择原在「编辑器」页签，但 [data-font] 定义的是 --font-family-base
                并作用于 body（index.css / themes.css）—— 它改的是**整个界面**的字体。
                放在编辑器页签下名实不符：想换界面字体的用户在「通用 → 外观」里找不到。
              */}
              <div className="settings-item" style={{ marginTop: '16px' }}>
                <div className="settings-item-info">
                  <span className="settings-item-label">界面与编辑器字体</span>
                  <span className="settings-item-desc">同时作用于整个界面与编辑器的正文字体</span>
                </div>
              </div>
              <div className="font-grid">
                {FONT_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    className={`font-option ${font === option.id ? 'active' : ''}`}
                    onClick={() => setCustomFont(option.id)}
                    title={option.description}
                  >
                    <span className="font-option-preview" style={{ fontFamily: option.id === 'mono' ? 'var(--font-family-mono)' : option.id === 'serif' ? 'var(--font-family-serif)' : 'inherit' }}>
                      {option.preview}
                    </span>
                    <span className="font-option-name">{option.name}</span>
                  </button>
                ))}
              </div>

              {/*
                P1-6：界面缩放此前唯一入口是原生菜单（这里只读显示百分比）——
                浏览器模式没有菜单栏，该设置等于不可达。现在提供可直接点击的控件。
              */}
              {appSettings && (
                <div className="settings-zoom-block">
                  <div className="settings-item">
                    <div className="settings-item-info">
                      <span className="settings-item-label" id="settings-zoom-label">界面缩放</span>
                      <span className="settings-item-desc">只影响本应用窗口，重启后保持</span>
                    </div>
                    <div className="zoom-controls" role="group" aria-labelledby="settings-zoom-label">
                      <button
                        type="button"
                        className="settings-zoom-btn"
                        aria-label="缩小界面（10%）"
                        disabled={zoomPercent <= Math.round(ZOOM_MIN * 100)}
                        onClick={() => void handleZoomStep(-ZOOM_STEP)}
                      >
                        −
                      </button>
                      <span className="zoom-value" aria-live="polite">{zoomPercent}%</span>
                      <button
                        type="button"
                        className="settings-zoom-btn"
                        aria-label="放大界面（10%）"
                        disabled={zoomPercent >= Math.round(ZOOM_MAX * 100)}
                        onClick={() => void handleZoomStep(ZOOM_STEP)}
                      >
                        ＋
                      </button>
                    </div>
                  </div>
                  <p className="settings-hint">
                    也可以按 <kbd>Ctrl</kbd>+<kbd>=</kbd> 放大、<kbd>Ctrl</kbd>+<kbd>-</kbd> 缩小，
                    或用菜单栏「视图」里的放大 / 缩小 / 重置缩放。
                  </p>
                </div>
              )}

              {appSettings && (
                <>
                  <h3 className="settings-section-title settings-about-title">系统集成</h3>
                  <div className="settings-about">
                    <label className="settings-toggle-row">
                      <input
                        type="checkbox"
                        checked={appSettings.closeToTray}
                        onChange={(e) => void handleToggleSetting('closeToTray', e.target.checked)}
                      />
                      <span>
                        关闭窗口时最小化到系统托盘
                        <em>关掉后，点窗口关闭按钮会直接退出应用</em>
                      </span>
                    </label>
                    <label className="settings-toggle-row">
                      <input
                        type="checkbox"
                        checked={appSettings.globalQuickNote}
                        onChange={(e) => void handleToggleSetting('globalQuickNote', e.target.checked)}
                      />
                      <span>
                        全局速记快捷键 <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd>
                        <em>在任意界面按下即可唤起便签；被其它程序占用时会自动关闭</em>
                      </span>
                    </label>
                    <label className="settings-toggle-row">
                      <input
                        type="checkbox"
                        checked={appSettings.autoLaunch}
                        onChange={(e) => void handleToggleSetting('autoLaunch', e.target.checked)}
                      />
                      <span>
                        开机自动启动
                        <em>登录系统后自动打开笔记；显示的是系统里的真实状态，在任务管理器里禁用后这里也会同步</em>
                      </span>
                    </label>
                    <label className="settings-toggle-row">
                      <input
                        type="checkbox"
                        checked={appSettings.notifyWhenBackground}
                        onChange={(e) => void handleToggleSetting('notifyWhenBackground', e.target.checked)}
                      />
                      <span>
                        后台完成时用系统通知提醒
                        <em>只在窗口不在前台时才弹系统通知，正看着应用时不打扰</em>
                      </span>
                    </label>
                    {fileAssociation?.supported && (
                      <label className="settings-toggle-row">
                        <input
                          type="checkbox"
                          checked={fileAssociation.enabled}
                          onChange={(e) => void handleToggleFileAssociation(e.target.checked)}
                        />
                        <span>
                          把 .md 文件关联到本应用
                          <em>
                            开启后双击 Markdown 文件会用本应用打开；关闭时会恢复你原来的关联
                            {fileAssociation.previous ? '（当前记录：' + fileAssociation.previous + '）' : ''}
                          </em>
                        </span>
                      </label>
                    )}
                  </div>
                </>
              )}

              <h3 className="settings-section-title settings-about-title">数据与备份</h3>
              {/* 数据在哪、备份在哪必须能看见（O5）：出问题时用户要能自己找到文件 */}
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">数据文件</span>
                  <span className="settings-about-value settings-about-path" title={appInfo?.dataPath ?? ''}>
                    {dataPathText}
                  </span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">备份目录</span>
                  <span className="settings-about-value settings-about-path" title={appInfo?.backupDir ?? ''}>
                    {backupDirText}
                  </span>
                </div>
                <div className="settings-about-actions">
                  <button className="settings-about-btn" onClick={handleCopyDataDir} disabled={!appInfo?.dataDir}>
                    复制数据目录路径
                  </button>
                  <button
                    className="settings-about-btn"
                    onClick={handleMigrateDataDir}
                    disabled={!isElectronMode}
                  >
                    更换数据目录…
                  </button>
                </div>
                <p className="settings-hint">
                  数据只存在本机。更换数据目录会把数据文件与备份复制到新位置并重启生效，
                  <strong>原目录不会被删除</strong>，确认新位置一切正常后你可以自行清理。
                </p>
              </div>

              <BackupPanel />

              <h3 className="settings-section-title settings-about-title">诊断</h3>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">错误日志</span>
                  <span className="settings-about-value">
                    {errorLogs.length > 0 ? errorLogs.length + ' 条' : '暂无记录'}
                  </span>
                </div>
                <div className="settings-about-actions">
                  <button className="settings-about-btn" onClick={handleCopyDiagnostics}>
                    复制诊断信息
                  </button>
                  <button
                    className="settings-about-btn"
                    onClick={() => setShowErrorLogs(!showErrorLogs)}
                    disabled={errorLogs.length === 0}
                  >
                    {showErrorLogs ? '收起日志' : '查看日志'}
                  </button>
                  <button
                    className="settings-about-btn"
                    onClick={handleClearErrorLogs}
                    disabled={errorLogs.length === 0}
                  >
                    清空
                  </button>
                </div>
                {showErrorLogs && (
                  <pre className="settings-error-logs">{formatErrorLogs(errorLogs)}</pre>
                )}

                {/* D5：崩溃记录。只存本机，什么时候发出去由用户决定 */}
                <div className="settings-about-row">
                  <span className="settings-about-label">崩溃记录</span>
                  <span className="settings-about-value">{crashLogText}</span>
                </div>
                <div className="settings-about-actions">
                  <button
                    className="settings-about-btn"
                    onClick={() => void refreshCrashLog()}
                    disabled={!isElectronMode}
                  >
                    刷新
                  </button>
                  <button
                    className="settings-about-btn"
                    onClick={handleClearCrashLog}
                    disabled={!isElectronMode}
                  >
                    清空崩溃记录
                  </button>
                </div>
                <p className="settings-hint">
                  崩溃与异常只记录在本机（不含正文内容），不会自动上报。需要反馈时点「复制诊断信息」，
                  由你决定发给谁。
                </p>
              </div>

              <h3 className="settings-section-title settings-about-title">关于</h3>
              <div className="settings-about">
                <div className="settings-about-row">
                  <span className="settings-about-label">版本</span>
                  <span className="settings-about-value">{versionText}</span>
                </div>
                <div className="settings-about-row">
                  <span className="settings-about-label">数据目录</span>
                  <span className="settings-about-value settings-about-path" title={appInfo?.dataDir ?? ''}>
                    {dataDirText}
                  </span>
                </div>
                {/* D3：检查更新。只提示，不静默下载安装（当前没有签名与发布通道） */}
                <div className="settings-about-row">
                  <span className="settings-about-label">更新</span>
                  <span className="settings-about-value">
                    {checkingUpdate
                      ? '正在检查…'
                      : updateState?.hasUpdate
                        ? '有新版本 ' + (updateState.latest ?? '')
                        : updateState?.error
                          ? updateState.error
                          : updateState
                            ? '已是最新版本'
                            : '未检查'}
                  </span>
                </div>
                {updateState?.hasUpdate && updateState.notes && (
                  <pre className="settings-error-logs">{updateState.notes}</pre>
                )}
                <div className="settings-about-actions">
                  <button
                    className="settings-about-btn"
                    onClick={() => void handleCheckUpdate()}
                    disabled={checkingUpdate || !isElectronMode}
                  >
                    检查更新
                  </button>
                  {updateState?.hasUpdate && updateState.url && (
                    <button
                      className="settings-about-btn"
                      onClick={() => openExternal(updateState.url as string)}
                    >
                      打开下载页
                    </button>
                  )}
                </div>
                <div className="settings-about-actions">
                  <button
                    className="settings-about-btn"
                    onClick={handleOpenDataDir}
                    disabled={!appInfo?.dataDir}
                  >
                    打开数据目录
                  </button>
                  <button className="settings-about-btn" onClick={requestOnboarding}>
                    重看新手引导
                  </button>
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'editor' || filterActive) && (
            <div className="settings-section">
              <h3 className="settings-section-title">编辑器设置</h3>
              <div className="settings-item">
                <div className="settings-item-info">
                  {/* P2-14：label 关联（读屏此前只念"组合框"，界面上的标签是 span） */}
                  <label className="settings-item-label" htmlFor="settings-font-size">字号大小</label>
                  <span className="settings-item-desc">调整编辑器文字大小</span>
                </div>
                <select
                  id="settings-font-size"
                  className="settings-select"
                  value={fontSize}
                  onChange={(e) => setFontSize(e.target.value)}
                >
                  <option value="12px">12px</option>
                  <option value="13px">13px</option>
                  <option value="14px">14px</option>
                  <option value="15px">15px</option>
                  <option value="16px">16px</option>
                  <option value="18px">18px</option>
                  <option value="20px">20px</option>
                </select>
              </div>
              <div className="settings-item">
                <div className="settings-item-info">
                  <span className="settings-item-label">富文本编辑器</span>
                  <span className="settings-item-desc">
                    标题、列表等在输入时即时成形（语雀式）。关闭后回到纯 Markdown 源码编辑。
                  </span>
                </div>
                <label className="settings-toggle-row settings-toggle-inline">
                  <input
                    type="checkbox"
                    checked={richEditorEnabled}
                    onChange={(e) => setRichEditorEnabled(e.target.checked)}
                  />
                  <span>{richEditorEnabled ? '已开启' : '已关闭'}</span>
                </label>
              </div>
            </div>
          )}

          {activeTab === 'ai' && <AiSettingsTab initial={aiConfig} onViewChange={setAiConfig} />}

          {activeTab === 'shortcuts' && <ShortcutsTab />}
        </div>
      </div>
    </div>
  );
}