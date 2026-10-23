import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { getAppInfo, openDataDir } from '@/services/storage'
import { copyToClipboard } from '@/utils/clipboard'
import { formatErrorLogs, readErrorLogs } from '@/utils/errorLog'
import { formatPerfSnapshot } from '@/utils/perfMarks'
import { requestOnboarding } from '@/utils/onboarding'
import { toast } from '@/components/common/Toast'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface HelpDialogProps {
  isOpen: boolean
  onClose: () => void
  onOpenShortcuts: () => void
}

/**
 * 帮助中心（O6）。
 *
 * 此前侧栏的「帮助中心」实际打开的是快捷键列表 —— 名实不符：
 * 用户遇到"数据在哪 / 怎么备份 / 出问题怎么反馈"时没有地方可看。
 * 这里把四类信息收在一处：上手、数据与安全、效率、反馈与诊断。
 */
export default function HelpDialog({ isOpen, onClose, onOpenShortcuts }: HelpDialogProps): JSX.Element | null {
  const trapRef = useFocusTrap<HTMLDivElement>()
  const [appInfo, setAppInfo] = useState<{ version: string; dataDir: string } | null>(null)

  useEffect(() => {
    if (!isOpen || appInfo) return
    let alive = true
    void getAppInfo().then((result) => {
      if (alive && result.ok) setAppInfo({ version: result.info.version, dataDir: result.info.dataDir })
    })
    return () => {
      alive = false
    }
  }, [isOpen, appInfo])

  const handleOpenDataDir = useCallback(async () => {
    const result = await openDataDir()
    if (!result.ok) toast.error(result.error)
  }, [])

  const handleCopyDiagnostics = useCallback(async () => {
    const logs = readErrorLogs()
    const lines = [
      '# 笔记 · 诊断信息',
      '时间：' + new Date().toLocaleString('zh-CN'),
      '版本：' + (appInfo?.version || '开发版'),
      '数据目录：' + (appInfo?.dataDir || '浏览器模式'),
      '错误日志条数：' + logs.length,
      '启动耗时：' + formatPerfSnapshot(),
      '',
      formatErrorLogs(logs.slice(-5)),
    ]
    await copyToClipboard(lines.join('\n'))
    toast.success('诊断信息已复制，可直接粘贴给开发者')
  }, [appInfo])

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={trapRef} className="modal-content help-dialog" role="dialog" aria-modal="true" aria-label="帮助中心" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <h2>帮助中心</h2>
          <button type="button" className="help-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <section className="help-section">
          <h3>快速上手</h3>
          <ul>
            <li>在空白行输入 <code>/</code> 唤起快捷命令：表格、公式、流程图、待办</li>
            <li><code>Ctrl+K</code> 搜索全部文档，<code>Ctrl+P</code> 按标题直达任意文档</li>
            <li>把 <code>.md</code> 文件拖到窗口任意位置即可导入为新文档</li>
            <li>选中文字可以用 AI 改写、润色或翻译</li>
          </ul>
        </section>

        <section className="help-section">
          <h3>数据与安全</h3>
          <ul>
            <li>所有数据只存在本机，位置：<code>{appInfo?.dataDir || '（浏览器模式下存在 IndexedDB）'}</code></li>
            <li>每次保存后自动生成备份（最多保留 10 份），恢复前还会额外留一份当前快照</li>
            <li>需要回退时：侧栏「更多 → 从备份恢复」或「设置 → 数据与备份」</li>
            <li>异常退出后重启会主动提示，并可用草稿或备份找回内容</li>
          </ul>
          {appInfo?.dataDir && (
            <div className="help-actions">
              <button type="button" className="help-btn" onClick={handleOpenDataDir}>
                打开数据目录
              </button>
            </div>
          )}
        </section>

        <section className="help-section">
          <h3>效率</h3>
          <p>常用：<code>Ctrl+S</code> 保存、<code>Ctrl+F</code> 文档内查找、<code>Ctrl+/</code> 查看全部快捷键、<code>Ctrl+Alt+←/→</code> 切换相邻文档。</p>
          <div className="help-actions">
            <button type="button" className="help-btn" onClick={onOpenShortcuts}>
              查看全部快捷键
            </button>
            <button type="button" className="help-btn" onClick={requestOnboarding}>
              重看新手引导
            </button>
          </div>
        </section>

        <section className="help-section">
          <h3>遇到问题</h3>
          <p>先复制诊断信息（版本、数据目录、最近错误日志），再连同问题描述一起反馈，能省掉很多来回确认。</p>
          <div className="help-actions">
            <button type="button" className="help-btn primary" onClick={handleCopyDiagnostics}>
              复制诊断信息
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}
