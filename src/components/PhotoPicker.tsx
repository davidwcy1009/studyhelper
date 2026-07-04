import { useEffect, useRef } from 'react'
import { normalizeImage } from '../images'

export interface Picked {
  blob: Blob
  mime: string
  url: string
}

/**
 * A thumbnail grid + "add photo" control shared by the photo-driven modals
 * (note-from-photos, practice-from-photos). Owns file picking and image
 * normalization; the parent owns the `photos` state so it can read the blobs.
 */
export function PhotoPicker({
  photos,
  setPhotos,
  max = 4,
  onError,
}: {
  photos: Picked[]
  setPhotos: React.Dispatch<React.SetStateAction<Picked[]>>
  max?: number
  onError?: (message: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const photosRef = useRef(photos)
  photosRef.current = photos
  // Revoke every object URL we created when the picker unmounts.
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), [])

  const pick = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files).slice(0, max - photos.length)) {
      try {
        const norm = await normalizeImage(file)
        setPhotos((p) => [...p, { ...norm, url: URL.createObjectURL(norm.blob) }])
      } catch (e) {
        onError?.(e instanceof Error ? e.message : String(e))
      }
    }
  }

  const removeAt = (i: number) =>
    setPhotos((arr) => {
      const p = arr[i]
      if (p) URL.revokeObjectURL(p.url)
      return arr.filter((_, j) => j !== i)
    })

  return (
    <div className="photo-grid">
      {photos.map((p, i) => (
        <div key={i} className="photo-thumb">
          <img src={p.url} alt={`photo ${i + 1}`} />
          <button className="photo-remove" aria-label="Remove photo" onClick={() => removeAt(i)}>
            ✕
          </button>
        </div>
      ))}
      {photos.length < max && (
        <button className="photo-add" onClick={() => fileRef.current?.click()}>
          + Add photo
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          void pick(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
