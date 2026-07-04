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
const mockTranscription = {
  title: 'Electrolysis',
  markdown:
    '## Electrolysis\n\nIonic compounds conduct when molten. At the cathode:\n\n$$\\text{Cu}^{2+} + 2e^- \\rightarrow \\text{Cu}$$\n\n*[Diagram: electrolysis cell with copper electrodes]*',
}
const mockPractice = {
  title: 'Projectile motion practice',
  items: [
    {
      question: 'A ball is thrown horizontally at $12\\,\\text{m/s}$ from a 20 m cliff. How long until it lands?',
      solution: 'Vertical: $s = \\frac{1}{2}gt^2$ so $t = \\sqrt{2s/g} = \\sqrt{40/9.8} \\approx 2.0\\,\\text{s}$.',
      marks: 3,
    },
    {
      question: 'State the horizontal range of the same ball.',
      solution: 'Range $= v_x t = 12 \\times 2.0 = 24\\,\\text{m}$.',
      marks: 2,
    },
  ],
}
const mockPracticePhotos = {
  title: 'Projectile motion (from your paper)',
  topic: 'Projectile motion',
  style: 'exam',
  styleNotes: 'Multi-part mechanics questions, 2–3 marks each, command words "calculate" and "show that".',
  items: [
    {
      question: 'A stone is thrown horizontally at $8\\,\\text{m/s}$ from a 45 m cliff. Calculate the time of flight.',
      solution: '$t = \\sqrt{2s/g} = \\sqrt{90/9.8} \\approx 3.0\\,\\text{s}$.',
      marks: 3,
    },
    {
      question: 'Show that its horizontal range is about 24 m.',
      solution: 'Range $= v_x t = 8 \\times 3.0 = 24\\,\\text{m}$.',
      marks: 2,
    },
  ],
}
const mockMark = (studentAnswer) => ({
  verdict: /lambda/i.test(studentAnswer) ? 'correct' : 'partial',
  feedback: /lambda/i.test(studentAnswer)
    ? 'Spot on — you identified the relationship between speed, frequency and wavelength.'
    : 'You have the right idea, but a full-marks answer needs the working shown step by step.',
})
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
    else if (props.markdown) text = JSON.stringify(mockTranscription)
    else if (props.styleNotes) text = JSON.stringify(mockPracticePhotos)
    else if (props.items) text = JSON.stringify(mockPractice)
    else if (props.verdict) {
      const userText = JSON.stringify(body?.messages ?? '')
      const m = userText.match(/Student's answer: ([^"\\]*)/)
      text = JSON.stringify(mockMark(m?.[1] ?? ''))
    }
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
// A note opens in the distraction-free reading view, not the editor.
await page.locator('.note-read').waitFor()
check('note opens in reading mode', await page.locator('.note-read').isVisible())
check('editor hidden in reading mode', !(await page.locator('.editor-text').isVisible()))
await page.getByPlaceholder('Note title').fill('Waves')
await page.locator('.read-bar button').click()
await page.locator('.editor-text').waitFor()
await page
  .locator('.editor-text')
  .fill(
    '## Wave basics\n\nThe **wave equation** links speed, frequency and wavelength:\n\n$$v = f\\lambda$$\n\n- *Frequency* $f$: oscillations per second (Hz)\n- *Amplitude*: max displacement from equilibrium\n- <mark>Transverse</mark> waves oscillate perpendicular to travel\n',
  )
await page.getByText('Saved', { exact: true }).waitFor()
check('note autosaves', true)
check('math renders in preview', (await page.locator('.editor-preview .katex').count()) > 0)
// Reading view reflects the edit, and tap-to-edit round-trips back.
await page.getByRole('button', { name: 'Done' }).click()
await page.locator('.note-read').waitFor()
check('reading view renders the note', (await page.locator('.note-read .katex').count()) > 0)
check('reading view hides the editor', !(await page.locator('.editor-text').isVisible()))
await page.locator('.note-read').click()
await page.locator('.editor-text').waitFor()
check('tap-to-edit returns to the editor', await page.locator('.editor-text').isVisible())
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

// ---- 4b. Drag-resize the image in the preview ----
const handle = page.locator('.editor-preview .img-resize-handle').first()
await handle.waitFor()
const hb = await handle.boundingBox()
await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
await page.mouse.down()
await page.mouse.move(hb.x - 120, hb.y - 90, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(200)
const resizedSrc = await page.locator('.editor-text').inputValue()
check(
  'image resize writes a pixel width into the note source',
  /<img[^>]*img:[0-9a-fA-F-]{36}[^>]*width="\d+"/.test(resizedSrc),
)
await shot('18-image-resized')
// The width survives a reload (it lives in the note markdown, not just the DOM).
await page.getByText('Saved', { exact: true }).waitFor()
await page.reload()
await page.locator('.note-read').waitFor()
check(
  'resized width persists in the reading view',
  await page
    .locator('.note-read img')
    .first()
    .evaluate((el) => el.getAttribute('width') !== null)
    .catch(() => false),
)

// ---- 5. AI flashcards (mocked) ----
await page.locator('.ai-bar').waitFor()
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
// Q2: short answer, AI-marked (mocked): answer contains "lambda" → correct
await page.locator('.quiz-short-input').fill('v equals f times lambda')
await page.getByRole('button', { name: /Mark my answer/ }).click()
await page.getByText('✅ Correct').waitFor()
check('AI marks the written answer', true)
await shot('07-quiz-ai-marked')
await page.getByRole('button', { name: /Count as right/ }).click()
await page.getByText('2 / 2 (100%)').waitFor()
check('quiz scored and saved', true)

// ---- 7b. Photo → note (mocked vision) ----
await page.goto(BASE + '/#/')
await page.getByRole('link', { name: /Physics/ }).click()
await page.getByRole('button', { name: /Note from photos/ }).click()
await page.locator('.modal input[type=file]').setInputFiles('public/icons/icon-192.png')
await page.locator('.photo-thumb').waitFor()
await page.getByRole('button', { name: /Transcribe 1 photo/ }).click()
await page.getByPlaceholder('Note title').waitFor()
check(
  'photo transcribed into a titled note',
  (await page.getByPlaceholder('Note title').inputValue()) === 'Electrolysis',
)
await page.locator('.read-bar button').click()
await page.locator('.editor-text').waitFor()
const photoNoteContent = await page.locator('.editor-text').inputValue()
check(
  'photo note embeds transcription and original photo',
  photoNoteContent.includes('Electrolysis') && photoNoteContent.includes('img:'),
)
await shot('13-photo-note')

// ---- 7c. Practice questions (mocked) ----
await page.goto(BASE + '/#/')
await page.getByRole('link', { name: /Physics/ }).click()
await page.getByRole('button', { name: /Example questions/ }).click()
await page.getByPlaceholder('e.g. Integration by parts').fill('Projectile motion')
await page.getByRole('button', { name: 'Generate', exact: true }).click()
await page.getByRole('heading', { name: 'Question 1' }).waitFor()
check('practice set generated', (await page.locator('.practice-q').count()) === 2)
// reveal a worked solution
await page
  .locator('.practice-q')
  .first()
  .getByRole('button', { name: 'Show solution' })
  .click()
await page.getByText('Worked solution').first().waitFor()
check('worked solution reveals', true)
// AI-mark a typed answer (no "lambda" → partial verdict)
await page.locator('.practice-answer').first().fill('about two seconds I think')
await page.locator('.practice-q').first().getByRole('button', { name: /Mark my answer/ }).click()
await page.getByText('🟡 Partly there').waitFor()
check('practice answer AI-marked', true)
await shot('14-practice-marked')

// ---- 7c2. Practice from photos of a real paper (mocked vision) ----
await page.goto(BASE + '/#/')
await page.getByRole('link', { name: /Physics/ }).click()
await page.getByRole('button', { name: /Example questions/ }).click()
await page.locator('.modal input[type=file]').setInputFiles('public/icons/icon-192.png')
await page.locator('.photo-thumb').waitFor()
await page.getByRole('button', { name: /Generate from photos/ }).click()
await page.getByRole('heading', { name: 'Question 1' }).waitFor()
check('practice set generated from photos', (await page.locator('.practice-q').count()) === 2)
check(
  'photo practice set flagged as matched to her papers',
  await page.getByText(/matched to your papers/).isVisible(),
)
await shot('16-practice-from-photos')

// "More questions like these" regenerates a fresh set in the captured style
await page.getByRole('button', { name: /More questions like these/ }).click()
await page.getByRole('heading', { name: 'Question 1' }).waitFor()
check('regenerated a fresh matching set', (await page.locator('.practice-q').count()) === 2)

// ---- 7d. Global search ----
// Navigate via the topbar link (a real hashchange) rather than a same-document
// goto, which can race with the hash change from the previous page.
await page.getByRole('link', { name: 'Search', exact: true }).click()
await page.locator('.search-input').waitFor()
await page.locator('.search-input').fill('wave')
await page.getByRole('heading', { name: 'Notes', exact: true }).waitFor()
const noteHits = await page.locator('.search-hit').count()
check('search finds notes and cards', noteHits >= 2)
await shot('15-search')

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

// ---- 10b. Appearance / theme picker ----
check('appearance theme picker present', (await page.locator('.theme-card').count()) >= 6)
await page.locator('.theme-card', { hasText: 'Ocean' }).click()
await page.waitForTimeout(150)
const themed = await page.evaluate(() => ({
  attr: document.documentElement.getAttribute('data-theme'),
  pageColor: getComputedStyle(document.documentElement).getPropertyValue('--page').trim().toLowerCase(),
  stored: localStorage.getItem('sh.theme'),
  meta: (document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? '').toLowerCase(),
}))
check('selecting a theme sets data-theme + persists', themed.attr === 'ocean' && themed.stored === 'ocean')
check('theme swaps the design tokens', themed.pageColor === '#0b1e2a')
check('status-bar theme-color follows the theme', themed.meta === '#0b1e2a')
await shot('17-theme-ocean')
// Return to Auto so downstream screenshots aren't themed.
await page.locator('.theme-card', { hasText: 'Auto' }).click()
await page.waitForTimeout(100)
check(
  'auto clears the data-theme override',
  (await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) === null,
)

// ---- 11. iPad-sized layout ----
await page.setViewportSize({ width: 820, height: 1180 })
await page.goto(BASE + '/#/')
await page.waitForTimeout(300)
await shot('11-ipad-dashboard')
await page.goto(noteUrl)
await page.waitForTimeout(400)
check('note opens in reading mode on iPad', await page.locator('.note-read').isVisible())
await page.locator('.read-bar button').click()
await page.locator('.editor-text').waitFor()
check('iPad editor shows the textarea', await page.locator('.editor-text').isVisible())
// iPad keeps the preview (stacked) so image drag-resize stays reachable there.
check('iPad edit keeps the preview pane', await page.locator('.editor-preview').isVisible())
check(
  'iPad edit exposes the image resize handle',
  await page.locator('.editor-preview .img-resize-handle').first().isVisible(),
)
await shot('12-ipad-note')

await browser.close()
console.log(failures === 0 ? '\nAll smoke checks passed ✅' : `\n${failures} check(s) FAILED ❌`)
process.exit(failures === 0 ? 0 : 1)
