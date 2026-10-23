import React, { useCallback, useEffect, useState } from 'react'
import type { BackupInfo } from '@/types'
import { useNotesStore } from '@/store'
import { getAppInfo, listLocalBackups, openDataDir, restoreLocalBackup } from '@/services/storage'
import { toast } from '@/components/common/Toast'
import { confirmAction } from '@/hooks/useConfirmAction'
import { copyToClipboard } from '@/utils/clipboard'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface LoadFailureDialogProps {
  /** 加载失败原因（来自 coreSlice.loadError） */
  message: string
}

/**
 * 数据加载失败恢复引导。
 *
 * 背景：coreSlice.loadNotes 失败时会置 loadFailed 并**阻止一切自动保存**
 * （防止内存空状态覆盖磁盘上的有效数据）。但旧实现没有任何 UI 出口：
 * 用户看到的是一个空应用，而且此后新写的内容都不会落盘 —— 事实上的数据丢失循环。
 *
 * 本弹窗是该失败状态唯一的出口：重试 / 从备份恢复 / 打开数据目录 / 复制诊断信息。
 * 刻意不允许点击遮罩关闭，避免用户随手点掉后再也想不起来处理。
 */
export const LoadFailureDialog: React.FC<LoadFailureDialogProps> = ({ message }) => {
  const [showBackups, setShowBackups] = useState(false)
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const loadNotes = useNotesStore((s) => s.loadNotes)
  const trapRef = useFocusTrap<HTMLDivElement>()

  const handleRetry = useCallback(async () => {
    setBusy(true)
    await loadNotes()
    setBusy(false)
    if (!useNotesStore.getState().loadFailed) {
      toast.success('数据已重新加载')
    } else {
      toast.error('仍然无法读取数据文件，请尝试从备份恢复')
    }
  }, [loadNotes])

  const handleOpenBackups = useCallback(async () => {
    setShowBackups(true)
    const result = await listLocalBackups()
    if (!result.ok) {
      toast.error(result.error)
      setBackups([])
      return
    }
    setBackups(result.backups)
  }, [])

  const handleRestore = useCallback((info: BackupInfo) => {
    confirmAction({
      title: '从备份恢复',
      message: `将用 ${new Date(info.createdAt).toLocaleString('zh-CN')} 的备份覆盖当前数据文件。恢复前会自动留存当前文件的一份快照，可再次恢复回来。是否继续？`,
      confirmText: '恢复并覆盖',
      variant: 'danger',
      onConfirm: async () => {
        setBusy(true)
        const result = await restoreLocalBackup(info.name)
        if (!result.ok) {
          toast.error(`恢复失败：${result.error}`)
          setBusy(false)
          return
        }
        await loadNotes()
        setBusy(false)
        if (useNotesStore.getState().loadFailed) {
          toast.error('已覆盖数据文件，但仍无法读取，请复制诊断信息后手工处理')
        } else {
          toast.success('已从备份恢复数据')
        }
      },
    })
  }, [loadNotes])

  const handleOpenDir = useCallback(async () => {
    const result = await openDataDir()
    if (!result.ok) toast.error(result.error)
  }, [])

  const handleCopyDiagnostics = useCallback(async () => {
    const info = await getAppInfo()
    const lines = [
      '# 笔记 · 数据加载失败诊断',
      `时间：${new Date().toLocaleString('zh-CN')}`,
      `错误：${message}`,
      `版本：${info.ok ? info.info.version || '未知' : '未知'}`,
      `数据文件：${info.ok ? info.info.dataPath : '未知'}`,
      `数据目录：${info.ok ? info.info.dataDir : '未知'}`,
      `备份目录：${info.ok ? info.info.backupDir : '未知'}`,
      `已发现备份：${backups ? backups.length : '未读取'}`,
    ]
    await copyToClipboard(lines.join('\n'))
    toast.success('诊断信息已复制')
  }, [message, backups])

  // Esc 只拦截不关闭：数据尚未加载，弹窗是唯一出口
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  if (dismissed) return null

  return (
    <div
      className="confirm-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="数据加载失败"
    >
      <div ref={trapRef} className="confirm-dialog confirm-dialog-danger load-failure-dialog">
        <div className="confirm-dialog-header">
          <span className="confirm-dialog-icon" aria-hidden="true">
            ⚠️
          </span>
          <h3>数据加载失败</h3>
        </div>

        <p className="load-failure-message">{message}</p>

        <p className="load-failure-note">
          为防止覆盖磁盘上已有的数据，<strong>自动保存已暂停</strong>。
          请先完成下面的恢复动作，否则本次打开之后的编辑不会保存。
        </p>

        {showBackups && (
          <div className="load-failure-backups" aria-label="本地备份列表">
            {backups === null ? (
              <div className="load-failure-backups-empty">正在读取备份…</div>
            ) : backups.length === 0 ? (
              <div className="load-failure-backups-empty">
                没有可用的本地备份。可先「打开数据目录」手工备份或修复 notes-data.json。
              </div>
            ) : (
              backups.map((info) => (
                <button
                  key={info.name}
                  type="button"
                  className="load-failure-backup-item"
                  disabled={busy}
                  onClick={() => handleRestore(info)}
                >
                  <span className="load-failure-backup-time">
                    {new Date(info.createdAt).toLocaleString('zh-CN')}
                    {!info.auto && <em>（恢复前快照）</em>}
                  </span>
                  <span className="load-failure-backup-size">
                    {Math.max(1, Math.round(info.size / 1024))} KB
                  </span>
                </button>
              ))
            )}
          </div>
        )}

        <div className="load-failure-actions">
          <button type="button" className="btn-primary" disabled={busy} onClick={handleRetry}>
            重试加载
          </button>
          <button type="button" disabled={busy} onClick={handleOpenBackups}>
            从备份恢复
          </button>
          <button type="button" onClick={handleOpenDir}>
            打开数据目录
          </button>
          <button type="button" onClick={handleCopyDiagnostics}>
            复制诊断信息
          </button>
          <button type="button" className="load-failure-dismiss" onClick={() => setDismissed(true)}>
            稍后处理
          </button>
        </div>
      </div>
    </div>
  )
}

export default LoadFailureDialog
