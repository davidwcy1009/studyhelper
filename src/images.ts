/**
 * Prepares photos for storage and for the Claude vision API.
 * iPad cameras produce HEIC and very large images; the API accepts
 * jpeg/png/gif/webp up to ~5MB, and downscaling saves tokens.
 */

const API_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX_DIMENSION = 2000
const MAX_BYTES = 3 * 1024 * 1024

export interface NormalizedImage {
  blob: Blob
  mime: string
}

export async function normalizeImage(file: Blob): Promise<NormalizedImage> {
  const needsReencode = !API_MIMES.has(file.type) || file.size > MAX_BYTES
  const bitmap = await loadBitmap(file)
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  if (!needsReencode && scale === 1) {
    bitmap.close?.()
    return { blob: file, mime: file.type }
  }
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.87),
  )
  if (!blob) throw new Error('Could not read that image — try a JPEG or PNG.')
  return { blob, mime: 'image/jpeg' }
}

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file)
  } catch {
    // Fallback via <img> decode (covers some formats createImageBitmap rejects)
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return await createImageBitmap(img)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}
