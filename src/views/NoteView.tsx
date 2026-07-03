import { useEffect, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteNoteCascade } from '../db'
import { newId, type Deck, type QuizQuestion } from '../types'
import { newCardScheduling } from '../srs'
import { Markdown } from '../markdown'
import { Modal } from '../components/Modal'
import { Sketchpad } from '../components/Sketchpad'
import { PracticeGenModal } from '../components/PracticeGenModal'
import {
  aiErrorMessage,
  generateFlashcards,
  generateQuiz,
  hasApiKey,
  keyPoints,
  type GeneratedCard,
} from '../ai'
import { go, SubjectChip } from '../App'

export function NoteView({ noteId }: { noteId: string }) {
  const note = useLiveQuery(() => db.notes.get(noteId), [noteId])
  const subject = useLiveQuery(
    () => (note ? db.subjects.get(note.subjectId) : undefined),
    [note?.subjectId],
  )

  const [content, setContent] = useState<string | null>(null)
  const [title, setTitle] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)
  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [showSketch, setShowSketch] = useState(false)
  const [aiModal, setAiModal] = useState<'cards' | 'quiz' | 'summary' | 'practice' | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const saveTimer = useRef<number>(undefined)

  // Hydrate local editing state once the note loads (or when switching notes).
  useEffect(() => {
    setContent(null)
    setTitle(null)
    setSaved(true)
  }, [noteId])
  const effContent = content ?? note?.content ?? ''
  const effTitle = title ?? note?.title ?? ''

  const scheduleSave = (nextTitle: string, nextContent: string) => {
    setSaved(false)
    window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(async () => {
      await db.notes.update(noteId, {
        title: nextTitle,
        content: nextContent,
        updatedAt: Date.now(),
      })
      setSaved(true)
    }, 500)
  }

  const updateContent = (v: string) => {
    setContent(v)
    scheduleSave(effTitle, v)
  }
  const updateTitle = (v: string) => {
    setTitle(v)
    scheduleSave(v, effContent)
  }

  /** Insert text at the cursor (or wrap the selection). */
  const insert = (before: string, after = '', placeholder = '') => {
    const ta = textRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = effContent.slice(start, end) || placeholder
    const next = effContent.slice(0, start) + before + sel + after + effContent.slice(end)
    updateContent(next)
    requestAnimationFrame(() => {
      ta.focus()
      const pos = start + before.length + sel.length
      ta.setSelectionRange(sel ? pos + after.length : start + before.length, pos)
    })
  }

  const addImageBlob = async (blob: Blob, label = 'image') => {
    const id = newId()
    await db.images.add({ id, blob, mime: blob.type || 'image/png', createdAt: Date.now() })
    insert(`\n![${label}](img:${id})\n`)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          void addImageBlob(file, 'pasted image')
          return
        }
      }
    }
  }

  const pickImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => {
      const f = input.files?.[0]
      if (f) void addImageBlob(f, f.name.replace(/\.[a-z]+$/i, ''))
    }
    input.click()
  }

  const remove = async () => {
    if (!confirm('Delete this note? Its images are removed too. Flashcards and quizzes made from it are kept.')) return
    const subjectId = note?.subjectId
    await deleteNoteCascade(noteId)
    go(subjectId ? `/subject/${subjectId}` : '/')
  }

  if (note === undefined) return <div className="page">Loading…</div>
  if (note === null || !note) return <div className="page">Note not found.</div>

  const aiDisabled = !hasApiKey()

  return (
    <div className="page note-page">
      <div className="crumbs">
        {subject && (
          <a href={`#/subject/${subject.id}`}>
            <SubjectChip subject={subject} /> {subject.name}
          </a>
        )}
        <span className={`save-state ${saved ? 'ok' : ''}`}>{saved ? 'Saved' : 'Saving…'}</span>
        <button className="btn btn-sm btn-danger-ghost" onClick={remove}>
          Delete
        </button>
      </div>

      <input
        className="note-title"
        value={effTitle}
        placeholder="Note title"
        onChange={(e) => updateTitle(e.target.value)}
      />

      <div className="editor-toolbar">
        <div className="tool-group">
          <button className="tool-btn" title="Bold" onClick={() => insert('**', '**', 'bold')}>
            <b>B</b>
          </button>
          <button className="tool-btn" title="Italic" onClick={() => insert('*', '*', 'italic')}>
            <i>I</i>
          </button>
          <button className="tool-btn" title="Heading" onClick={() => insert('\n## ', '', 'Heading')}>
            H
          </button>
          <button className="tool-btn" title="Highlight" onClick={() => insert('<mark>', '</mark>', 'highlight')}>
            <mark>ab</mark>
          </button>
          <button className="tool-btn" title="Bullet list" onClick={() => insert('\n- ', '', 'item')}>
            ••
          </button>
          <button className="tool-btn" title="Numbered list" onClick={() => insert('\n1. ', '', 'item')}>
            1.
          </button>
          <button className="tool-btn" title="Inline math" onClick={() => insert('$', '$', 'x^2')}>
            √x
          </button>
          <button className="tool-btn" title="Math block" onClick={() => insert('\n$$\n', '\n$$\n', 'E = mc^2')}>
            ∑
          </button>
          <button className="tool-btn" title="Add photo" onClick={pickImage}>
            🖼
          </button>
          <button className="tool-btn" title="Draw a sketch" onClick={() => setShowSketch(true)}>
            ✏️
          </button>
        </div>
        <div className="tool-group edit-preview-toggle">
          <button className={`tool-btn ${tab === 'edit' ? 'active' : ''}`} onClick={() => setTab('edit')}>
            Edit
          </button>
          <button
            className={`tool-btn ${tab === 'preview' ? 'active' : ''}`}
            onClick={() => setTab('preview')}
          >
            Preview
          </button>
        </div>
      </div>

      <div className={`editor-split show-${tab}`}>
        <textarea
          ref={textRef}
          className="editor-text"
          value={effContent}
          placeholder={'Write your notes here…\n\nMarkdown works: **bold**, lists, headings.\nMath: $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$\nPaste screenshots straight in.'}
          onChange={(e) => updateContent(e.target.value)}
          onPaste={onPaste}
        />
        <div className="editor-preview">
          {effContent.trim() ? (
            <Markdown source={effContent} />
          ) : (
            <p className="hint">Nothing to preview yet.</p>
          )}
        </div>
      </div>

      <div className="ai-bar">
        <span className="ai-bar-label">Claude</span>
        <button className="btn btn-sm" disabled={aiDisabled} onClick={() => setAiModal('cards')}>
          ⚡ Flashcards from note
        </button>
        <button className="btn btn-sm" disabled={aiDisabled} onClick={() => setAiModal('quiz')}>
          ⚡ Quiz me on this
        </button>
        <button className="btn btn-sm" disabled={aiDisabled} onClick={() => setAiModal('practice')}>
          ⚡ Example questions
        </button>
        <button className="btn btn-sm" disabled={aiDisabled} onClick={() => setAiModal('summary')}>
          ⚡ Key points
        </button>
        {aiDisabled && (
          <span className="hint">
            Add an API key in <a href="#/settings">Settings</a> to enable
          </span>
        )}
      </div>

      {showSketch && (
        <Sketchpad
          onCancel={() => setShowSketch(false)}
          onSave={async (blob) => {
            setShowSketch(false)
            await addImageBlob(blob, 'sketch')
          }}
        />
      )}
      {aiModal === 'cards' && (
        <FlashcardsModal
          subjectId={note.subjectId}
          noteTitle={effTitle}
          noteContent={effContent}
          onClose={() => setAiModal(null)}
        />
      )}
      {aiModal === 'quiz' && (
        <QuizModal
          subjectId={note.subjectId}
          noteId={note.id}
          noteTitle={effTitle}
          noteContent={effContent}
          onClose={() => setAiModal(null)}
        />
      )}
      {aiModal === 'practice' && (
        <PracticeGenModal
          subjectId={note.subjectId}
          noteId={note.id}
          initialTopic={effTitle}
          context={effContent}
          onClose={() => setAiModal(null)}
        />
      )}
      {aiModal === 'summary' && (
        <SummaryModal
          noteTitle={effTitle}
          noteContent={effContent}
          onInsert={(md) => {
            updateContent(effContent + `\n\n## Key points\n\n${md}\n`)
            setAiModal(null)
          }}
          onClose={() => setAiModal(null)}
        />
      )}
    </div>
  )
}

