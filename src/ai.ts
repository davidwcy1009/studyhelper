import Anthropic from '@anthropic-ai/sdk'

/**
 * Claude API integration. The API key lives only in this browser's
 * localStorage (entered in Settings) — it is never part of the code.
 */

const KEY_STORAGE = 'sh.apiKey'
const MODEL_STORAGE = 'sh.model'
export const DEFAULT_MODEL = 'claude-opus-4-8'

export const MODEL_CHOICES: { id: string; label: string; hint: string }[] = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', hint: 'Best quality (default)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', hint: 'Great quality, lower cost' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', hint: 'Fastest and cheapest' },
]

export const getApiKey = () => localStorage.getItem(KEY_STORAGE) ?? ''
export const setApiKey = (k: string) =>
  k ? localStorage.setItem(KEY_STORAGE, k.trim()) : localStorage.removeItem(KEY_STORAGE)
export const hasApiKey = () => getApiKey().length > 0
export const getModel = () => localStorage.getItem(MODEL_STORAGE) ?? DEFAULT_MODEL
export const setModel = (m: string) => localStorage.setItem(MODEL_STORAGE, m)

function client(): Anthropic {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('No Claude API key set — add one in Settings to use AI features.')
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true })
}

export function aiErrorMessage(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) {
    return 'The API key was rejected. Check it in Settings.'
  }
  if (e instanceof Anthropic.RateLimitError) {
    return 'Rate limited by the API — wait a minute and try again.'
  }
  if (e instanceof Anthropic.APIConnectionError) {
    return 'Could not reach the Claude API. Check your internet connection.'
  }
  if (e instanceof Anthropic.APIError) {
    return `Claude API error (${e.status ?? '?'}): ${e.message}`
  }
  return e instanceof Error ? e.message : String(e)
}

const STYLE_NOTES = `Write for a sixth-form (A-level/IB) student.
Use markdown. For any mathematics, chemistry or physics notation use LaTeX delimited by $...$ (inline) or $$...$$ (display) — e.g. $\\frac{dy}{dx}$, $\\text{H}_2\\text{SO}_4$. Never use unicode superscripts or plain-text fractions.`

function firstText(res: Anthropic.Message): string {
  if (res.stop_reason === 'refusal') {
    throw new Error('The model declined to answer this request.')
  }
  const block = res.content.find((b) => b.type === 'text')
  if (!block || block.type !== 'text') throw new Error('The model returned no text.')
  if (res.stop_reason === 'max_tokens') {
    throw new Error('The response was cut off — try generating fewer items at once.')
  }
  return block.text
}

// ---------- Flashcard generation ----------

export interface GeneratedCard {
  front: string
  back: string
}

const cardsSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['cards'],
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['front', 'back'],
        properties: {
          front: { type: 'string', description: 'The question/prompt side, markdown' },
          back: { type: 'string', description: 'The answer side, markdown' },
        },
      },
    },
  },
} as const

export async function generateFlashcards(
  noteTitle: string,
  noteContent: string,
  count: number,
): Promise<GeneratedCard[]> {
  const res = await client().messages.create({
    model: getModel(),
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: cardsSchema } },
    system: `You create excellent spaced-repetition flashcards from study notes. ${STYLE_NOTES}
Rules for good cards:
- One atomic fact or idea per card; short fronts, precise backs.
- Prefer "why/how" and applied questions over pure recall where the material allows.
- Cover the whole note evenly; do not invent material that is not in the note.`,
    messages: [
      {
        role: 'user',
        content: `Create exactly ${count} flashcards from this note titled "${noteTitle}":\n\n${noteContent}`,
      },
    ],
  })
  const parsed = JSON.parse(firstText(res)) as { cards: GeneratedCard[] }
  return parsed.cards
}

// ---------- Quiz generation ----------

const quizSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        anyOf: [
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'prompt', 'options', 'answerIndex', 'explanation'],
            properties: {
              type: { const: 'mcq' },
              prompt: { type: 'string' },
              options: { type: 'array', items: { type: 'string' } },
              answerIndex: { type: 'integer', enum: [0, 1, 2, 3] },
              explanation: { type: 'string' },
            },
          },
          {
            type: 'object',
            additionalProperties: false,
            required: ['type', 'prompt', 'answer', 'explanation'],
            properties: {
              type: { const: 'short' },
              prompt: { type: 'string' },
              answer: { type: 'string' },
              explanation: { type: 'string' },
            },
          },
        ],
      },
    },
  },
} as const

export interface GeneratedQuizQuestion {
  type: 'mcq' | 'short'
  prompt: string
  options?: string[]
  answerIndex?: number
  answer?: string
  explanation: string
}

export async function generateQuiz(
  noteTitle: string,
  noteContent: string,
  count: number,
): Promise<GeneratedQuizQuestion[]> {
  const nShort = Math.max(1, Math.round(count / 3))
  const nMcq = count - nShort
  const res = await client().messages.create({
    model: getModel(),
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: quizSchema } },
    system: `You write exam-style practice questions from study notes. ${STYLE_NOTES}
Rules:
- Multiple-choice questions have exactly 4 options with one correct answer and plausible distractors.
- Short-answer questions should resemble real exam questions; the "answer" field is a model answer.
- Every question includes a brief explanation of the correct answer.
- Only test material present in the note. Mix difficulty from straightforward to stretch.`,
    messages: [
      {
        role: 'user',
        content: `Write ${nMcq} multiple-choice questions and ${nShort} short-answer questions from this note titled "${noteTitle}":\n\n${noteContent}`,
      },
    ],
  })
  const parsed = JSON.parse(firstText(res)) as { questions: GeneratedQuizQuestion[] }
  return parsed.questions
}

// ---------- Explanations & summaries ----------

export async function explainMistake(opts: {
  question: string
  correctAnswer: string
  userAnswer?: string
  context?: string
}): Promise<string> {
  const res = await client().messages.create({
    model: getModel(),
    max_tokens: 2048,
    system: `You are a patient, encouraging A-level tutor. Explain in a few short paragraphs why the correct answer is right${
      opts.userAnswer ? ' and where the student’s answer went wrong' : ''
    }. Be concrete and end with a one-line takeaway to remember. ${STYLE_NOTES}`,
    messages: [
      {
        role: 'user',
        content: `Question: ${opts.question}\nCorrect answer: ${opts.correctAnswer}${
          opts.userAnswer ? `\nMy answer: ${opts.userAnswer}` : ''
        }${opts.context ? `\n\nTopic context:\n${opts.context}` : ''}`,
      },
    ],
  })
  return firstText(res)
}

export async function keyPoints(noteTitle: string, noteContent: string): Promise<string> {
  const res = await client().messages.create({
    model: getModel(),
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    system: `You distil study notes into concise revision summaries. ${STYLE_NOTES}
Return only markdown: a short bullet list of the key points, definitions and formulas an examiner would expect. No preamble.`,
    messages: [
      {
        role: 'user',
        content: `Summarise the key revision points of this note titled "${noteTitle}":\n\n${noteContent}`,
      },
    ],
  })
  return firstText(res)
}

/** Cheap round-trip to confirm the key works. */
export async function testApiKey(): Promise<void> {
  await client().models.retrieve(getModel())
}
