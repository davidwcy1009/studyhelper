import { useEffect, useMemo, useState } from 'react'
import { db } from '../db'
import type { Card } from '../types'
import { schedule, previewIntervals, isDue, type Grade } from '../srs'
import { Markdown } from '../markdown'

const NEW_PER_SESSION = 20
const GRADE_LABELS = ['Again', 'Hard', 'Good', 'Easy'] as const

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * mode 'study'    — due + new cards, SM-2 scheduling updates persist.
 * mode 'practice' — every card, shuffled, no scheduling changes.
 */
export function StudySession({ deckId, mode }: { deckId: string; mode: 'study' | 'practice' }) {
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const [missed, setMissed] = useState(0)
  const [deckName, setDeckName] = useState('')

  useEffect(() => {
    ;(async () => {
      const deck = await db.decks.get(deckId)
      setDeckName(deck?.name ?? '')
      const cards = await db.cards.where('deckId').equals(deckId).toArray()
      if (mode === 'practice') {
        setQueue(shuffle(cards))
        return
      }
      const now = Date.now()
      const learning = cards
        .filter((c) => c.state === 'learning' && isDue(c, now))
        .sort((a, b) => a.due - b.due)
      const review = cards
        .filter((c) => c.state === 'review' && isDue(c, now))
        .sort((a, b) => a.due - b.due)
      const fresh = shuffle(cards.filter((c) => c.state === 'new')).slice(0, NEW_PER_SESSION)
      setQueue([...learning, ...review, ...fresh])
    })()
  }, [deckId, mode])

  const current = queue?.[0] ?? null
  const previews = useMemo(
    () => (current && mode === 'study' ? previewIntervals(current) : null),
    [current, mode],
  )

  const grade = async (g: Grade) => {
    if (!current || !queue) return
    setRevealed(false)
    if (g <= 1) setMissed((m) => m + 1)

    if (mode === 'practice') {
      setQueue(queue.slice(1))
      setDone((d) => d + 1)
      return
    }

    const updated = schedule(current, g)
    await db.cards.put(updated)
    await db.reviews.add({ cardId: current.id, grade: g, at: Date.now() })

    const rest = queue.slice(1)
    // Cards still due within the next ~20 minutes come back around this session.
    if (updated.due <= Date.now() + 20 * 60_000) {
      rest.push(updated)
    } else {
      setDone((d) => d + 1)
    }
    setQueue(rest)
  }

  if (!queue) return <div className="page">Loading…</div>

  if (!current) {
    return (
      <div className="page study-page">
        <div className="study-end">
          <div className="study-end-emoji">🎉</div>
          <h1>Nice work!</h1>
          <p>
            You got through {done} card{done === 1 ? '' : 's'}
            {missed > 0 ? ` — ${missed} to keep an eye on.` : ' without a hitch.'}
          </p>
          <div className="head-actions">
            <a className="btn btn-primary" href={`#/deck/${deckId}`}>
              Back to deck
            </a>
            <a className="btn" href="#/">
              Home
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page study-page">
      <div className="study-top">
        <a href={`#/deck/${deckId}`} className="btn btn-sm">
          ✕ End
        </a>
        <span className="study-progress">
          {deckName} · {queue.length} left{mode === 'practice' ? ' · practice' : ''}
        </span>
      </div>

      <div className="study-card" onClick={() => !revealed && setRevealed(true)}>
        <Markdown source={current.front} className="study-front" />
        {revealed && (
          <>
            <hr className="study-divider" />
            <Markdown source={current.back} className="study-back" />
          </>
        )}
      </div>

      {!revealed ? (
        <button className="btn btn-primary btn-big" onClick={() => setRevealed(true)}>
          Show answer
        </button>
      ) : mode === 'study' ? (
        <div className="grade-row">
          {GRADE_LABELS.map((label, i) => (
            <button key={label} className={`btn grade-btn grade-${i}`} onClick={() => grade(i as Grade)}>
              <span>{label}</span>
              <small>{previews?.[i]}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="grade-row practice">
          <button className="btn grade-btn grade-0" onClick={() => grade(0)}>
            <span>Missed it</span>
          </button>
          <button className="btn grade-btn grade-2" onClick={() => grade(2)}>
            <span>Got it</span>
          </button>
        </div>
      )}
    </div>
  )
}
