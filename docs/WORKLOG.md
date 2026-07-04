# Worklog — resumable plan log

This file is how a plan survives an interruption. Sessions here run in an **ephemeral
container** and can hit a context/usage limit mid-task; anything not committed to git is lost.
So when work is more than a couple of steps, the plan lives **here, in the repo**, updated as
you go. A fresh session — or a different AI entirely — can then open this file, see exactly
what's done and what's left, and continue without re-deriving the plan.

## How to use it (for the AI session)

1. **Before starting** a multi-step task, add a new entry under _Active_ with the goal and a
   checklist of steps. One line per step, `- [ ]` unchecked.
2. **As each step finishes**, tick it (`- [x]`) and, if useful, add a one-line note (a file
   touched, a decision made, a gotcha found). Commit this file alongside the code for that step —
   the worklog and the code stay in sync in the same commit.
3. **When the whole task is done**, move the entry to _Done_ (keep the last few for history;
   prune older ones — git remembers) and reflect the outcome in `ROADMAP.md` (Shipped) and, if the
   architecture changed, `ARCHITECTURE.md`.
4. **If you're interrupted**, you've lost nothing: the next session reads _Active_, finds the
   first unchecked box, and picks up there. Leave a `→ next:` note on the entry if the next step
   needs context that isn't obvious from the checklist.

Keep entries terse — this is a breadcrumb trail, not a design doc. Design rationale belongs in
`ARCHITECTURE.md`; feature intent belongs in `ROADMAP.md`.

> Note: the worklog is a **repo file**, so it is dev-process state, not user data — it is not part
> of the app's IndexedDB backup and never ships to the deployed app.

---

## Active

_(nothing in progress)_

---

## Done

### More color themes + resumable-plan process (2026-07-04)

Goal: pastel theme options + a custom background-colour picker; add a durable way to log plan
progress across interruptions; make "keep the docs current" an explicit rule.

- [x] Added `docs/WORKLOG.md` (this file) + documented the convention in `CLAUDE.md`
- [x] Added `doc-scout` agent (haiku) so reading/summarizing docs uses a cheap model + low effort
- [x] Added pastel themes (blossom, mint, lavender, sky) to `styles.css` + `theme.ts`
- [x] Added `custom` theme: `src/customTheme.ts` derives a full, contrast-checked palette from one
      picked background colour; Settings shows a native colour-wheel input
- [x] Applied custom colour early in `index.html` to avoid a flash of the wrong palette
- [x] Extended `scripts/smoke.mjs` (pastel theme + custom picker) and verified build/smoke
