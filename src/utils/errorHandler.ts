export function handleError(error: unknown, context: string = ''): string {
  let errorMessage: string
  
  if (typeof error === 'string') {
    errorMessage = error
  } else if (error instanceof Error) {
    errorMessage = error.message
  } else {
    errorMessage = String(error)
  }
  
  console.error(`[${context}] Error:`, error)
  
  return errorMessage
}

export async function safeAsyncOperation<T>(
  asyncFn: () => Promise<T>, 
  context: string = 'Operation'
): Promise<{ success: boolean; data?: T; error?: string }> {
  try {
    const data = await asyncFn()
    return { success: true, data }
  } catch (error) {
    const errorMessage = handleError(error, context)
    return { success: false, error: errorMessage }
  }
}