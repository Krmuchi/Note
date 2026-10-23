import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { BackupInfo } from '@/types'
import {
  isWebMode,
  listLocalBackups,
  openDataDir,
  restoreLocalBackup,
} from '@/services/storage'
import { useNotesStore } from '@/store'
import { toast } from '@/components/common/Toast'
import { confirmAction } from '@/hooks/useConfirmAction'
import { useAsyncAction } from '@/hooks/useAsyncAction'
import { formatBackupSize, formatBackupTime, readLastBackupAt, watchLastBackupAt } from '@/utils/backupInfo'

/**
 * 备份状态 + 一键恢复（R4）。
 *
 * 侧栏「更多 → 从备份恢复」与 设置 → 数据与备份 共用同一个组件：
 * 恢复是**覆盖式**的危险操作，逻辑绝不能存在两份（一份改了另一份没改，迟早出事）。
 */
export default function BackupPanel(): JSX.Element {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null)
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(() => readLastBackupAt())
  // 恢复是覆盖式写盘：进行中禁止再次触发，"正在恢复"提示由 runAsync 的 pendingMsg 承担
  const { run: runAsync, loading: restoring } = useAsyncAction()

  useEffect(() => watchLastBackupAt(setLastBackupAt), [])

  // setState 只出现在 .then 回调里：effect 内同步 setState 会触发级联渲染（lint 规则）
  const applyResult = useCallback((result: Awaited<ReturnType<typeof listLocalBackups>>) => {
    if (!result.ok) {
      // 浏览器模式本来就没有本地备份，没必要弹错
      if (!isWebMode) toast.error(result.error)
      setBackups([])
      return
    }
    setBackups(result.backups)
  }, [])

  useEffect(() => {
    let alive = true
    void listLocalBackups().then((result) => {
      if (alive) applyResult(result)
    })
    return () => {
      alive = false
    }
  }, [applyResult])

  const refresh = useCallback(() => {
    void listLocalBackups().then(applyResult)
  }, [applyResult])

  const handleOpenDataDir = useCallback(async () => {
    const result = await openDataDir()
    if (!result.ok) toast.error(result.error)
  }, [])

  const handleRestore = useCallback((info: BackupInfo) => {
    confirmAction({
      title: '从备份恢复',
      message: '将用 ' + new Date(info.createdAt).toLocaleString('zh-CN') + ' 的备份覆盖当前全部数据。恢复前会自动留存当前数据的一份快照，可再次恢复回来。是否继续？',
      confirmText: '恢复并覆盖',
      variant: 'danger',
      onConfirm: () => {
        // 返回 Promise 供调用方/测试等待完成（ConfirmConfig 签名为 () => void，返回值被忽略）
        return runAsync(async () => {
          const result = await restoreLocalBackup(info.name)
          if (!result.ok) {
            toast.error('恢复失败：' + result.error)
            return
          }
          // 主进程已覆盖磁盘文件，重新加载让内存状态与之一致
          await useNotesStore.getState().loadNotes()
          toast.success('已从备份恢复数据')
          void refresh()
        }, { pendingMsg: '正在从备份恢复…' })
      },
    })
  }, [refresh, runAsync])

  return (
    <div className="backup-panel-body">
      <div className="backup-status">
        <span>上次自动备份：{lastBackupAt ? formatBackupTime(lastBackupAt) : '尚未生成'}</span>
        <span>共 {backups?.length ?? '…'} 份</span>
        <button type="button" className="backup-status-btn" onClick={() => void refresh()}>
          刷新
        </button>
        {!isWebMode && (
          <button type="button" className="backup-status-btn" onClick={handleOpenDataDir}>
            打开数据目录
          </button>
        )}
      </div>

      <p className="backup-desc">恢复会覆盖当前全部数据，且恢复前会自动留存一份当前数据快照。</p>

      <div className="backup-list">
        {backups === null ? (
          <div className="backup-empty">正在读取备份…</div>
        ) : backups.length === 0 ? (
          <div className="backup-empty">暂无本地备份（编辑文档并保存后会自动生成）</div>
        ) : (
          backups.map((info) => (
            <button key={info.name} type="button" className="backup-item" disabled={restoring} onClick={() => handleRestore(info)}>
              <span className="backup-item-time">
                {new Date(info.createdAt).toLocaleString('zh-CN')}
                {!info.auto && <span className="backup-item-tag">恢复前快照</span>}
              </span>
              <span className="backup-item-size">{restoring ? '恢复中…' : formatBackupSize(info.size)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
