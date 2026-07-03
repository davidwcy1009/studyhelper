import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteSubjectCascade } from '../db'
import { newId } from '../types'
import { isDue } from '../srs'
import { hasApiKey } from '../ai'
import { PhotoNoteModal } from '../components/PhotoNoteModal'
import { PracticeGenModal } from '../components/PracticeGenModal'
import { go, SubjectChip } from '../App'

const STYLE_LABEL = { homework: 'homework', exam: 'exam-style', mix: 'mixed' }

export function SubjectView({ subjectId }: { subjectId: string }) {
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [showPracticeModal, setShowPracticeModal] = useState(false)
  const subject = useLiveQuery(() => db.subjects.get(subjectId), [subjectId])
  const notes = useLiveQuery(
    () => db.notes.where('subjectId').equals(subjectId).reverse().sortBy('updatedAt'),
    [subjectId],
  )
  const decks = useLiveQuery(() => db.decks.where('subjectId').equals(subjectId).toArray(), [subjectId])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const quizzes = useLiveQuery(
    () => db.quizzes.where('subjectId').equals(subjectId).toArray(),
    [subjectId],
  )
  const attempts = useLiveQuery(() => db.attempts.toArray(), [])
  const practices = useLiveQuery(
    () => db.practices.where('subjectId').equals(subjectId).reverse().sortBy('createdAt'),
    [subjectId],
  )

  if (!subject || !notes || !decks || !cards || !quizzes || !attempts || !practices) {
    return <div className="page">Loading…</div>
  }

  const now = Date.now()

  const newNote = async () => {
    const id = newId()
    await db.notes.add({
      id,
      subjectId,
      title: '',
      content: '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    go(`/note/${id}`)
  }

  const newDeck = async () => {
    const name = prompt('Deck name', 'New deck')
    if (!name?.trim()) return
    const id = newId()
    await db.decks.add({ id, subjectId, name: name.trim(), createdAt: Date.now() })
    go(`/deck/${id}`)
  }

  const rename = async () => {
    const name = prompt('Subject name', subject.name)
    if (name?.trim()) await db.subjects.update(subjectId, { name: name.trim() })
  }

  const remove = async () => {
    if (
      !confirm(
        `Delete “${subject.name}” with all its notes, decks, cards and quizzes? This cannot be undone.`,
      )
    )
      return
    await deleteSubjectCascade(subjectId)
    go('/')
  }

  return (
    <div className="page">
      <div className="crumbs">
        <a href="#/">‹ Home</a>
        <button className="btn btn-sm btn-danger-ghost" onClick={remove}>
          Delete subject
        </button>
      </div>

      <div className="page-head">
        <h1 className="clickable" onClick={rename} title="Click to rename">
          <SubjectChip subject={subject} big /> {subject.name}
        </h1>
        <label className="exam-date">
          Exam date{' '}
          <input
            type="date"
            value={subject.examDate ?? ''}
            onChange={(e) =>
              db.subjects.update(subjectId, { examDate: e.target.value || undefined })
            }
          />
        </label>
      </div>

      <section>
        <div className="section-head">
          <h2>Notes</h2>
          <div className="head-actions">
            <button
              className="btn btn-sm"
              disabled={!hasApiKey()}
              title={hasApiKey() ? undefined : 'Add an API key in Settings'}
              onClick={() => setShowPhotoModal(true)}
            >
              📷 Note from photos
            </button>
            <button className="btn btn-primary btn-sm" onClick={newNote}>
              + New note
            </button>
          </div>
        </div>
        {notes.length === 0 && <p className="hint">No notes yet — start writing!</p>}
        <div className="note-list">
          {notes.map((n) => (
            <a key={n.id} className="note-row" href={`#/note/${n.id}`}>
              <span className="note-row-title">{n.title || 'Untitled'}</span>
              <span className="hint">{new Date(n.updatedAt).toLocaleDateString()}</span>
            </a>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Flashcard decks</h2>
          <button className="btn btn-primary btn-sm" onClick={newDeck}>
            + New deck
          </button>
        </div>
        {decks.length === 0 && (
          <p className="hint">
            No decks yet. Create one, or open a note and use “⚡ Flashcards from note”.
          </p>
        )}
        <div className="note-list">
          {decks.map((d) => {
            const deckCards = cards.filter((c) => c.deckId === d.id)
            const due = deckCards.filter((c) => isDue(c, now)).length
            const fresh = deckCards.filter((c) => c.state === 'new').length
            return (
              <a key={d.id} className="note-row" href={`#/deck/${d.id}`}>
                <span className="note-row-title">{d.name}</span>
                <span className="row-chips">
                  {due > 0 && <span className="count-chip due">{due} due</span>}
                  {fresh > 0 && <span className="count-chip new">{fresh} new</span>}
                  <span className="hint">{deckCards.length} cards</span>
                </span>
              </a>
            )
          })}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Practice questions</h2>
          <button
            className="btn btn-primary btn-sm"
            disabled={!hasApiKey()}
            title={hasApiKey() ? undefined : 'Add an API key in Settings'}
            onClick={() => setShowPracticeModal(true)}
          >
            ⚡ Example questions
          </button>
        </div>
        {practices.length === 0 && (
          <p className="hint">
            Get homework- and test-style example questions (with worked solutions) on any topic.
          </p>
        )}
        <div className="note-list">
          {practices.map((p) => (
            <a key={p.id} className="note-row" href={`#/practice/${p.id}`}>
              <span className="note-row-title">{p.title}</span>
              <span className="row-chips">
                <span className="hint">
                  {p.items.length} questions · {STYLE_LABEL[p.style]}
                </span>
              </span>
            </a>
          ))}
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Quizzes</h2>
        </div>
        {quizzes.length === 0 && (
          <p className="hint">
            Open a note and use “⚡ Quiz me on this” to create a quiz from it.
          </p>
        )}
        <div className="note-list">
          {quizzes.map((q) => {
            const qa = attempts.filter((a) => a.quizId === q.id)
            const best = qa.length
              ? Math.max(...qa.map((a) => Math.round((a.score / a.total) * 100)))
              : null
            return (
              <a key={q.id} className="note-row" href={`#/quiz/${q.id}`}>
                <span className="note-row-title">{q.title}</span>
                <span className="row-chips">
                  <span className="hint">{q.questions.length} questions</span>
                  {best !== null && <span className="count-chip">best {best}%</span>}
                </span>
              </a>
            )
          })}
        </div>
      </section>

      {showPhotoModal && (
        <PhotoNoteModal subjectId={subjectId} onClose={() => setShowPhotoModal(false)} />
      )}
      {showPracticeModal && (
        <PracticeGenModal subjectId={subjectId} onClose={() => setShowPracticeModal(false)} />
      )}
    </div>
  )
}
