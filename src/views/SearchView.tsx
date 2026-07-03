import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { SubjectChip } from '../App'

interface Hit {
  href: string
  title: string
  snippet?: string
  subjectId?: string
  extra?: string
}

/** Case-insensitive substring search across everything on the device. */
export function SearchView() {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])

  const data = useLiveQuery(async () => ({
    subjects: await db.subjects.toArray(),
    notes: await db.notes.toArray(),
    decks: await db.decks.toArray(),
    cards: await db.cards.toArray(),
    quizzes: await db.quizzes.toArray(),
    practices: await db.practices.toArray(),
  }))

  const q = query.trim().toLowerCase()

  const results = useMemo(() => {
    if (!data || q.length < 2) return null
    const has = (s: string | undefined) => (s ?? '').toLowerCase().includes(q)

    const notes: Hit[] = data.notes
      .filter((n) => has(n.title) || has(n.content))
      .map((n) => ({
        href: `#/note/${n.id}`,
        title: n.title || 'Untitled',
        subjectId: n.subjectId,
        snippet: has(n.content) ? snippet(n.content, q) : undefined,
      }))

    const deckById = new Map(data.decks.map((d) => [d.id, d]))
    const cards: Hit[] = data.cards
      .filter((c) => has(c.front) || has(c.back))
      .slice(0, 30)
      .map((c) => {
        const deck = deckById.get(c.deckId)
        return {
          href: `#/deck/${c.deckId}`,
          title: firstLine(c.front),
          subjectId: deck?.subjectId,
          extra: deck ? `card in ${deck.name}` : 'card',
          snippet: has(c.back) ? snippet(c.back, q) : undefined,
        }
      })

    const decks: Hit[] = data.decks
      .filter((d) => has(d.name))
      .map((d) => ({ href: `#/deck/${d.id}`, title: d.name, subjectId: d.subjectId, extra: 'deck' }))

    const quizzes: Hit[] = data.quizzes
      .filter((z) => has(z.title) || z.questions.some((qq) => has(qq.prompt)))
      .map((z) => ({
        href: `#/quiz/${z.id}`,
        title: z.title,
        subjectId: z.subjectId,
        extra: `quiz · ${z.questions.length} questions`,
        snippet: (() => {
          const m = z.questions.find((qq) => has(qq.prompt))
          return m ? snippet(m.prompt, q) : undefined
        })(),
      }))

    const practices: Hit[] = data.practices
      .filter((p) => has(p.title) || p.items.some((it) => has(it.question) || has(it.solution)))
      .map((p) => ({
        href: `#/practice/${p.id}`,
        title: p.title,
        subjectId: p.subjectId,
        extra: `practice · ${p.items.length} questions`,
        snippet: (() => {
          const m = p.items.find((it) => has(it.question) || has(it.solution))
          if (!m) return undefined
          return snippet(has(m.question) ? m.question : m.solution, q)
        })(),
      }))

    const subjects: Hit[] = data.subjects
      .filter((s) => has(s.name))
      .map((s) => ({ href: `#/subject/${s.id}`, title: s.name, subjectId: s.id, extra: 'subject' }))

    return { subjects, notes, cards, decks, quizzes, practices }
  }, [data, q])

  const subjectById = new Map((data?.subjects ?? []).map((s) => [s.id, s]))
  const total = results
    ? Object.values(results).reduce((sum, arr) => sum + arr.length, 0)
    : 0

  return (
    <div className="page">
      <div className="crumbs">
        <a href="#/">‹ Home</a>
      </div>
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        placeholder="Search notes, cards, quizzes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {q.length < 2 && <p className="hint">Type at least two characters.</p>}
      {results && total === 0 && <p className="hint">No matches for “{query.trim()}”.</p>}
      {results && (
        <>
          <ResultSection label="Subjects" hits={results.subjects} q={q} subjectById={subjectById} />
          <ResultSection label="Notes" hits={results.notes} q={q} subjectById={subjectById} />
          <ResultSection label="Flashcards" hits={results.cards} q={q} subjectById={subjectById} />
          <ResultSection label="Decks" hits={results.decks} q={q} subjectById={subjectById} />
          <ResultSection label="Quizzes" hits={results.quizzes} q={q} subjectById={subjectById} />
          <ResultSection label="Practice sets" hits={results.practices} q={q} subjectById={subjectById} />
        </>
      )}
    </div>
  )
}

function ResultSection({
  label,
  hits,
  q,
  subjectById,
}: {
  label: string
  hits: Hit[]
  q: string
  subjectById: Map<string, { id: string; name: string; color: number; createdAt: number }>
}) {
  if (hits.length === 0) return null
  return (
    <section>
      <h2>{label}</h2>
      <div className="note-list">
        {hits.map((h, i) => {
          const s = h.subjectId ? subjectById.get(h.subjectId) : undefined
          return (
            <a key={i} className="note-row search-hit" href={h.href}>
              {s && <SubjectChip subject={s} />}
              <span className="search-hit-body">
                <span className="note-row-title">{highlight(h.title, q)}</span>
                {h.snippet && <span className="search-snippet">{highlight(h.snippet, q)}</span>}
              </span>
              {h.extra && <span className="hint">{h.extra}</span>}
            </a>
          )
        })}
      </div>
    </section>
  )
}

function firstLine(md: string): string {
  return md.split('\n')[0].replace(/[#*_`>]/g, '').trim().slice(0, 80)
}

/** ±60 chars of plain text around the first match. */
function snippet(md: string, q: string): string {
  const plain = md.replace(/[#*_`>|]/g, ' ').replace(/\s+/g, ' ')
  const idx = plain.toLowerCase().indexOf(q)
  if (idx < 0) return plain.slice(0, 120)
  const start = Math.max(0, idx - 60)
  const end = Math.min(plain.length, idx + q.length + 60)
  return `${start > 0 ? '…' : ''}${plain.slice(start, end)}${end < plain.length ? '…' : ''}`
}

/** Wraps matches in <mark> without using innerHTML. */
function highlight(text: string, q: string): ReactNode {
  if (!q) return text
  const lower = text.toLowerCase()
  const parts: ReactNode[] = []
  let pos = 0
  let idx = lower.indexOf(q, pos)
  let key = 0
  while (idx >= 0) {
    if (idx > pos) parts.push(text.slice(pos, idx))
    parts.push(<mark key={key++}>{text.slice(idx, idx + q.length)}</mark>)
    pos = idx + q.length
    idx = lower.indexOf(q, pos)
  }
  parts.push(text.slice(pos))
  return parts
}
