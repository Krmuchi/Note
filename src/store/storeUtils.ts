export const newId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const generateShareUrl = (docId: string, linkId: string): string => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  // Electron file:// 下 origin 为 "file://"，拼出的链接无意义，回退为相对路径
  if (!origin || !/^https?:/i.test(origin)) {
    return `/share/${docId}/${linkId}`
  }
  return `${origin}/share/${docId}/${linkId}`
}