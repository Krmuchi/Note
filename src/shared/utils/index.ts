export const compressImage = async (file: File, maxWidth: number = 1200): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)
    const release = (): void => URL.revokeObjectURL(objectUrl)
    img.onload = () => {
      // 及时释放 ObjectURL，避免大图反复粘贴时内存缓慢增长
      release()
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const scale = Math.min(1, maxWidth / img.width)
      canvas.width = img.width * scale
      canvas.height = img.height * scale
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      }
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob)
        } else {
          reject(new Error('压缩失败'))
        }
      }, 'image/jpeg', 0.8)
    }
    img.onerror = () => {
      release()
      reject(new Error('图片加载失败'))
    }
    img.src = objectUrl
  })
}