/**
 * 图片压缩（粘贴/拖入图片时统一走这里）。
 *
 * 旧实现用 `URL.createObjectURL(file)` 给 `<img>` 当 src 来读尺寸 ——
 * 但应用 CSP 是 `img-src 'self' data: file:`，**不含 blob:**
 * 于是 `<img>` 加载被拦截、`onerror` 触发、压缩必然失败。
 * 实测症状：控制台报 CSP violation，图片退回"不压缩直接插入"。
 *
 * 改用 `createImageBitmap`：它直接从 File/Blob 解码，**不经过任何 URL**，
 * 因此不受 img-src 限制。浏览器不支持时再退回 Image + data URL
 * （data URL 在 CSP 白名单内，不会触发拦截）。
 */
export const compressImage = async (file: File, maxWidth: number = 1200): Promise<Blob> => {
  // 主路径：createImageBitmap（无 URL、无 CSP 风险）
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file)
    try {
      const scale = Math.min(1, maxWidth / bitmap.width)
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('无法创建画布上下文')
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', 0.8)
      })
      if (!blob) throw new Error('压缩失败')
      return blob
    } finally {
      // 位图占显存，用完必须显式释放（大图反复粘贴时否则会持续增长）
      bitmap.close()
    }
  }

  // 兜底：data URL 解码（白名单内，不会触发 CSP）
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('无法创建画布上下文'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob((blob) => {
          if (blob) resolve(blob)
          else reject(new Error('压缩失败'))
        }, 'image/jpeg', 0.8)
      }
      img.onerror = () => reject(new Error('图片加载失败'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsDataURL(file)
  })
}
