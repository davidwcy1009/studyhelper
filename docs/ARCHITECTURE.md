# Architecture

Reference for anyone (human or AI session) modifying Study Helper. Skim the section you need.

## Stack

Vite 8 + React 19 + TypeScript (strict) · Dexie 4 (IndexedDB) · marked + marked-katex-extension +
KaTeX + DOMPurify · `@anthropic-ai/sdk` (browser mode) · vite-plugin-pwa (generateSW) ·
Playwright (icons + e2e smoke test). No backend of any kind.

## Data model (`src/types.ts`, `src/db.ts`)

```
Subject 1─* Note        (markdown; images as img:<uuid> links)
Subject 1─* Deck 1─* Card   (SM-2 scheduling fields on each card)
Subject 1─* Quiz 1─* QuizAttempt
Subject 1─* PracticeSet     (items: question/solution/marks; optional noteId provenance;
                             optional topic + styleNotes when generated from photos of real papers)
ImageAsset                  (blobs for note photos & sketches, keyed by uuid)
ReviewLog                   (one row per card grade — feeds streak + future analytics)
```

Dexie versions: v1 = original tables, v2 = adds `practices`. **Schema changes = new
`db.version(n)`, never edit old ones.** Cascade helpers in `db.ts` (`deleteSubjectCascade` etc.)
keep orphans out — use them, don't hand-delete.

## Spaced repetition (`src/srs.ts`)

SM-2 variant (Anki-like). States `new → learning → review`. Learning steps 1m, 10m; graduate at
1d (Good) / 4d (Easy). Review multipliers: Hard ×1.2 (ease −0.15), Good ×ease, Easy ×ease×1.3
(ease +0.15); lapse: ease −0.2 (floor 1.3), back to learning, interval ×0.3. `isDue` = due before
end of local today. `previewIntervals` powers the grade-button labels. Study queue: due learning,
due review, then ≤20 new; cards due again within 20 min re-enter the session queue.

## AI integration (`src/ai.ts`)

- Client: `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`; key + model in
  localStorage (`sh.apiKey`, `sh.model`). Default model `claude-opus-4-8`; Settings offers
  sonnet-5 / haiku-4-5.
- Every parsed response uses **structured outputs**: `output_config: { format: { type:
  'json_schema', schema } }` with `additionalProperties: false` + `required`. Free-text responses
  (explanations) skip the schema.
- `firstText()` guards `stop_reason` (`refusal`, `max_tokens`) before parsing.
- Functions: `generateFlashcards`, `generateQuiz` (mcq/short via `anyOf`), `keyPoints`,
  `explainMistake`, `transcribePhotos` (vision → `{title, markdown}`), `markAnswer`
  (→ `{verdict: correct|partial|incorrect, feedback}`), `generatePractice`
  (→ `{title, items:[{question, solution, marks}]}`; optional `styleNotes` to match real papers),
  `generatePracticeFromPhotos` (vision → `{title, topic, style, styleNotes, items}` — reads photos
  of her real homework/past papers and writes new questions in the same style), `testApiKey`.
- Photos for vision go through `src/images.ts`: re-encode to JPEG if type unsupported (HEIC) or
  >3MB, downscale to ≤2000px — controls token cost and satisfies API media types.

## Markdown pipeline (`src/markdown.tsx`)

`marked` (gfm, breaks) + `marked-katex-extension` ($…$ / $$…$$) → `DOMPurify.sanitize` with
html/svg/mathMl profiles and a custom `ALLOWED_URI_REGEXP` that additionally permits the `img:`
scheme. The `<Markdown>` component then swaps `img:<uuid>` srcs for object URLs from Dexie and
revokes them on unmount. `<mark>` is used for highlights (toolbar inserts raw HTML).

## Routing & shell (`src/App.tsx`)

Hash routing only: `#/`, `#/subject/:id`, `#/note/:id`, `#/deck/:id`, `#/study/:id[?mode=practice]`,
`#/quiz/:id`, `#/practice/:id`, `#/search`, `#/settings`. `go(path)` navigates. Study view hides
the topbar (immersive). ⌘K/Ctrl-K → search.

