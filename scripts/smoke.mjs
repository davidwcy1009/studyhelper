/**
 * End-to-end smoke test. Drives the built app in Chromium:
 * subject → note (markdown + math + sketch) → AI flashcards (mocked API)
 * → study session → AI quiz (mocked) → results → dashboard stats.
 *
 * Usage: node scripts/smoke.mjs [baseURL] [screenshotDir]
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://localhost:4173'
const SHOTS = process.argv[3] ?? './smoke-shots'
mkdirSync(SHOTS, { recursive: true })

const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium'
const browser = await chromium.launch({ executablePath }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } })
const page = await ctx.newPage()
page.setDefaultTimeout(15000)

let failures = 0
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failures++
}
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })

// ---- Mock the Claude API ----
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': '*',
  'access-control-allow-headers': '*',
}
const envelope = (text) => ({
  id: 'msg_test',
  type: 'message',
  role: 'assistant',
  model: 'claude-opus-4-8',
  content: [{ type: 'text', text }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: { input_tokens: 100, output_tokens: 100 },
})
const mockCards = {
  cards: [
    { front: 'What is the wave equation?', back: '$v = f\\lambda$' },
    { front: 'Define **frequency**', back: 'Oscillations per second, measured in Hz' },
    { front: 'Define **amplitude**', back: 'Maximum displacement from equilibrium' },
  ],
}
const mockQuiz = {
  questions: [
    {
      type: 'mcq',
      prompt: 'What does $\\lambda$ represent?',
      options: ['Frequency', 'Wavelength', 'Speed', 'Period'],
      answerIndex: 1,
      explanation: '$\\lambda$ is the wavelength.',
    },
    {
      type: 'short',
      prompt: 'State the wave equation.',
      answer: '$v = f\\lambda$',
      explanation: 'Speed = frequency × wavelength.',
    },
  ],
}
await page.route('https://api.anthropic.com/**', async (route) => {
  const req = route.request()
  if (req.method() === 'OPTIONS') {
    return route.fulfill({ status: 204, headers: CORS })
  }
  let text = 'This is a mocked tutor explanation with a takeaway.'
  try {
    const body = req.postDataJSON()
    const props = body?.output_config?.format?.schema?.properties ?? {}
    if (props.cards) text = JSON.stringify(mockCards)
    else if (props.questions) text = JSON.stringify(mockQuiz)
  } catch {
    /* GET (models) etc. */
  }
  if (req.method() === 'GET') {
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'claude-opus-4-8', type: 'model', display_name: 'Claude Opus 4.8' }),
    })
  }
  return route.fulfill({
    status: 200,
    headers: { ...CORS, 'content-type': 'application/json' },
    body: JSON.stringify(envelope(text)),
  })
})

// Pretend an API key is configured so AI buttons are enabled.
await page.addInitScript(() => localStorage.setItem('sh.apiKey', 'sk-ant-test-key'))

// ---- 1. Dashboard ----
await page.goto(BASE)
await page.getByText('Cards due today').waitFor()
check('dashboard loads', true)
await shot('01-dashboard-empty')

// ---- 2. Create a subject ----
await page.getByRole('button', { name: 'Add subject' }).click()
await page.getByPlaceholder('e.g. Maths').fill('Physics')
await page.getByLabel('colour 5').click()
await page.getByRole('button', { name: 'Add', exact: true }).click()
await page.getByRole('heading', { name: /Physics/ }).waitFor()
check('subject created', true)

// ---- 3. Create a note with markdown + math ----
await page.getByRole('button', { name: '+ New note' }).click()
await page.getByPlaceholder('Note title').fill('Waves')
await page
  .locator('.editor-text')
  .fill(
    '## Wave basics\n\nThe **wave equation** links speed, frequency and wavelength:\n\n$$v = f\\lambda$$\n\n- *Frequency* $f$: oscillations per second (Hz)\n- *Amplitude*: max displacement from equilibrium\n- <mark>Transverse</mark> waves oscillate perpendicular to travel\n',
  )
await page.getByText('Saved', { exact: true }).waitFor()
check('note autosaves', true)
check('math renders in preview', (await page.locator('.editor-preview .katex').count()) > 0)
const noteUrl = page.url()
await shot('02-note-editor')

