import React, { useCallback, useEffect, useState } from 'react'
import { useNotesStore } from '@/store'
import { getAppInfo, importMarkdownDocs, openDataDir } from '@/services/storage'
import { toast } from '@/components/common/Toast'
import { markOnboardingDone } from '@/utils/onboarding'
import { useFocusTrap } from '@/hooks/useFocusTrap'

interface OnboardingDialogProps {
  onClose: () => void
  /** 由 App 负责解析目标知识库并创建文档，弹窗只提供标题 */
  onCreateFirstDoc: (title: string) => void
}

const STEPS = ['欢迎', '导入已有笔记', '写下第一篇'] as const

/**
 * 首次启动引导（体验优化方案 O1）。
 *
 * 目标是让新用户在 60 秒内知道"这是什么、数据放哪、第一步做什么"，
 * 而不是打开后只看到一篇静态欢迎文档。
 * 「重看引导」入口在设置 → 通用 → 关于。
 */
export const OnboardingDialog: React.FC<OnboardingDialogProps> = ({ onClose, onCreateFirstDoc }) => {
  const trapRef = useFocusTrap<HTMLDivElement>()
  const [step, setStep] = useState(0)
  const [title, setTitle] = useState('我的第一篇笔记')
  const [busy, setBusy] = useState(false)
  const [dataDir, setDataDir] = useState<string | null>(null)
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    let alive = true
    void getAppInfo().then((result) => {
      if (!alive || !result.ok) return
      setDataDir(result.info.dataDir)
      setVersion(result.info.version)
    })
    return () => {
      alive = false
    }
  }, [])

  /** 任何离开路径都算"看过引导"，避免下次启动重复弹出（需要时可从设置里重看） */
  const finish = useCallback(() => {
    markOnboardingDone()
    onClose()
  }, [onClose])

  const handleOpenDataDir = useCallback(async () => {
    const result = await openDataDir()
    if (!result.ok) toast.error(result.error)
  }, [])

  const handleImportMarkdown = useCallback(async () => {
    setBusy(true)
    try {
      const docs = await importMarkdownDocs()
      if (!docs || docs.length === 0) return

      const state = useNotesStore.getState()
      const active = state.notebooks.find((nb) => nb.id === state.activeNotebookId)
      const notebookId = active ? active.id : state.notebooks[0]?.id ?? state.createNotebook('我的知识库')
      docs.forEach((doc) => {
        state.createDoc(notebookId, null, { title: doc.title, content: doc.content })
      })
      toast.success(`已导入 ${docs.length} 个文档`)
      finish()
    } catch (err) {
      toast.error(`导入失败：${err instanceof Error ? err.message : '未知错误'}`)
    } finally {
      setBusy(false)
    }
  }, [finish])

  const handleCreate = useCallback(() => {
    const trimmed = title.trim()
    if (!trimmed) return
    markOnboardingDone()
    onCreateFirstDoc(trimmed)
  }, [title, onCreateFirstDoc])

  return (
    <div className="confirm-dialog-overlay" role="dialog" aria-modal="true" aria-label="新手引导">
      <div ref={trapRef} className="confirm-dialog onboarding-dialog">
        <div className="onboarding-steps" aria-hidden="true">
          {STEPS.map((label, index) => (
            <span
              key={label}
              className={`onboarding-step-dot ${index === step ? 'active' : ''} ${index < step ? 'done' : ''}`}
            >
              {index + 1}
            </span>
          ))}
        </div>

        {step === 0 && (
          <div className="onboarding-body">
            <h3>欢迎使用「笔记」</h3>
            <p className="onboarding-lead">
              一个本地优先的 Markdown 笔记应用 —— 知识库 → 文档树 → 编辑器，数据只存在你自己的机器上。
            </p>
            <ul className="onboarding-points">
              <li>
                <strong>数据位置</strong>
                <span>{dataDir ?? '（浏览器模式下没有本地数据目录）'}</span>
              </li>
              <li>
                <strong>自动备份</strong>
                <span>每次保存后自动生成备份（最多保留 10 份），可从侧栏「更多 → 从备份恢复」找回</span>
              </li>
              {version && (
                <li>
                  <strong>版本</strong>
                  <span>{version}</span>
                </li>
              )}
            </ul>
            {dataDir && (
              <button type="button" className="onboarding-link-btn" onClick={handleOpenDataDir}>
                打开数据目录
              </button>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-body">
            <h3>有现成的笔记吗？</h3>
            <p className="onboarding-lead">
              可以把已有的 Markdown 文件（.md / .markdown / .txt）一次性导入，标题取文件名或首个标题。
            </p>
            <button type="button" className="btn-primary onboarding-primary-btn" disabled={busy} onClick={handleImportMarkdown}>
              {busy ? '导入中…' : '选择 Markdown 文件导入'}
            </button>
            <p className="onboarding-hint">
              已有本应用的完整备份（.json）？先跳过，稍后用侧栏「更多 → 导入备份文件」合并进来。
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-body">
            <h3>写下第一篇</h3>
            <p className="onboarding-lead">起个标题，马上开始写。之后随时可以在左侧文档树里改。</p>
            <input
              className="onboarding-title-input"
              value={title}
              autoFocus
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate()
              }}
              placeholder="文档标题"
              aria-label="文档标题"
            />
            <ul className="onboarding-points onboarding-points-compact">
              <li>
                <strong>Ctrl+K</strong>
                <span>全局搜索</span>
              </li>
              <li>
                <strong>/</strong>
                <span>在空行唤起快捷命令（表格、公式、流程图）</span>
              </li>
              <li>
                <strong>Ctrl+/</strong>
                <span>查看全部快捷键</span>
              </li>
            </ul>
          </div>
        )}

        <div className="onboarding-actions">
          <button type="button" className="onboarding-skip" onClick={finish}>
            跳过
          </button>
          <span className="onboarding-actions-spacer" />
          {step > 0 && (
            <button type="button" onClick={() => setStep((s) => s - 1)}>
              上一步
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary" onClick={() => setStep((s) => s + 1)}>
              下一步
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={handleCreate} disabled={!title.trim()}>
              创建并开始写作
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default OnboardingDialog
