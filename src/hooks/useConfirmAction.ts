import { useState, useCallback } from 'react'

interface ConfirmConfig {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
  onConfirm: () => void
}

export const useConfirmAction = () => {
  const [config, setConfig] = useState<ConfirmConfig | null>(null)

  const confirm = useCallback((cfg: ConfirmConfig) => {
    setConfig(cfg)
  }, [])

  const handleConfirm = useCallback(() => {
    if (config) {
      config.onConfirm()
      setConfig(null)
    }
  }, [config])

  const handleCancel = useCallback(() => {
    setConfig(null)
  }, [])

  return {
    confirmConfig: config,
    confirm,
    handleConfirm,
    handleCancel,
  }
}