export interface Subject {
  id: string
  name: string
  /** Index into the 8-slot categorical palette (--cat-0 … --cat-7). */
  color: number
  /** ISO date (yyyy-mm-dd) of the exam for this subject, if set. */
  examDate?: string
  createdAt: number
}

export interface Note {
  id: string
  subjectId: string
  title: string
  /** Markdown. Math via $…$ / $$…$$. Images reference blobs as img:<assetId>. */
  content: string
  createdAt: number
  updatedAt: number
}

export interface ImageAsset {
  id: string
  blob: Blob
  mime: string
  createdAt: number
}

export interface Deck {
  id: string
  subjectId: string
  name: string
  createdAt: number
}

export type CardState = 'new' | 'learning' | 'review'

export interface Card {
  id: string
  deckId: string
  front: string
  back: string
  createdAt: number
  // Spaced-repetition scheduling (SM-2 style)
  state: CardState
  /** Timestamp (ms) when the card is next due. */
  due: number
  /** Review interval in days once graduated. */
  interval: number
  /** Ease factor, starts at 2.5, floor 1.3. */
  ease: number
  /** Index into the learning steps while state === 'learning'. */
  step: number
  reps: number
  lapses: number
}

export type QuizQuestion =
  | {
      id: string
      type: 'mcq'
      prompt: string
      options: string[]
      answerIndex: number
      explanation?: string
    }
  | {
      id: string
      type: 'short'
      prompt: string
      answer: string
      explanation?: string
    }

export interface Quiz {
  id: string
  subjectId: string
  noteId?: string
  title: string
  questions: QuizQuestion[]
  createdAt: number
}

export interface QuizAttempt {
  id: string
  quizId: string
  correct: boolean[]
  score: number
  total: number
  finishedAt: number
}

export interface PracticeItem {
  id: string
  /** Question text, markdown. */
  question: string
  /** Worked solution / model answer, markdown. */
  solution: string
  /** Suggested marks for the question (exam-style weighting). */
  marks?: number
}

export type PracticeStyle = 'homework' | 'exam' | 'mix'

export interface PracticeSet {
  id: string
  subjectId: string
  /** Set when generated from a note. */
  noteId?: string
  title: string
  style: PracticeStyle
  items: PracticeItem[]
  createdAt: number
}

export interface ReviewLog {
  id?: number
  cardId: string
  grade: number
  at: number
}

export const newId = () => crypto.randomUUID()