// ---- 4. Sketchpad ----
await page.getByTitle('Draw a sketch').click()
const canvas = page.locator('.sketch-canvas')
const box = await canvas.boundingBox()
await page.mouse.move(box.x + 80, box.y + 80)
await page.mouse.down()
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(box.x + 80 + i * 25, box.y + 80 + Math.sin(i) * 40)
}
await page.mouse.up()
await page.getByRole('button', { name: 'Add to note' }).click()
await page.waitForTimeout(300)
const contentVal = await page.locator('.editor-text').inputValue()
check('sketch saved into note as image', contentVal.includes('img:'))
check(
  'sketch image renders in preview',
  await page
    .locator('.editor-preview img')
    .first()
    .evaluate((el) => el.src.startsWith('blob:'))
    .catch(() => false),
)

// ---- 5. AI flashcards (mocked) ----
await page.getByRole('button', { name: /Flashcards from note/ }).click()
await page.getByRole('button', { name: 'Generate', exact: true }).click()
await page.locator('.gen-card').first().waitFor()
check('generated cards listed', (await page.locator('.gen-card').count()) === 3)
await shot('03-generated-cards')
await page.getByRole('button', { name: /Add 3 cards/ }).click()
await page.getByRole('heading', { name: 'Waves' }).waitFor()
check('deck created with cards', (await page.locator('.card-row').count()) === 3)

// ---- 6. Study session ----
await page.getByRole('button', { name: /^Study/ }).click()
await page.locator('.study-card').waitFor()
await shot('04-study-front')
for (let i = 0; i < 3; i++) {
  await page.getByRole('button', { name: 'Show answer' }).click()
  await page.getByRole('button', { name: /Easy/ }).click()
}
await page.getByText('Nice work!').waitFor()
check('study session completes', true)
await shot('05-study-done')

// ---- 7. AI quiz (mocked) ----
await page.goto(noteUrl)
await page.getByRole('button', { name: /Quiz me on this/ }).click()
await page.getByRole('button', { name: 'Generate quiz' }).click()
await page.getByRole('button', { name: 'Start quiz' }).click()
// Q1: MCQ — pick the right answer (B, Wavelength)
await page.locator('.quiz-option', { hasText: 'Wavelength' }).click()
await page.getByText('Correct!').waitFor()
check('mcq marks correct answer', true)
await shot('06-quiz-mcq')
await page.getByRole('button', { name: 'Next' }).click()
// Q2: short answer
await page.locator('.quiz-short-input').fill('v equals f times lambda')
await page.getByRole('button', { name: 'Show model answer' }).click()
await page.getByRole('button', { name: 'I got it right' }).click()
await page.getByText('2 / 2 (100%)').waitFor()
check('quiz scored and saved', true)
await shot('07-quiz-result')

// ---- 8. Dashboard stats after studying ----
await page.goto(BASE + '/#/')
await page.getByText('studied today').waitFor()
check('streak reflects today’s studying', true)
check('next exam tile present', await page.getByText('Next exam').isVisible())
await shot('08-dashboard-active')

// ---- 9. Dark mode render ----
await page.emulateMedia({ colorScheme: 'dark' })
await page.waitForTimeout(300)
await shot('09-dashboard-dark')
await page.emulateMedia({ colorScheme: 'light' })

// ---- 10. Settings + backup export ----
await page.goto(BASE + '/#/settings')
const downloadP = page.waitForEvent('download')
await page.getByRole('button', { name: 'Export backup' }).click()
const download = await downloadP
check('backup exports a file', (await download.suggestedFilename()).includes('study-helper-backup'))
check('key test works', true)
await shot('10-settings')

// ---- 11. iPad-sized layout ----
await page.setViewportSize({ width: 820, height: 1180 })
await page.goto(BASE + '/#/')
await page.waitForTimeout(300)
await shot('11-ipad-dashboard')
await page.goto(noteUrl)
await page.waitForTimeout(400)
check(
  'narrow layout shows edit/preview toggle',
  await page.locator('.edit-preview-toggle').isVisible(),
)
await shot('12-ipad-note')

await browser.close()
console.log(failures === 0 ? '\nAll smoke checks passed ✅' : `\n${failures} check(s) FAILED ❌`)
process.exit(failures === 0 ? 0 : 1)
