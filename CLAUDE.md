# Study Helper — session guide

Offline-first PWA (iPad + MacBook Safari) for an A-level/IB student: markdown notes with KaTeX,
Anki-style spaced-repetition flashcards, quizzes, AI features via the Claude API (key entered in
the app's Settings, never in code). All data on-device in IndexedDB. No backend, no accounts —
these are deliberate decisions by the owner; don't add a server without being asked.

Read this file first; go deeper only when needed:

| Doc | Read when |
|---|---|
| `docs/ARCHITECTURE.md` | Touching data model, SRS, AI calls, markdown/image pipeline, backup, deploy |
| `docs/ROADMAP.md` | Planning features — shipped list + evaluated candidates with owner's priorities |
| `.claude/agents/` | Delegating verification/UI review (see Agents below) |
| `.claude/skills/ship/` | Committing/pushing/deploying — use the `ship` skill |

## Commands

```bash
npm run dev                      # dev server
npx tsc --noEmit                 # typecheck (strict; unused locals are errors)
npm run build                    # typecheck + production build to dist/
npm run icons                    # regenerate app icons (Playwright)
npx vite preview --port 4173 &   # then:
node scripts/smoke.mjs http://localhost:4173 <shots-dir>   # e2e test, 23+ checks
```

Playwright in this environment: if launch fails wanting a browser download, the pre-installed
Chromium is at `/opt/pw-browsers/chromium` (scripts already fall back to it via `CHROMIUM_PATH`).

## Repo map

```
src/
  App.tsx          hash router (#/subject/:id …), topbar, SubjectChip, go()
  db.ts            Dexie schema + cascade deletes  ← bump version() for schema changes
  types.ts         all entity types
  srs.ts           SM-2 scheduling, streak, due logic
  ai.ts            ALL Claude API calls live here (structured JSON output)
  images.ts        photo normalization (HEIC→JPEG, downscale ≤2000px) for vision + storage
  markdown.tsx     marked + KaTeX + DOMPurify; resolves img:<uuid> blob images
  backup.ts        export/import all data as one JSON file
  views/           one file per route
  components/      Modal, Sketchpad, PhotoNoteModal, PracticeGenModal
scripts/smoke.mjs  Playwright e2e with fully mocked Claude API — the safety net
.github/workflows/deploy.yml  push to main → GitHub Pages
```

## Non-negotiable conventions

- **Every feature gets smoke-test coverage** in `scripts/smoke.mjs` before commit. Mock new AI
  calls by their schema's distinguishing property (see the route handler there).
- **AI calls**: only in `src/ai.ts`; use `output_config.format` JSON schemas for anything parsed;
  default model `claude-opus-4-8`, selectable in Settings; check `stop_reason` via `firstText()`.
- **Dexie**: never edit an existing `db.version(n)` — add a new version. Update `backup.ts`
  export AND import; new fields must be optional on import (old backups must keep working).
- **Vite `base: './'`** and hash routing — don't switch to path routing (breaks static hosting).
- **Design tokens** live at the top of `src/styles.css` (light + dark). New UI uses the CSS vars;
  8 subject colors are `--cat-0..7`; touch targets ≥ 44px; always check dark mode.
- Images in notes are `img:<uuid>` links to IndexedDB blobs — delete blobs when content dies
  (see `deleteImagesIn`).

## Agents & skills (delegate, don't grind)

Defined in `.claude/agents/` — spawn them instead of doing the work inline:

| Agent | Use for | Model/effort |
|---|---|---|
| `smoke-verifier` | After code changes: build + run full smoke test, report failures | sonnet, low effort |
| `ui-reviewer` | After UI changes: screenshot light/dark/iPad, critique vs tokens | sonnet, medium effort |

Skill `/ship`: the full build → verify → commit → push → confirm-deploy sequence, including the
known GitHub Pages quirks. Use it for every release instead of improvising.

**Standing instruction from the owner:** as development continues, watch for repeated workflows
or specialist tasks and propose/add new agents (`.claude/agents/*.md`) or skills
(`.claude/skills/*/SKILL.md`) for them. Match the model to the job: haiku for trivial/mechanical,
sonnet for verification and review, opus/fable only for design- or correctness-critical work.

## Deploy (summary — details & incident log in ARCHITECTURE.md)

Push to `main` → Actions workflow → GitHub Pages at https://davidwcy1009.github.io/studyhelper/.
Known quirks: the `github-pages` environment has a deployment-branch rule (must allow `main`);
a first/occasional "Deployment failed, try again later" is a GitHub-side flake — dispatch a
fresh run rather than re-running the failed attempt.
