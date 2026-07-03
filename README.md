# 📖 Study Helper

A study app for iPad and MacBook: **notes, flashcards, spaced repetition, and self-testing** — with optional AI help from Claude. It runs in Safari as an installable web app, works offline, and keeps all data on the device.

## What's inside

| Feature | Details |
|---|---|
| **Notes** | Markdown editor with live preview, proper maths rendering (`$x^2$` → KaTeX), highlights, pasted photos/screenshots, and an Apple Pencil sketch canvas |
| **Flashcards** | Decks per subject, spaced repetition (Anki-style SM-2) — the app tells her exactly which cards to review each day |
| **Self-testing** | Exam-style quizzes (multiple choice + short answer) with score history |
| **AI (Claude)** | One tap turns a note into flashcards or a quiz; explains wrong answers like a tutor; summarises notes into key points |
| **Dashboard** | Cards due today, study streak, exam countdowns |
| **Privacy** | Everything is stored on-device (IndexedDB). Nothing is uploaded anywhere, except the note text sent to the Claude API when she uses an AI button |

## Getting it onto her devices

The app needs to be hosted once; then each device just visits the URL.

**Option A — GitHub Pages (free, recommended):**
1. Make this repository **public** (Settings → General → Danger Zone → Change visibility) — Pages is free only for public repos. The code contains no personal data or keys, so this is safe.
2. Repo **Settings → Pages → Source: GitHub Actions**.
3. Merge/push to `main`. The included workflow builds and publishes to `https://<username>.github.io/studyhelper/`.

**Option B — Netlify:** drag the `dist/` folder (after `npm run build`) onto [app.netlify.com/drop](https://app.netlify.com/drop), or connect the repo. Works with a private repo.

**Install like a real app:**
- **iPad:** open the URL in Safari → Share → **Add to Home Screen**.
- **MacBook:** open in Safari → File → **Add to Dock** (or use any browser).

After the first visit it works offline.

## Turning on the AI features

1. Create an API key at [console.anthropic.com](https://console.anthropic.com/) — and set a **monthly spend limit** there (e.g. $5) for peace of mind.
2. In the app: **Settings → Claude → paste the key → Save → Test key**. Do this once per device.
3. The default model is Claude Opus 4.8 (best quality). Settings offers cheaper models — typical usage (generating a set of flashcards from a note) costs a few cents per run on Opus, less on Sonnet/Haiku.

The key is stored only in that device's browser storage and is sent only to Anthropic's API.

## Moving notes between iPad and MacBook

Data lives per-device by design (no accounts, no server). To sync manually:

1. **Settings → Export backup** — downloads a single `.json` file.
2. AirDrop it (or drop it in iCloud Drive).
3. On the other device: **Settings → Import backup** (this *replaces* that device's data).

A weekly export is also a good backup habit.

## Why it's built this way (the study science)

- **Spaced repetition** (the flashcard scheduler) and **retrieval practice** (quizzes) are the two most strongly evidenced revision techniques — far more effective than re-reading notes.
- The AI is deliberately positioned as an *assistant*: she writes the notes, the app helps her test herself on them.

## Development

```bash
npm install
npm run dev        # local dev server
npm run build      # production build → dist/
node scripts/smoke.mjs  # end-to-end browser test (needs `npx vite preview` running)
```

Stack: Vite + React + TypeScript, Dexie (IndexedDB), marked + KaTeX, `@anthropic-ai/sdk` (browser mode), vite-plugin-pwa.
