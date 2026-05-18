// 导入 React 相关 hooks
import { useState, useEffect, useCallback } from "react";

/**
 * Toast 组件属性接口
 */
export interface ToastProps {
  id: string;                                    // Toast 唯一标识
  type: "success" | "error" | "warning" | "info"; // 提示类型
  message: string;                               // 提示消息
  onClose: (id: string) => void;                 // 关闭回调函数
  duration?: number;                             // 自动关闭时长（毫秒），默认为 3000
}

// Toast 类型与图标的映射
const iconMap = {
  success: "✓",   // 成功图标
  error: "✗",     // 错误图标
  warning: "⚠️",  // 警告图标
  info: "ℹ️",     // 信息图标
};

/**
 * Toast 单个提示项组件
 */
export function ToastItem({ id, type, message, onClose, duration = 3000 }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false); // 退出动画状态

  // 设置自动关闭定时器
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsExiting(true);           // 开始退出动画
      setTimeout(() => onClose(id), 200); // 动画结束后关闭
    }, duration);

    return () => clearTimeout(timer); // 清理定时器
  }, [id, duration, onClose]);

  // 手动关闭处理
  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => onClose(id), 200);
  }, [id, onClose]);

  return (
    <div className={`toast toast-${type} ${isExiting ? "exit" : "enter"}`}>
      <span className="toast-icon">{iconMap[type]}</span>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={handleClose}>
        ×
      </button>
    </div>
  );
}

/**
 * Toast 容器组件属性接口
 */
export interface ToastContainerProps {
  toasts: ToastProps[];  // Toast 列表
  onClose: (id: string) => void; // 关闭回调
}

/**
 * Toast 容器组件
 */
export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} onClose={onClose} />
      ))}
    </div>
  );
}

// Toast 全局 ID 计数器
let toastId = 0;

/**
 * Toast 消息接口
 */
export interface ToastMessage {
  type: "success" | "error" | "warning" | "info";
  message: string;
  duration?: number;
}

/**
 * Toast 自定义 Hook
 * 提供 Toast 的添加和管理功能
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastProps[]>([]); // Toast 状态列表

  // 移除指定 Toast
  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // 添加新 Toast
  const addToast = useCallback((message: ToastMessage) => {
    const id = `toast-${++toastId}`;
    setToasts((prev) => [...prev, { ...message, id, onClose: () => removeToast(id) }]);
    return id;
  }, [removeToast]);

  // 快捷方法：成功提示
  const success = useCallback((message: string, duration?: number) => {
    return addToast({ type: "success", message, duration });
  }, [addToast]);

  // 快捷方法：错误提示
  const error = useCallback((message: string, duration?: number) => {
    return addToast({ type: "error", message, duration });
  }, [addToast]);

  // 快捷方法：警告提示
  const warning = useCallback((message: string, duration?: number) => {
    return addToast({ type: "warning", message, duration });
  }, [addToast]);

  // 快捷方法：信息提示
  const info = useCallback((message: string, duration?: number) => {
    return addToast({ type: "info", message, duration });
  }, [addToast]);

  return {
    toasts,
    addToast,
    removeToast,
    success,
    error,
    warning,
    info,
  };
}