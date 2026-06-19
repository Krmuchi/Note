export const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`

export const generateShareUrl = (docId: string, linkId: string) => {
  return `${window.location.origin}/share/${docId}/${linkId}`
}