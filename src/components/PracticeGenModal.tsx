import { useState } from 'react'
import { Modal } from './Modal'
import { db } from '../db'
import { newId, type PracticeStyle } from '../types'
import { aiErrorMessage, generatePractice } from '../ai'
import { go } from '../App'

/**
 * Generates a set of example homework/test questions with worked solutions.
 * Used from a subject page (free topic) or from a note (note as context).
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await generatePractice({ topic: topic.trim(), context, count, style })
      const id = newId()
      await db.practices.add({
        id,
        subjectId,
        noteId,
        title: result.title || topic.trim(),
        style,
        createdAt: Date.now(),
        items: result.items.map((it) => ({
          id: newId(),
          question: it.question,
          solution: it.solution,
          marks: it.marks,
        })),
      })
      go(`/practice/${id}`)
    } catch (e) {
      setError(aiErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="Example questions" onClose={onClose}>
      <div className="stack">
        <p className="hint">
          Claude writes practice questions with full worked solutions — like the ones she gets
          for homework or in tests.
        </p>
        <label>
          Topic
          <input
            placeholder="e.g. Integration by parts"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            autoFocus={!initialTopic}
          />
        </label>
        {context && <p className="hint">Her note on this topic is used as context.</p>}
        <label>
          Style
          <select value={style} onChange={(e) => setStyle(e.target.value as PracticeStyle)}>
            <option value="mix">Mix — easier to harder</option>
            <option value="homework">Homework practice</option>
            <option value="exam">Exam-style</option>
          </select>
        </label>
        <label>
          How many questions?
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={3}>3</option>
            <option value={5}>5</option>
            <option value={8}>8</option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !topic.trim()} onClick={generate}>
          {busy ? 'Writing questions… (can take a minute)' : 'Generate'}
        </button>
      </div>
    </Modal>
  )
}
