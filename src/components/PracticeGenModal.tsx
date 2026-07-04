import { useState } from 'react'
import { Modal } from './Modal'
import { PhotoPicker, type Picked } from './PhotoPicker'
import { db } from '../db'
import { newId, type PracticeStyle } from '../types'
import {
  aiErrorMessage,
  generatePractice,
  generatePracticeFromPhotos,
  type PhotoInput,
} from '../ai'
import { blobToBase64 } from '../images'
import { go } from '../App'

/**
 * Generates a set of example homework/test questions with worked solutions.
 * Works from a typed topic (optionally a note's content as context) or from
 * photos of her real homework/past-paper questions — Claude then matches the
 * topic and style of those papers.
 */
export function PracticeGenModal({
  subjectId,
  noteId,
  initialTopic,
  context,
  onClose,
}: {
  subjectId: string
  noteId?: string
  initialTopic?: string
  context?: string
  onClose: () => void
}) {
  const [topic, setTopic] = useState(initialTopic ?? '')
  const [count, setCount] = useState(5)
  const [style, setStyle] = useState<PracticeStyle>('mix')
  const [photos, setPhotos] = useState<Picked[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const fromPhotos = photos.length > 0

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const id = newId()
      if (fromPhotos) {
        setStatus('Reading the questions… (this can take a minute)')
        const inputs: PhotoInput[] = []
        for (const p of photos) {
          inputs.push({ base64: await blobToBase64(p.blob), mediaType: p.mime as PhotoInput['mediaType'] })
        }
        const result = await generatePracticeFromPhotos(inputs, {
          count,
          hint: topic.trim() || undefined,
        })
        await db.practices.add({
          id,
          subjectId,
          noteId,
          title: result.title || result.topic || 'Practice from photos',
          topic: result.topic,
          style: result.style,
          styleNotes: result.styleNotes,
          createdAt: Date.now(),
          items: result.items.map((it) => ({
            id: newId(),
            question: it.question,
            solution: it.solution,
            marks: it.marks,
          })),
        })
      } else {
        const result = await generatePractice({ topic: topic.trim(), context, count, style })
        await db.practices.add({
          id,
          subjectId,
          noteId,
          title: result.title || topic.trim(),
          topic: topic.trim(),
          style,
          createdAt: Date.now(),
          items: result.items.map((it) => ({
            id: newId(),
            question: it.question,
            solution: it.solution,
            marks: it.marks,
          })),
        })
      }
      go(`/practice/${id}`)
    } catch (e) {
      setError(aiErrorMessage(e))
      setBusy(false)
      setStatus('')
    }
  }

  return (
    <Modal title="Example questions" onClose={onClose}>
      <div className="stack">
        <p className="hint">
          Claude writes practice questions with full worked solutions — like the ones she gets for
          homework or in tests. Add photos of a real worksheet or past paper to match its topic and
          style.
        </p>
        <PhotoPicker photos={photos} setPhotos={setPhotos} onError={setError} />
        <label>
          {fromPhotos ? 'Anything to focus on? (optional)' : 'Topic'}
          <input
            placeholder={fromPhotos ? 'e.g. just the mechanics questions' : 'e.g. Integration by parts'}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            autoFocus={!initialTopic && !fromPhotos}
          />
        </label>
        {context && !fromPhotos && <p className="hint">Her note on this topic is used as context.</p>}
        {fromPhotos ? (
          <p className="hint">Claude matches the topic and style of your photos.</p>
        ) : (
          <label>
            Style
            <select value={style} onChange={(e) => setStyle(e.target.value as PracticeStyle)}>
              <option value="mix">Mix — easier to harder</option>
              <option value="homework">Homework practice</option>
              <option value="exam">Exam-style</option>
            </select>
          </label>
        )}
        <label>
          How many questions?
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={8}>8</option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        {status && <p className="hint">{status}</p>}
        <button
          className="btn btn-primary"
          disabled={busy || (!fromPhotos && !topic.trim())}
          onClick={generate}
        >
          {busy
            ? status || 'Writing questions…'
            : fromPhotos
              ? 'Generate from photos'
              : 'Generate'}
        </button>
      </div>
    </Modal>
  )
}