## Backup (`src/backup.ts`)

Single JSON blob: all tables + images as base64. Import **replaces** everything (by design —
simple mental model for moving iPad ↔ MacBook via AirDrop). Compatibility rule: new tables/fields
must be optional on import (`data.practices ?? []`) so old backup files keep working.

## Theming (`src/theme.ts`, `src/customTheme.ts`, `src/styles.css`)

Design tokens are CSS vars at the top of `styles.css`. Each named theme is a `:root[data-theme=…]`
token block; "auto" clears `data-theme` and lets `prefers-color-scheme` pick light/dark. `theme.ts`
owns the choice (localStorage `sh.theme`), applies it (`applyTheme`), and syncs the `theme-color`
meta. Named themes: light/dark + midnight/sunset/forest/grape/ocean + pastels blossom/mint/lavender/sky.

The **custom** theme has no CSS block. `customTheme.ts` (pure maths, no DOM) derives a whole palette
from one picked background colour: it reads the colour's luminance to pick a light or dark scheme,
then computes surfaces, ink, borders, accent and the 8 subject colours, nudging lightness until
each meets a WCAG contrast target so text stays readable on any pick. `theme.ts` writes the result
as inline CSS vars on `<html>` and clears them (`CUSTOM_VARS`) when switching away. The picked colour
(`sh.themeColor`) and the derived palette JSON (`sh.customPalette`) are cached so the inline script
in `index.html` can paint custom colours before first paint. All theme state is device-local — not
in the backup.

## PWA

vite-plugin-pwa `generateSW`, `registerType: 'autoUpdate'`, precache ~1.2MB (bundle + KaTeX
fonts + icons). `base: './'` so the same build works at any path (GH Pages subpath, Netlify).
Icons generated by `scripts/gen-icons.mjs` (Playwright renders inline SVG → PNGs in
`public/icons/`).

## Testing (`scripts/smoke.mjs`)

Playwright drives the **built** app end-to-end: subject → note (markdown/math/sketch) → AI
flashcards → SM-2 study session → AI quiz with AI marking → photo→note → practice set generation
+ marking → search → backup export → dark mode + iPad viewport. The Claude API is fully mocked
with `page.route('https://api.anthropic.com/**')`:
- OPTIONS preflight must return CORS headers (204) or the SDK's requests fail.
- POST responses are dispatched by the **request schema's distinguishing property**
  (`cards` / `questions` / `markdown` / `items` / `verdict`) — when adding an AI feature, add its
  schema key here and a mock payload.
- `localStorage sh.apiKey` is pre-seeded via `addInitScript` so AI buttons are enabled.

Exit non-zero on any failed check. Run against `vite preview`, not the dev server.

## Deployment

`.github/workflows/deploy.yml`: push to `main` (or manual dispatch) → build → upload-pages-artifact
→ deploy-pages → https://davidwcy1009.github.io/studyhelper/. Repo must stay public for free Pages.

**Incident log (2026-07-03, first deploy):**
1. Runs failed in ~2s, no runner, no logs → the auto-created `github-pages` **environment** had a
   deployment-branch rule that didn't allow `main` (Pages was enabled while the repo had no
   branches). Fix: Settings → Environments → github-pages → allow `main`.
2. Next run built fine but `deploy-pages` failed with "Deployment failed, try again later" — a
   known GitHub-side flake on a site's first deployment. Fix: dispatch a **fresh** run
   (`workflow_dispatch`); don't re-run the stale attempt.
Both are documented so future sessions don't re-diagnose them.

## Owner decisions (don't relitigate without asking)

- No backend / accounts / auto-sync — export/import is the sync story.
- AI key entered per-device in Settings; never in the repo; owner sets a spend limit.
- Default model Opus 4.8 (owner-selectable downgrade in Settings).
- She reviews AI-generated cards before they're added — keep humans in the loop on content.
