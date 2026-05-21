/**
 * 统一错误处理函数
 * @param error 错误对象
 * @param context 错误发生的上下文
 * @returns 格式化的错误消息
 */
export function handleError(error: any, context: string = ''): string {
  let errorMessage = '';
  
  if (typeof error === 'string') {
    errorMessage = error;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else {
    errorMessage = String(error);
  }
  
  // 记录错误日志
  console.error(`[${context}] Error:`, error);
  
  // 返回用户友好的错误消息
  return errorMessage;
}

/**
 * 异步操作的安全包装器
 * @param asyncFn 异步函数
 * @param context 错误上下文
 * @returns 包装后的异步函数
 */
export async function safeAsyncOperation<T>(
  asyncFn: () => Promise<T>, 
  context: string = 'Operation'
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const data = await asyncFn();
    return { success: true, data };
  } catch (error) {
    const errorMessage = handleError(error, context);
    return { success: false, error: errorMessage };
  }
}