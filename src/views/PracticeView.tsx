import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { newId, type PracticeItem } from '../types'
import { Markdown } from '../markdown'
import { aiErrorMessage, generatePractice, hasApiKey, markAnswer, type MarkResult } from '../ai'
import { go, SubjectChip } from '../App'

const STYLE_LABEL = { homework: 'Homework practice', exam: 'Exam-style', mix: 'Mixed' }

export function PracticeView({ practiceId }: { practiceId: string }) {
  const set = useLiveQuery(() => db.practices.get(practiceId), [practiceId])
  const subject = useLiveQuery(
    () => (set ? db.subjects.get(set.subjectId) : undefined),
    [set?.subjectId],
  )
  const [regenerating, setRegenerating] = useState(false)
  const [regenError, setRegenError] = useState('')

  if (set === undefined) return <div className="page">Loading…</div>
  if (!set) return <div className="page">Practice set not found.</div>

  const remove = async () => {
    if (!confirm('Delete this practice set?')) return
    await db.practices.delete(practiceId)
    go(`/subject/${set.subjectId}`)
  }

  // Generate a fresh set on the same topic and style (using the captured
  // styleNotes when this set came from photos of her real papers).
  const regenerate = async () => {
    setRegenerating(true)
    setRegenError('')
    try {
      const result = await generatePractice({
        topic: set.topic || set.title,
        count: set.items.length || 5,
        style: set.style,
        styleNotes: set.styleNotes,
      })
      const id = newId()
      await db.practices.add({
        id,
        subjectId: set.subjectId,
        noteId: set.noteId,
        title: result.title || set.title,
        topic: set.topic,
        style: set.style,
        styleNotes: set.styleNotes,
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
      setRegenError(aiErrorMessage(e))
      setRegenerating(false)
    }
  }

  return (
    <div className="page">
      <div className="crumbs">
        {subject && (
          <a href={`#/subject/${subject.id}`}>
            <SubjectChip subject={subject} /> {subject.name}
          </a>
        )}
        <button className="btn btn-sm btn-danger-ghost" onClick={remove}>
          Delete
        </button>
      </div>
      <div className="page-head">
        <h1>{set.title}</h1>
        <span className="row-chips">
          <span className="count-chip">{STYLE_LABEL[set.style]}</span>
          {set.styleNotes && <span className="count-chip">📷 matched to your papers</span>}
        </span>
      </div>
      <p className="hint">
        Work each question on paper (or type an answer to have Claude mark it), then reveal the
        solution.
      </p>
      {hasApiKey() && set.topic && (
        <div className="head-actions">
          <button className="btn btn-sm" disabled={regenerating} onClick={regenerate}>
            {regenerating ? 'Writing more…' : '⚡ More questions like these'}
          </button>
        </div>
      )}
      {regenError && <p className="error">{regenError}</p>}
      {set.items.map((item, i) => (
        <PracticeQuestion key={item.id} item={item} index={i} />
      ))}
    </div>
  )
}

function PracticeQuestion({ item, index }: { item: PracticeItem; index: number }) {
  const [showSolution, setShowSolution] = useState(false)
  const [answer, setAnswer] = useState('')
  const [marking, setMarking] = useState(false)
  const [mark, setMark] = useState<MarkResult | null>(null)
  const [error, setError] = useState('')

  const doMark = async () => {
    setMarking(true)
    setError('')
    try {
      setMark(
        await markAnswer({
          question: item.question,
          modelAnswer: item.solution,
          userAnswer: answer,
        }),
      )
      setShowSolution(true)
    } catch (e) {
      setError(aiErrorMessage(e))
    } finally {
      setMarking(false)
    }
  }

  return (
    <div className="practice-q panel">
      <div className="practice-q-head">
        <h3>Question {index + 1}</h3>
        {item.marks != null && <span className="count-chip">{item.marks} marks</span>}
      </div>
      <Markdown source={item.question} />

      <textarea
        className="practice-answer"
        placeholder="Type your answer here if you want Claude to mark it…"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />
      <div className="head-actions">
        {hasApiKey() && (
          <button className="btn btn-sm" disabled={!answer.trim() || marking} onClick={doMark}>
            {marking ? 'Marking…' : '⚡ Mark my answer'}
          </button>
        )}
        <button className="btn btn-sm" onClick={() => setShowSolution((v) => !v)}>
          {showSolution ? 'Hide solution' : 'Show solution'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {mark && <MarkFeedback mark={mark} />}
      {showSolution && (
        <div className="model-answer">
          <h4>Worked solution</h4>
          <Markdown source={item.solution} />
        </div>
      )}
    </div>
  )
}

export function MarkFeedback({ mark }: { mark: MarkResult }) {
  const label = { correct: '✅ Correct', partial: '🟡 Partly there', incorrect: '❌ Not yet' }[
    mark.verdict
  ]
  return (
    <div className={`mark-feedback ${mark.verdict}`}>
      <h4>{label}</h4>
      <Markdown source={mark.feedback} />
    </div>
  )
}
