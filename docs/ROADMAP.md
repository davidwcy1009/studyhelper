# Roadmap & feature log

## Shipped

- v1 (2026-07-03): subjects, markdown+KaTeX notes (paste images, Apple Pencil sketchpad),
  SM-2 flashcards + study/practice modes, AI flashcards/quiz/key-points from notes, tutor
  explanations, dashboard (due/streak/exam countdown), settings (API key, model, backup), PWA,
  GitHub Pages deploy.
- v1.1 (2026-07-03): photo → notes (Claude vision), AI marking of written answers
  (quiz + practice), practice question sets with worked solutions (from topic or note),
  global search (⌘K).
- v1.2 (2026-07-03): practice from photos of real homework/exam papers — `PracticeGenModal`
  takes photos (shared `PhotoPicker`, extracted from `PhotoNoteModal`); `generatePracticeFromPhotos`
  returns `{topic, style, styleNotes, items}`; `styleNotes` + `topic` stored on the `PracticeSet`
  so "⚡ More questions like these" regenerates in the same style (`generatePractice` gained an
  optional `styleNotes` param). Sets from photos show a "📷 matched to your papers" chip.

## Next up — owner-prioritized

_(nothing queued — pull the next item from the evaluated candidates below)_

## Evaluated candidates (from owner discussion, in rough value order)

- **Weak-topic insights** — ReviewLog + attempts already collect the data; add a stats view
  (worst-retention decks, most-lapsed cards, accuracy trend). No new infra.
- **Cloze cards** — highlight a phrase in a note → fill-in-the-blank card. Most-used Anki card
  type; needs a card `type` field (Dexie v3) and study-view rendering.
- **Deck sharing / CSV import** — per-deck export file + Quizlet/Anki CSV import. Social/practical
  win; watch backup-format compatibility.
- **Timed past-paper mode** — quiz variant: countdown, no per-question feedback until the end.
- **Revision planner** — plan backwards from `Subject.examDate`. Only build if she'd actually
  follow it; the due-queue already does a light version.
- **Pomodoro timer** — cheap, pairs with streak; low priority.
- Exam-board awareness (settings field passed to prompts) — **superseded** by photo-based
  generation above, which grounds style in her actual papers. Revisit only if photos prove noisy.

## Rejected / deferred (with reasons)

- Real cloud sync/accounts — owner chose local-first + export/import; revisit only on request.
- Push-notification reminders — needs a server; conflicts with no-backend decision.
- On-device OCR (Tesseract.js) instead of Claude vision — poor on handwriting/math, no structure
  or LaTeX; iOS Live Text isn't exposed to web apps (manual copy-paste from Photos works today).

## Process note

When adding a feature: read `CLAUDE.md` conventions → implement → extend `scripts/smoke.mjs`
(mock any new AI schema) → `smoke-verifier` agent → `ui-reviewer` agent if UI changed → `/ship`.
Keep proposing new agents/skills when a workflow repeats (owner standing instruction).
