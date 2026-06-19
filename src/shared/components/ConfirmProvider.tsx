import React, { useState, useCallback } from 'react'

interface ConfirmOptions {
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  type?: 'danger' | 'warning' | 'info'
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = React.createContext<ConfirmContextType | null>(null)

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const [resolve, setResolve] = useState<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((res) => {
      setOptions(opts)
      setResolve(() => res)
    })
  }, [])

  const handleConfirm = useCallback(() => {
    resolve?.(true)
    setOptions(null)
    setResolve(null)
  }, [resolve])

  const handleCancel = useCallback(() => {
    resolve?.(false)
    setOptions(null)
    setResolve(null)
  }, [resolve])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {options && (
        <div className="confirm-dialog-overlay">
          <div className={`confirm-dialog confirm-dialog-${options.type || 'info'}`}>
            <h3>{options.title}</h3>
            <p>{options.message}</p>
            <div className="confirm-dialog-actions">
              <button onClick={handleCancel}>
                {options.cancelText || '取消'}
              </button>
              <button onClick={handleConfirm} className="btn-primary">
                {options.confirmText || '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export const useConfirm = () => {
  const context = React.useContext(ConfirmContext)
  if (!context) {
    throw new Error('useConfirm must be used within ConfirmProvider')
  }
  return context
}