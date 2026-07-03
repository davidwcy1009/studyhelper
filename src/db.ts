import Dexie, { type EntityTable } from 'dexie'
import type {
  Subject,
  Note,
  ImageAsset,
  Deck,
  Card,
  Quiz,
  QuizAttempt,
  ReviewLog,
} from './types'

export const db = new Dexie('studyhelper') as Dexie & {
  subjects: EntityTable<Subject, 'id'>
  notes: EntityTable<Note, 'id'>
  images: EntityTable<ImageAsset, 'id'>
  decks: EntityTable<Deck, 'id'>
  cards: EntityTable<Card, 'id'>
  quizzes: EntityTable<Quiz, 'id'>
  attempts: EntityTable<QuizAttempt, 'id'>
  reviews: EntityTable<ReviewLog, 'id'>
}

db.version(1).stores({
  subjects: 'id, name, createdAt',
  notes: 'id, subjectId, updatedAt',
  images: 'id',
  decks: 'id, subjectId',
  cards: 'id, deckId, due, state',
  quizzes: 'id, subjectId, noteId',
  attempts: 'id, quizId, finishedAt',
  reviews: '++id, cardId, at',
})

/** Delete image blobs referenced by a chunk of markdown (img:<id> links). */
export async function deleteImagesIn(markdown: string) {
  const ids = [...markdown.matchAll(/img:([0-9a-fA-F-]{36})/g)].map((m) => m[1])
  if (ids.length) await db.images.bulkDelete(ids)
}

export async function deleteNoteCascade(noteId: string) {
  const note = await db.notes.get(noteId)
  if (!note) return
  await deleteImagesIn(note.content)
  await db.quizzes.where('noteId').equals(noteId).modify({ noteId: undefined })
  await db.notes.delete(noteId)
}

export async function deleteDeckCascade(deckId: string) {
  const cardIds = (await db.cards.where('deckId').equals(deckId).primaryKeys()) as string[]
  await db.reviews.where('cardId').anyOf(cardIds).delete()
  await db.cards.bulkDelete(cardIds)
  await db.decks.delete(deckId)
}

export async function deleteQuizCascade(quizId: string) {
  await db.attempts.where('quizId').equals(quizId).delete()
  await db.quizzes.delete(quizId)
}

export async function deleteSubjectCascade(subjectId: string) {
  const notes = await db.notes.where('subjectId').equals(subjectId).toArray()
  for (const n of notes) await deleteNoteCascade(n.id)
  const decks = await db.decks.where('subjectId').equals(subjectId).toArray()
  for (const d of decks) await deleteDeckCascade(d.id)
  const quizzes = await db.quizzes.where('subjectId').equals(subjectId).toArray()
  for (const q of quizzes) await deleteQuizCascade(q.id)
  await db.subjects.delete(subjectId)
}
