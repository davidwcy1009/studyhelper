import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { newId, type Subject } from '../types'
import { isDue, computeStreak, localDay } from '../srs'
import { go, SubjectChip, SUBJECT_COLORS } from '../App'

export function Dashboard() {
  const subjects = useLiveQuery(() => db.subjects.orderBy('createdAt').toArray(), [])
  const decks = useLiveQuery(() => db.decks.toArray(), [])
  const cards = useLiveQuery(() => db.cards.toArray(), [])
  const notes = useLiveQuery(() => db.notes.orderBy('updatedAt').reverse().limit(6).toArray(), [])
  const reviews = useLiveQuery(() => db.reviews.toArray(), [])
  const attempts = useLiveQuery(() => db.attempts.toArray(), [])

  if (!subjects || !decks || !cards || !notes || !reviews || !attempts) {
    return <div className="page">Loading…</div>
  }

  const now = Date.now()
  const dueCards = cards.filter((c) => isDue(c, now))
  const newCards = cards.filter((c) => c.state === 'new')

  const activityDays = new Set<string>()
  for (const r of reviews) activityDays.add(localDay(r.at))
  for (const a of attempts) activityDays.add(localDay(a.finishedAt))
  const streak = computeStreak(activityDays, now)
  const studiedToday = activityDays.has(localDay(now))

  const upcoming = subjects
    .filter((s) => s.examDate && new Date(s.examDate + 'T23:59:59').getTime() >= now)
    .map((s) => ({
      s,
      days: Math.ceil((new Date(s.examDate + 'T00:00:00').getTime() - now) / 86_400_000),
    }))
    .sort((a, b) => a.days - b.days)
  const nextExam = upcoming[0]

  const decksWithDue = decks
    .map((d) => ({
      deck: d,
      due: cards.filter((c) => c.deckId === d.id && isDue(c, now)).length,
      fresh: cards.filter((c) => c.deckId === d.id && c.state === 'new').length,
      subject: subjects.find((s) => s.id === d.subjectId),
    }))
    .filter((x) => x.due + x.fresh > 0)
    .sort((a, b) => b.due - a.due)

  return (
    <div className="page">
      <div className="stat-row">
        <div className="stat-tile">
          <span className="stat-label">Cards due today</span>
          <span className="stat-value">{dueCards.length}</span>
          {newCards.length > 0 && <span className="stat-sub">+{newCards.length} new to learn</span>}
        </div>
        <div className="stat-tile">
          <span className="stat-label">Study streak</span>
          <span className="stat-value">
            {streak}
            <span className="stat-unit"> day{streak === 1 ? '' : 's'}</span>
          </span>
          <span className="stat-sub">
            {studiedToday ? '🔥 studied today' : streak > 0 ? 'study today to keep it' : 'start one today'}
          </span>
        </div>
        <div className="stat-tile">
          <span className="stat-label">Next exam</span>
          {nextExam ? (
            <>
              <span className="stat-value">
                {nextExam.days}
                <span className="stat-unit"> day{nextExam.days === 1 ? '' : 's'}</span>
              </span>
              <span className="stat-sub">{nextExam.s.name}</span>
            </>
          ) : (
            <>
              <span className="stat-value">—</span>
              <span className="stat-sub">set exam dates on subjects</span>
            </>
          )}
        </div>
      </div>

      {decksWithDue.length > 0 && (
        <section>
          <h2>Ready to review</h2>
          <div className="review-list">
            {decksWithDue.map(({ deck, due, fresh, subject }) => (
              <div key={deck.id} className="review-row">
                <div>
                  {subject && <SubjectChip subject={subject} />}
                  <strong>{deck.name}</strong>
                  <span className="hint">
                    {' '}
                    {due > 0 && `${due} due`}
                    {due > 0 && fresh > 0 && ' · '}
                    {fresh > 0 && `${fresh} new`}
                  </span>
                </div>
                <a className="btn btn-primary btn-sm" href={`#/study/${deck.id}`}>
                  Study
                </a>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="section-head">
          <h2>Subjects</h2>
        </div>
        <div className="subject-grid">
          {subjects.map((s) => (
            <SubjectCard key={s.id} subject={s} />
          ))}
          <AddSubjectCard />
        </div>
      </section>

      {notes.length > 0 && (
        <section>
          <h2>Recent notes</h2>
          <div className="note-list">
            {notes.map((n) => {
              const s = subjects.find((x) => x.id === n.subjectId)
              return (
                <a key={n.id} className="note-row" href={`#/note/${n.id}`}>
                  {s && <SubjectChip subject={s} />}
                  <span className="note-row-title">{n.title || 'Untitled'}</span>
                  <span className="hint">{new Date(n.updatedAt).toLocaleDateString()}</span>
                </a>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

function SubjectCard({ subject }: { subject: Subject }) {
  const noteCount = useLiveQuery(
    () => db.notes.where('subjectId').equals(subject.id).count(),
    [subject.id],
  )
  const deckCount = useLiveQuery(
    () => db.decks.where('subjectId').equals(subject.id).count(),
    [subject.id],
  )
  const days =
    subject.examDate && new Date(subject.examDate + 'T23:59:59').getTime() >= Date.now()
      ? Math.ceil((new Date(subject.examDate + 'T00:00:00').getTime() - Date.now()) / 86_400_000)
      : null
  return (
    <a className="subject-card" href={`#/subject/${subject.id}`}>
      <span className="subject-bar" style={{ background: `var(--cat-${subject.color % 8})` }} />
      <strong>{subject.name}</strong>
      <span className="hint">
        {noteCount ?? 0} note{noteCount === 1 ? '' : 's'} · {deckCount ?? 0} deck
        {deckCount === 1 ? '' : 's'}
      </span>
      {days !== null && <span className="exam-chip">exam in {days}d</span>}
    </a>
  )
}

function AddSubjectCard() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color, setColor] = useState(0)

  const add = async () => {
    if (!name.trim()) return
    const id = newId()
    await db.subjects.add({ id, name: name.trim(), color, createdAt: Date.now() })
    setName('')
    setOpen(false)
    go(`/subject/${id}`)
  }

  if (!open) {
    return (
      <button className="subject-card add" onClick={() => setOpen(true)}>
        <span className="add-plus">+</span> Add subject
      </button>
    )
  }
  return (
    <div className="subject-card adding">
      <input
        autoFocus
        placeholder="e.g. Maths"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && add()}
      />
      <div className="color-row">
        {SUBJECT_COLORS.map((_, i) => (
          <button
            key={i}
            className={`swatch ${color === i ? 'active' : ''}`}
            style={{ background: `var(--cat-${i})` }}
            onClick={() => setColor(i)}
            aria-label={`colour ${i + 1}`}
          />
        ))}
      </div>
      <div className="head-actions">
        <button className="btn btn-sm" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button className="btn btn-primary btn-sm" disabled={!name.trim()} onClick={add}>
          Add
        </button>
      </div>
    </div>
  )
}