// ---------- AI modals ----------

function FlashcardsModal({
  subjectId,
  noteTitle,
  noteContent,
  onClose,
}: {
  subjectId: string
  noteTitle: string
  noteContent: string
  onClose: () => void
}) {
  const decks = useLiveQuery(() => db.decks.where('subjectId').equals(subjectId).toArray(), [subjectId])
  const [count, setCount] = useState(10)
  const [deckId, setDeckId] = useState<string>('new')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [cards, setCards] = useState<GeneratedCard[] | null>(null)
  const [picked, setPicked] = useState<boolean[]>([])

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await generateFlashcards(noteTitle, noteContent, count)
      setCards(result)
      setPicked(result.map(() => true))
    } catch (e) {
      setError(aiErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const saveCards = async () => {
    if (!cards) return
    let targetDeck = deckId
    if (deckId === 'new') {
      const d: Deck = { id: newId(), subjectId, name: noteTitle || 'New deck', createdAt: Date.now() }
      await db.decks.add(d)
      targetDeck = d.id
    }
    const chosen = cards.filter((_, i) => picked[i])
    await db.cards.bulkAdd(
      chosen.map((c) => ({
        id: newId(),
        deckId: targetDeck,
        front: c.front,
        back: c.back,
        createdAt: Date.now(),
        ...newCardScheduling(),
      })),
    )
    go(`/deck/${targetDeck}`)
  }

  return (
    <Modal title="Generate flashcards" onClose={onClose} wide={!!cards}>
      {!cards ? (
        <div className="stack">
          <label>
            How many cards?
            <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
              <option value={6}>6</option>
              <option value={10}>10</option>
              <option value={15}>15</option>
              <option value={20}>20</option>
            </select>
          </label>
          <label>
            Add to deck
            <select value={deckId} onChange={(e) => setDeckId(e.target.value)}>
              <option value="new">New deck: “{noteTitle || 'Untitled'}”</option>
              {(decks ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" disabled={busy} onClick={generate}>
            {busy ? 'Generating… (can take a minute)' : 'Generate'}
          </button>
        </div>
      ) : (
        <div className="stack">
          <p className="hint">Untick any you don’t want, then add them to the deck.</p>
          <div className="gen-cards">
            {cards.map((c, i) => (
              <label key={i} className={`gen-card ${picked[i] ? '' : 'off'}`}>
                <input
                  type="checkbox"
                  checked={picked[i]}
                  onChange={(e) =>
                    setPicked((p) => p.map((v, j) => (j === i ? e.target.checked : v)))
                  }
                />
                <div>
                  <Markdown source={c.front} className="gen-front" />
                  <Markdown source={c.back} className="gen-back" />
                </div>
              </label>
            ))}
          </div>
          <button className="btn btn-primary" onClick={saveCards}>
            Add {picked.filter(Boolean).length} cards
          </button>
        </div>
      )}
    </Modal>
  )
}

function QuizModal({
  subjectId,
  noteId,
  noteTitle,
  noteContent,
  onClose,
}: {
  subjectId: string
  noteId: string
  noteTitle: string
  noteContent: string
  onClose: () => void
}) {
  const [count, setCount] = useState(8)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    setBusy(true)
    setError('')
    try {
      const questions = await generateQuiz(noteTitle, noteContent, count)
      const quizId = newId()
      await db.quizzes.add({
        id: quizId,
        subjectId,
        noteId,
        title: noteTitle || 'Quiz',
        createdAt: Date.now(),
        questions: questions.map(
          (q): QuizQuestion =>
            q.type === 'mcq'
              ? {
                  id: newId(),
                  type: 'mcq',
                  prompt: q.prompt,
                  options: q.options ?? [],
                  answerIndex: q.answerIndex ?? 0,
                  explanation: q.explanation,
                }
              : {
                  id: newId(),
                  type: 'short',
                  prompt: q.prompt,
                  answer: q.answer ?? '',
                  explanation: q.explanation,
                },
        ),
      })
      go(`/quiz/${quizId}`)
    } catch (e) {
      setError(aiErrorMessage(e))
      setBusy(false)
    }
  }

  return (
    <Modal title="Generate a quiz" onClose={onClose}>
      <div className="stack">
        <p className="hint">
          Claude writes exam-style questions from this note — a mix of multiple choice and short
          answer.
        </p>
        <label>
          How many questions?
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>
            <option value={5}>5</option>
            <option value={8}>8</option>
            <option value={12}>12</option>
          </select>
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn btn-primary" disabled={busy} onClick={generate}>
          {busy ? 'Writing questions… (can take a minute)' : 'Generate quiz'}
        </button>
      </div>
    </Modal>
  )
}

function SummaryModal({
  noteTitle,
  noteContent,
  onInsert,
  onClose,
}: {
  noteTitle: string
  noteContent: string
  onInsert: (md: string) => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('')

  useEffect(() => {
    keyPoints(noteTitle, noteContent)
      .then(setSummary)
      .catch((e) => setError(aiErrorMessage(e)))
      .finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Modal title="Key points" onClose={onClose} wide>
      <div className="stack">
        {busy && <p className="hint">Summarising the note…</p>}
        {error && <p className="error">{error}</p>}
        {summary && (
          <>
            <Markdown source={summary} />
            <button className="btn btn-primary" onClick={() => onInsert(summary)}>
              Insert at end of note
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}
