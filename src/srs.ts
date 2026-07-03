import type { Card } from './types'

/**
 * SM-2 style spaced repetition (the algorithm behind Anki).
 * Grades: 0 Again · 1 Hard · 2 Good · 3 Easy
 */
export type Grade = 0 | 1 | 2 | 3

const MIN = 60_000
const DAY = 86_400_000
/** Sub-day steps a card climbs before graduating to day-based intervals. */
const LEARNING_STEPS = [1 * MIN, 10 * MIN]
const GRADUATE_DAYS = 1
const EASY_GRADUATE_DAYS = 4
const MAX_INTERVAL_DAYS = 3650

export function newCardScheduling(): Pick<
  Card,
  'state' | 'due' | 'interval' | 'ease' | 'step' | 'reps' | 'lapses'
> {
  return { state: 'new', due: Date.now(), interval: 0, ease: 2.5, step: 0, reps: 0, lapses: 0 }
}

/** Returns a card with updated scheduling after grading. Does not persist. */
export function schedule(card: Card, grade: Grade, now = Date.now()): Card {
  const c = { ...card }
  if (c.state === 'new') {
    c.state = 'learning'
    c.step = 0
  }

  if (c.state === 'learning') {
    if (grade === 0) {
      c.step = 0
      c.due = now + LEARNING_STEPS[0]
    } else if (grade === 1) {
      c.due = now + LEARNING_STEPS[Math.min(c.step, LEARNING_STEPS.length - 1)]
    } else if (grade === 2) {
      c.step += 1
      if (c.step >= LEARNING_STEPS.length) {
        c.state = 'review'
        c.interval = GRADUATE_DAYS
        c.due = now + c.interval * DAY
        c.reps += 1
      } else {
        c.due = now + LEARNING_STEPS[c.step]
      }
    } else {
      c.state = 'review'
      c.interval = EASY_GRADUATE_DAYS
      c.due = now + c.interval * DAY
      c.reps += 1
    }
    return c
  }

  // review state
  if (grade === 0) {
    c.lapses += 1
    c.ease = Math.max(1.3, c.ease - 0.2)
    c.state = 'learning'
    c.step = 0
    c.interval = Math.max(1, Math.round(c.interval * 0.3))
    c.due = now + LEARNING_STEPS[LEARNING_STEPS.length - 1]
  } else if (grade === 1) {
    c.ease = Math.max(1.3, c.ease - 0.15)
    c.interval = clampInterval(c.interval * 1.2)
    c.due = now + c.interval * DAY
    c.reps += 1
  } else if (grade === 2) {
    c.interval = clampInterval(c.interval * c.ease)
    c.due = now + c.interval * DAY
    c.reps += 1
  } else {
    c.ease += 0.15
    c.interval = clampInterval(c.interval * c.ease * 1.3)
    c.due = now + c.interval * DAY
    c.reps += 1
  }
  return c
}

function clampInterval(days: number): number {
  return Math.min(MAX_INTERVAL_DAYS, Math.max(1, Math.round(days * 10) / 10))
}

/** Human label for how far away each grade would push the card, e.g. "10m", "4d". */
export function previewIntervals(card: Card, now = Date.now()): [string, string, string, string] {
  const label = (c: Card) => formatSpan(c.due - now)
  return [0, 1, 2, 3].map((g) => label(schedule(card, g as Grade, now))) as [
    string,
    string,
    string,
    string,
  ]
}

export function formatSpan(ms: number): string {
  if (ms < MIN) return '<1m'
  if (ms < 60 * MIN) return `${Math.round(ms / MIN)}m`
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))}h`
  const days = ms / DAY
  if (days < 30) return `${Math.round(days)}d`
  if (days < 365) return `${(days / 30.4).toFixed(1).replace(/\.0$/, '')}mo`
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}y`
}

export function endOfToday(now = Date.now()): number {
  const d = new Date(now)
  d.setHours(23, 59, 59, 999)
  return d.getTime()
}

/** True if the card should appear in today's study queue. */
export function isDue(card: Card, now = Date.now()): boolean {
  return card.state !== 'new' && card.due <= endOfToday(now)
}

export function localDay(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/** Consecutive-day study streak given the set of days with activity. */
export function computeStreak(activityDays: Set<string>, now = Date.now()): number {
  let streak = 0
  const cursor = new Date(now)
  // If nothing today yet, a streak kept alive through yesterday still counts.
  if (!activityDays.has(localDay(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1)
  }
  while (activityDays.has(localDay(cursor.getTime()))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}
