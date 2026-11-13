import { useState, useCallback, useEffect } from 'react'

export interface ConfirmConfig {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
}

/** 当前待确认项（App 层只挂载一个 ConfirmDialog，故用模块级单例承载） */
let pending: ConfirmConfig | null = null
const listeners = new Set<(config: ConfirmConfig | null) => void>()

function publish(config: ConfirmConfig | null): void {
  pending = config
  listeners.forEach((listener) => listener(config))
}

/**
 * 全局确认弹窗发射器。
 * 任何模块（含 store slice、深层组件）都可直接调用，由 App 层挂载的唯一 ConfirmDialog 渲染。
 * 目的是让所有确认交互走同一套样式与键盘行为（danger 默认聚焦"取消"、Esc 隔离），
 * 而不是各组件自绘 .confirm-dialog DOM。
 */
export function confirmAction(config: ConfirmConfig): void {
  publish(config)
}

/**
 * 当前是否有待确认弹窗。
 *
 * 供其它常驻弹窗判断"该不该让位"：LoadFailureDialog 在 capture 阶段吞掉 Esc
 * （数据未加载时它是唯一出口，不允许 Esc 关掉），但用户从它里面点「从备份恢复」
 * 会叠一个 ConfirmDialog —— 此时 Esc 必须交给确认框取消，而不是被吞掉。
 */
export function hasPendingConfirm(): boolean {
  return pending !== null
}

export const useConfirmAction = (): {
  confirmConfig: ConfirmConfig | null
  confirm: (cfg: ConfirmConfig) => void
  handleConfirm: () => void
  handleCancel: () => void
} => {
  const [config, setConfig] = useState<ConfirmConfig | null>(pending)

  useEffect(() => {
    listeners.add(setConfig)
    return () => {
      listeners.delete(setConfig)
    }
  }, [])

  const confirm = useCallback((cfg: ConfirmConfig): void => {
    publish(cfg)
  }, [])

  const handleConfirm = useCallback((): void => {
    const active = pending
    publish(null)
    active?.onConfirm()
  }, [])

  const handleCancel = useCallback((): void => {
    publish(null)
  }, [])

  return {
    confirmConfig: config,
    confirm,
    handleConfirm,
    handleCancel,
  }
}
