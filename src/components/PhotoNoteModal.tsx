import { useState } from 'react'
import { Modal } from './Modal'
import { PhotoPicker, type Picked } from './PhotoPicker'
import { db } from '../db'
import { newId } from '../types'
import { blobToBase64 } from '../images'
import { aiErrorMessage, transcribePhotos, type PhotoInput } from '../ai'
import { go } from '../App'

/** Turn photos of textbook pages / whiteboards / handwriting into a note. */
export function PhotoNoteModal({
  subjectId,
  onClose,
}: {
  subjectId: string
  onClose: () => void
}) {
  const [photos, setPhotos] = useState<Picked[]>([])
  const [hint, setHint] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const transcribe = async () => {
    setBusy(true)
    setError('')
    try {
      setStatus('Reading the photos… (this can take a minute)')
      const inputs: PhotoInput[] = []
      for (const p of photos) {
        inputs.push({
          base64: await blobToBase64(p.blob),
          mediaType: p.mime as PhotoInput['mediaType'],
        })
      }
      const { title, markdown } = await transcribePhotos(inputs, hint || undefined)

      setStatus('Saving the note…')
      // Store the original photos and append them for reference.
      const imageIds: string[] = []
      for (const p of photos) {
        const id = newId()
        await db.images.add({ id, blob: p.blob, mime: p.mime, createdAt: Date.now() })
        imageIds.push(id)
      }
      const appendix =
        `\n\n---\n\n### Original photo${imageIds.length > 1 ? 's' : ''}\n\n` +
        imageIds.map((id, i) => `![photo ${i + 1}](img:${id})`).join('\n\n')

      const noteId = newId()
      await db.notes.add({
        id: noteId,
        subjectId,
        title,
        content: markdown + appendix,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      go(`/note/${noteId}`)
    } catch (e) {
      setError(aiErrorMessage(e))
      setBusy(false)
      setStatus('')
    }
  }

  return (
    <Modal title="Note from photos" onClose={onClose}>
      <div className="stack">
        <p className="hint">
          Snap a textbook page, whiteboard, worksheet or your handwritten notes — Claude turns
          them into a typed note (equations included). Up to 4 photos become one note.
        </p>
        <PhotoPicker photos={photos} setPhotos={setPhotos} onError={setError} />
        <label>
          What is it? (optional, helps accuracy)
          <input
            placeholder="e.g. Chemistry — electrolysis, page 2 of 2"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        {status && <p className="hint">{status}</p>}
        <button
          className="btn btn-primary"
          disabled={photos.length === 0 || busy}
          onClick={transcribe}
        >
          {busy ? 'Working…' : `Transcribe ${photos.length || ''} photo${photos.length === 1 ? '' : 's'} into a note`}
        </button>
      </div>
    </Modal>
  )
}
