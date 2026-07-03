import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, deleteQuizCascade } from '../db'
import { newId, type QuizQuestion } from '../types'
import { Markdown } from '../markdown'
import { aiErrorMessage, explainMistake, hasApiKey, markAnswer, type MarkResult } from '../ai'
import { MarkFeedback } from './PracticeView'
import { go, SubjectChip } from '../App'

type Phase = 'intro' | 'playing' | 'done'

export function QuizPlayer({ quizId }: { quizId: string }) {
  const quiz = useLiveQuery(() => db.quizzes.get(quizId), [quizId])
  const subject = useLiveQuery(
    () => (quiz ? db.subjects.get(quiz.subjectId) : undefined),
    [quiz?.subjectId],
  )
  const attempts = useLiveQuery(
    () => db.attempts.where('quizId').equals(quizId).reverse().sortBy('finishedAt'),
    [quizId],
  )

  const [phase, setPhase] = useState<Phase>('intro')
  const [index, setIndex] = useState(0)
  const [correct, setCorrect] = useState<boolean[]>([])

  if (quiz === undefined) return <div className="page">Loading…</div>
  if (!quiz) return <div className="page">Quiz not found.</div>

  const start = () => {
    setCorrect([])
    setIndex(0)
    setPhase('playing')
  }

  const onAnswered = async (wasCorrect: boolean) => {
    const next = [...correct, wasCorrect]
    setCorrect(next)
    if (index + 1 < quiz.questions.length) {
      setIndex(index + 1)
    } else {
      await db.attempts.add({
        id: newId(),
        quizId,
        correct: next,
        score: next.filter(Boolean).length,
        total: quiz.questions.length,
        finishedAt: Date.now(),
      })
      setPhase('done')
    }
  }

  const best = attempts?.length
    ? Math.max(...attempts.map((a) => Math.round((a.score / a.total) * 100)))
    : null

  if (phase === 'intro') {
    return (
      <div className="page">
        <div className="crumbs">
          {subject && (
            <a href={`#/subject/${subject.id}`}>
              <SubjectChip subject={subject} /> {subject.name}
            </a>
          )}
          <button
            className="btn btn-sm btn-danger-ghost"
            onClick={async () => {
              if (confirm('Delete this quiz and its attempt history?')) {
                await deleteQuizCascade(quizId)
                go(subject ? `/subject/${subject.id}` : '/')
              }
            }}
          >
            Delete
          </button>
        </div>
        <div className="quiz-intro">
          <h1>{quiz.title}</h1>
          <p>
            {quiz.questions.length} questions
            {best !== null && <> · best score {best}%</>}
            {attempts?.length ? <> · taken {attempts.length}×</> : null}
          </p>
          <button className="btn btn-primary btn-big" onClick={start}>
            {attempts?.length ? 'Retake quiz' : 'Start quiz'}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    const score = correct.filter(Boolean).length
    const pct = Math.round((score / quiz.questions.length) * 100)
    const wrong = quiz.questions.filter((_, i) => !correct[i])
    return (
      <div className="page">
        <div className="quiz-intro">
          <div className="study-end-emoji">{pct >= 80 ? '🏆' : pct >= 50 ? '💪' : '📖'}</div>
          <h1>
            {score} / {quiz.questions.length} ({pct}%)
          </h1>
          {wrong.length > 0 && <p className="hint">Worth revisiting:</p>}
          <div className="stack">
            {wrong.map((q) => (
              <MissedQuestion key={q.id} q={q} />
            ))}
          </div>
          <div className="head-actions" style={{ justifyContent: 'center', marginTop: 16 }}>
            <button className="btn btn-primary" onClick={start}>
              Retake
            </button>
            <a className="btn" href={subject ? `#/subject/${subject.id}` : '#/'}>
              Done
            </a>
          </div>
        </div>
      </div>
    )
  }

  const q = quiz.questions[index]
  return (
    <div className="page study-page">
      <div className="study-top">
        <a href={`#/quiz/${quizId}`} className="btn btn-sm" onClick={() => setPhase('intro')}>
          ✕ End
        </a>
        <span className="study-progress">
          Question {index + 1} / {quiz.questions.length}
        </span>
      </div>
      <Question key={q.id} q={q} onAnswered={onAnswered} />
    </div>
  )
}

function MissedQuestion({ q }: { q: QuizQuestion }) {
  return (
    <div className="model-answer missed-q">
      <Markdown source={q.prompt} className="quiz-prompt" />
      <Markdown source={q.type === 'mcq' ? q.options[q.answerIndex] : q.answer} />
      {q.explanation && <Markdown source={q.explanation} className="hint" />}
      <ExplainMore
        question={q.prompt}
        correctAnswer={q.type === 'mcq' ? q.options[q.answerIndex] : q.answer}
      />
    </div>
  )
}

function Question({
  q,
  onAnswered,
}: {
  q: QuizQuestion
  onAnswered: (correct: boolean) => void
}) {
  const [chosen, setChosen] = useState<number | null>(null)
  const [shortAnswer, setShortAnswer] = useState('')
  const [revealed, setRevealed] = useState(false)

  if (q.type === 'mcq') {
    const locked = chosen !== null
    return (
      <div className="quiz-question">
        <Markdown source={q.prompt} className="quiz-prompt" />
        <div className="quiz-options">
          {q.options.map((opt, i) => {
            let cls = 'quiz-option'
            if (locked) {
              if (i === q.answerIndex) cls += ' correct'
              else if (i === chosen) cls += ' wrong'
              else cls += ' muted'
            }
            return (
              <button key={i} className={cls} disabled={locked} onClick={() => setChosen(i)}>
                <span className="opt-letter">{String.fromCharCode(65 + i)}</span>
                <Markdown source={opt} />
              </button>
            )
          })}
        </div>
        {locked && (
          <ExplainBlock
            heading={chosen === q.answerIndex ? 'Correct!' : 'Not quite.'}
            ok={chosen === q.answerIndex}
            explanation={q.explanation}
            question={q.prompt}
            correctAnswer={q.options[q.answerIndex]}
            userAnswer={chosen !== null ? q.options[chosen] : undefined}
          />
        )}
        {locked && (
          <button
            className="btn btn-primary btn-big"
            onClick={() => onAnswered(chosen === q.answerIndex)}
          >
            Next
          </button>
        )}
      </div>
    )
  }

  // short answer — AI-marked when a key is set, self-marked otherwise
  return (
    <ShortAnswer
      prompt={q.prompt}
      answer={q.answer}
      explanation={q.explanation}
      shortAnswer={shortAnswer}
      setShortAnswer={setShortAnswer}
      revealed={revealed}
      setRevealed={setRevealed}
      onAnswered={onAnswered}
    />
  )
}

function ShortAnswer({
  prompt,
  answer,
  explanation,
  shortAnswer,
  setShortAnswer,
  revealed,
  setRevealed,
  onAnswered,
}: {
  prompt: string
  answer: string
  explanation?: string
  shortAnswer: string
  setShortAnswer: (v: string) => void
  revealed: boolean
  setRevealed: (v: boolean) => void
  onAnswered: (correct: boolean) => void
}) {
  const [mark, setMark] = useState<MarkResult | null>(null)
  const [marking, setMarking] = useState(false)
  const [markError, setMarkError] = useState('')

  const doMark = async () => {
    setMarking(true)
    setMarkError('')
    try {
      setMark(await markAnswer({ question: prompt, modelAnswer: answer, userAnswer: shortAnswer }))
      setRevealed(true)
    } catch (e) {
      setMarkError(aiErrorMessage(e))
    } finally {
      setMarking(false)
    }
  }

  // Claude suggests the verdict; she confirms how it counts.
  const suggestRight = mark?.verdict === 'correct'

  return (
    <div className="quiz-question">
      <Markdown source={prompt} className="quiz-prompt" />
      <textarea
        className="quiz-short-input"
        placeholder={
          hasApiKey()
            ? 'Write your answer — Claude can mark it like an examiner…'
            : 'Write your answer, then compare with the model answer…'
        }
        value={shortAnswer}
        onChange={(e) => setShortAnswer(e.target.value)}
        disabled={revealed}
      />
      {markError && <p className="error">{markError}</p>}
      {!revealed ? (
        <div className="head-actions">
          {hasApiKey() && (
            <button
              className="btn btn-primary"
              disabled={!shortAnswer.trim() || marking}
              onClick={doMark}
            >
              {marking ? 'Marking…' : '⚡ Mark my answer'}
            </button>
          )}
          <button className="btn" disabled={marking} onClick={() => setRevealed(true)}>
            Show model answer
          </button>
        </div>
      ) : (
        <>
          {mark && <MarkFeedback mark={mark} />}
          <div className="model-answer">
            <h4>Model answer</h4>
            <Markdown source={answer} />
            {explanation && <Markdown source={explanation} className="hint" />}
          </div>
          {!mark && (
            <ExplainMore question={prompt} correctAnswer={answer} userAnswer={shortAnswer} />
          )}
          <div className="grade-row practice">
            <button
              className={`btn grade-btn grade-0 ${mark && !suggestRight ? 'suggested' : ''}`}
              onClick={() => onAnswered(false)}
            >
              <span>{mark && !suggestRight ? 'Count as wrong ✓' : 'I missed it'}</span>
            </button>
            <button
              className={`btn grade-btn grade-2 ${suggestRight ? 'suggested' : ''}`}
              onClick={() => onAnswered(true)}
            >
              <span>{suggestRight ? 'Count as right ✓' : 'I got it right'}</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ExplainBlock({
  heading,
  ok,
  explanation,
  question,
  correctAnswer,
  userAnswer,
}: {
  heading: string
  ok: boolean
  explanation?: string
  question: string
  correctAnswer: string
  userAnswer?: string
}) {
  return (
    <div className={`quiz-feedback ${ok ? 'ok' : 'no'}`}>
      <h4>{heading}</h4>
      {explanation && <Markdown source={explanation} />}
      {!ok && (
        <ExplainMore question={question} correctAnswer={correctAnswer} userAnswer={userAnswer} />
      )}
    </div>
  )
}

function ExplainMore({
  question,
  correctAnswer,
  userAnswer,
}: {
  question: string
  correctAnswer: string
  userAnswer?: string
}) {
  const [busy, setBusy] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  if (!hasApiKey()) return null
  return (
    <div className="explain-more">
      {!text && (
        <button
          className="btn btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            setError('')
            try {
              setText(await explainMistake({ question, correctAnswer, userAnswer }))
            } catch (e) {
              setError(aiErrorMessage(e))
            } finally {
              setBusy(false)
            }
          }}
        >
          {busy ? 'Asking Claude…' : '⚡ Explain this to me'}
        </button>
      )}
      {error && <p className="error">{error}</p>}
      {text && <Markdown source={text} className="tutor-text" />}
    </div>
  )
}
