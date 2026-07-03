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

// ---------- Photo → notes (vision) ----------

const transcriptionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'markdown'],
  properties: {
    title: { type: 'string', description: 'A short title for the note' },
    markdown: { type: 'string', description: 'The transcribed content as markdown' },
  },
} as const

export interface PhotoInput {
  base64: string
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
}

export async function transcribePhotos(
  photos: PhotoInput[],
  hint?: string,
): Promise<{ title: string; markdown: string }> {
  const res = await client().messages.create({
    model: getModel(),
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: transcriptionSchema } },
    system: `You transcribe photos of study material (textbook pages, whiteboards, handwritten notes, worksheets) into clean, well-structured markdown notes. ${STYLE_NOTES}
Rules:
- Preserve the structure: headings, lists, tables, emphasis.
- Transcribe ALL equations and chemical formulas into LaTeX.
- For diagrams or figures, add a brief italic description like *[Diagram: forces acting on an inclined plane]*.
- Fix obvious OCR-style errors, but never invent content that is not in the photo.
- If multiple photos are given, merge them into one coherent note in order.`,
    messages: [
      {
        role: 'user',
        content: [
          ...photos.map((p) => ({
            type: 'image' as const,
            source: { type: 'base64' as const, media_type: p.mediaType, data: p.base64 },
          })),
          {
            type: 'text' as const,
            text: `Transcribe ${photos.length > 1 ? 'these photos' : 'this photo'} into a markdown note.${
              hint ? ` Context from the student: ${hint}` : ''
            }`,
          },
        ],
      },
    ],
  })
  return JSON.parse(firstText(res)) as { title: string; markdown: string }
}

// ---------- AI marking ----------

export type MarkVerdict = 'correct' | 'partial' | 'incorrect'

export interface MarkResult {
  verdict: MarkVerdict
  feedback: string
}

const markingSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'feedback'],
  properties: {
    verdict: { type: 'string', enum: ['correct', 'partial', 'incorrect'] },
    feedback: {
      type: 'string',
      description: 'Markdown feedback: what was right, what was missing, what full marks needs',
    },
  },
} as const

export async function markAnswer(opts: {
  question: string
  modelAnswer: string
  userAnswer: string
}): Promise<MarkResult> {
  const res = await client().messages.create({
    model: getModel(),
    max_tokens: 4096,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: markingSchema } },
    system: `You are an experienced A-level examiner marking a student's written answer against a model answer. ${STYLE_NOTES}
Rules:
- Mark on substance, not wording — accept different phrasing, order, or notation if the physics/maths/content is right.
- "correct" = would get full or nearly full marks; "partial" = some key points but real gaps; "incorrect" = misses the point or contains a significant error.
- Feedback: 2–5 sentences. Start with what they got right, then exactly what is missing or wrong, then what a full-marks answer must include. Be encouraging but honest.`,
    messages: [
      {
        role: 'user',
        content: `Question: ${opts.question}\n\nModel answer: ${opts.modelAnswer}\n\nStudent's answer: ${opts.userAnswer}`,
      },
    ],
  })
  return JSON.parse(firstText(res)) as MarkResult
}

// ---------- Practice question sets ----------

const practiceSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'items'],
  properties: {
    title: { type: 'string', description: 'Short title for this practice set' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'solution', 'marks'],
        properties: {
          question: { type: 'string', description: 'The question, markdown' },
          solution: {
            type: 'string',
            description: 'Full worked solution / model answer, markdown, showing the steps',
          },
          marks: { type: 'integer', description: 'Marks the question would carry, 1-10' },
        },
      },
    },
  },
} as const

export interface GeneratedPractice {
  title: string
  items: { question: string; solution: string; marks: number }[]
}

export async function generatePractice(opts: {
  topic: string
  context?: string
  count: number
  style: 'homework' | 'exam' | 'mix'
}): Promise<GeneratedPractice> {
  const styleText = {
    homework: 'homework-style practice questions (build fluency: straightforward to moderately challenging, plenty of applied calculation/short-response work)',
    exam: 'exam-style questions (use exam command words like state/explain/evaluate/derive, realistic mark weightings, include at least one multi-part or stretch question)',
    mix: 'a mix of homework-style fluency questions and exam-style questions, ordered from easier to harder',
  }[opts.style]
  const res = await client().messages.create({
    model: getModel(),
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: { type: 'json_schema', schema: practiceSchema } },
    system: `You write practice questions with full worked solutions for a sixth-form student. ${STYLE_NOTES}
Rules:
- Write ${styleText}.
- Every solution must show the working step by step, not just the final answer.
- Use realistic numbers and scenarios. Vary the question formats.
- If topic notes are provided, stay within their scope; otherwise use the standard A-level/IB treatment of the topic.`,
    messages: [
      {
        role: 'user',
        content: `Write ${opts.count} practice questions on: ${opts.topic}${
          opts.context ? `\n\nThe student's notes on this topic:\n${opts.context}` : ''
        }`,
      },
    ],
  })
  return JSON.parse(firstText(res)) as GeneratedPractice
}

/** Cheap round-trip to confirm the key works. */
export async function testApiKey(): Promise<void> {
  await client().models.retrieve(getModel())
}
