import { db } from './db'

interface BackupImage {
  id: string
  mime: string
  data: string // base64
  createdAt: number
}

export interface BackupFile {
  app: 'studyhelper'
  version: 1
  exportedAt: string
  subjects: unknown[]
  notes: unknown[]
  decks: unknown[]
  cards: unknown[]
  quizzes: unknown[]
  attempts: unknown[]
  reviews: unknown[]
  images: BackupImage[]
  /** Added later — absent in older backups. */
  practices?: unknown[]
}

async function blobToBase64(blob: Blob): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export async function exportBackup(): Promise<Blob> {
  const [subjects, notes, decks, cards, quizzes, attempts, reviews, rawImages, practices] =
    await Promise.all([
      db.subjects.toArray(),
      db.notes.toArray(),
      db.decks.toArray(),
      db.cards.toArray(),
      db.quizzes.toArray(),
      db.attempts.toArray(),
      db.reviews.toArray(),
      db.images.toArray(),
      db.practices.toArray(),
    ])
  const images: BackupImage[] = []
  for (const img of rawImages) {
    images.push({
      id: img.id,
      mime: img.mime,
      createdAt: img.createdAt,
      data: await blobToBase64(img.blob),
    })
  }
  const payload: BackupFile = {
    app: 'studyhelper',
    version: 1,
    exportedAt: new Date().toISOString(),
    subjects,
    notes,
    decks,
    cards,
    quizzes,
    attempts,
    reviews,
    images,
    practices,
  }
  return new Blob([JSON.stringify(payload)], { type: 'application/json' })
}

export function downloadBackup(blob: Blob) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().slice(0, 10)
  a.download = `study-helper-backup-${stamp}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000)
}

/** Replaces ALL current data with the backup's contents. */
export async function importBackup(file: File): Promise<void> {
  const text = await file.text()
  let data: BackupFile
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('That file is not a valid backup (could not parse JSON).')
  }
  if (data.app !== 'studyhelper' || data.version !== 1) {
    throw new Error('That file is not a Study Helper backup.')
  }
  await db.transaction(
    'rw',
    [
      db.subjects,
      db.notes,
      db.decks,
      db.cards,
      db.quizzes,
      db.attempts,
      db.reviews,
      db.images,
      db.practices,
    ],
    async () => {
      await Promise.all([
        db.subjects.clear(),
        db.notes.clear(),
        db.decks.clear(),
        db.cards.clear(),
        db.quizzes.clear(),
        db.attempts.clear(),
        db.reviews.clear(),
        db.images.clear(),
        db.practices.clear(),
      ])
      await db.subjects.bulkAdd(data.subjects as never[])
      await db.notes.bulkAdd(data.notes as never[])
      await db.decks.bulkAdd(data.decks as never[])
      await db.cards.bulkAdd(data.cards as never[])
      await db.quizzes.bulkAdd(data.quizzes as never[])
      await db.attempts.bulkAdd(data.attempts as never[])
      await db.reviews.bulkAdd(
        (data.reviews as { cardId: string; grade: number; at: number }[]).map(
          ({ cardId, grade, at }) => ({ cardId, grade, at }),
        ) as never[],
      )
      await db.practices.bulkAdd((data.practices ?? []) as never[])
      await db.images.bulkAdd(
        data.images.map((i) => ({
          id: i.id,
          mime: i.mime,
          createdAt: i.createdAt,
          blob: base64ToBlob(i.data, i.mime),
        })),
      )
    },
  )
}
