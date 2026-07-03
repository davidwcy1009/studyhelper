import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteDeckCascade } from '../db'
import { newId, type Card } from '../types'
import { newCardScheduling, isDue, formatSpan } from '../srs'
import { Markdown } from '../markdown'
import { Modal } from '../components/Modal'
import { go, SubjectChip } from '../App'

export function DeckView({ deckId }: { deckId: string }) {
  const deck = useLiveQuery(() => db.decks.get(deckId), [deckId])
  const subject = useLiveQuery(
    () => (deck ? db.subjects.get(deck.subjectId) : undefined),
    [deck?.subjectId],
  )
  const cards = useLiveQuery(() => db.cards.where('deckId').equals(deckId).toArray(), [deckId])
  const [front, setFront] = useState('')
  const [back, setBack] = useState('')
  const [editing, setEditing] = useState<Card | null>(null)

  if (deck === undefined || cards === undefined) return <div className="page">Loading…</div>
  if (!deck) return <div className="page">Deck not found.</div>

  const now = Date.now()
  const due = cards.filter((c) => isDue(c, now))
  const fresh = cards.filter((c) => c.state === 'new')

  const addCard = async () => {
    if (!front.trim() || !back.trim()) return
    await db.cards.add({
      id: newId(),
      deckId,
      front: front.trim(),
      back: back.trim(),
      createdAt: Date.now(),
      ...newCardScheduling(),
    })
    setFront('')
    setBack('')
  }

  const removeDeck = async () => {
    if (!confirm(`Delete the deck “${deck.name}” and all ${cards.length} cards?`)) return
    await deleteDeckCascade(deckId)
    go(`/subject/${deck.subjectId}`)
  }

  const rename = async () => {
    const name = prompt('Deck name', deck.name)
    if (name?.trim()) await db.decks.update(deckId, { name: name.trim() })
  }

  return (
    <div className="page">
      <div className="crumbs">
        {subject && (
          <a href={`#/subject/${subject.id}`}>
            <SubjectChip subject={subject} /> {subject.name}
          </a>
        )}
        <button className="btn btn-sm btn-danger-ghost" onClick={removeDeck}>
          Delete deck
        </button>
      </div>

      <div className="page-head">
        <h1 onClick={rename} title="Click to rename" className="clickable">
          {deck.name}
        </h1>
        <div className="head-actions">
          <button
            className="btn btn-primary"
            disabled={due.length + fresh.length === 0}
            onClick={() => go(`/study/${deckId}`)}
          >
            Study {due.length + Math.min(fresh.length, 20) > 0 ? `(${due.length + Math.min(fresh.length, 20)})` : ''}
          </button>
          <button
            className="btn"
            disabled={cards.length === 0}
            onClick={() => go(`/study/${deckId}?mode=practice`)}
          >
            Practice all
          </button>
        </div>
      </div>

      <p className="deck-counts">
        <span className="count-chip new">{fresh.length} new</span>
        <span className="count-chip due">{due.length} due</span>
        <span className="count-chip">{cards.length} total</span>
      </p>

      <section className="panel">
        <h2>Add a card</h2>
        <div className="add-card-grid">
          <textarea
            placeholder="Front — the question ($math$ works)"
            value={front}
            onChange={(e) => setFront(e.target.value)}
          />
          <textarea
            placeholder="Back — the answer"
            value={back}
            onChange={(e) => setBack(e.target.value)}
          />
        </div>
        <div className="row-end">
          <span className="hint">Tip: open a note and use “⚡ Flashcards from note” to make cards automatically.</span>
          <button className="btn btn-primary" disabled={!front.trim() || !back.trim()} onClick={addCard}>
            Add card
          </button>
        </div>
      </section>

      <section>
        <h2>Cards</h2>
        {cards.length === 0 && <p className="hint">No cards yet.</p>}
        <div className="card-list">
          {cards
            .slice()
            .sort((a, b) => b.createdAt - a.createdAt)
            .map((c) => (
              <div key={c.id} className="card-row">
                <div className="card-row-body">
                  <Markdown source={c.front} className="card-row-front" />
                  <Markdown source={c.back} className="card-row-back" />
                </div>
                <div className="card-row-meta">
                  <span className={`count-chip ${c.state}`}>
                    {c.state === 'new' ? 'new' : c.due <= now ? 'due' : `in ${formatSpan(c.due - now)}`}
                  </span>
                  <button className="icon-btn" title="Edit" onClick={() => setEditing(c)}>
                    ✎
                  </button>
                  <button
                    className="icon-btn"
                    title="Delete"
                    onClick={async () => {
                      if (confirm('Delete this card?')) {
                        await db.reviews.where('cardId').equals(c.id).delete()
                        await db.cards.delete(c.id)
                      }
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
        </div>
      </section>

      {editing && (
        <EditCardModal
          card={editing}
          onClose={() => setEditing(null)}
          onSave={async (front2, back2) => {
            await db.cards.update(editing.id, { front: front2, back: back2 })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function EditCardModal({
  card,
  onClose,
  onSave,
}: {
  card: Card
  onClose: () => void
  onSave: (front: string, back: string) => void
}) {
  const [front, setFront] = useState(card.front)
  const [back, setBack] = useState(card.back)
  return (
    <Modal title="Edit card" onClose={onClose}>
      <div className="stack">
        <label>
          Front
          <textarea value={front} onChange={(e) => setFront(e.target.value)} />
        </label>
        <label>
          Back
          <textarea value={back} onChange={(e) => setBack(e.target.value)} />
        </label>
        <button className="btn btn-primary" onClick={() => onSave(front, back)}>
          Save
        </button>
      </div>
    </Modal>
  )
}
