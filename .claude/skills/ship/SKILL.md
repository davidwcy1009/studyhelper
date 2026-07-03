---
name: ship
description: Build, verify, commit, push, and confirm deployment of Study Helper. Use for every release of this repo instead of improvising the sequence — it encodes the repo's conventions and the known GitHub Pages quirks.
---

# Ship Study Helper

Run this sequence in order. Do not skip verification; do not push unverified code.

## 1. Verify

- `npx tsc --noEmit` and `npm run build` must be clean.
- Run the smoke test against the built app (or spawn the `smoke-verifier` agent):
  `npx vite preview --port 4173 --strictPort &` then
  `node scripts/smoke.mjs http://localhost:4173 <shots-dir>`. All checks must pass.
- If the change added an AI feature: confirm `scripts/smoke.mjs` mocks its schema
  (dispatch is by schema property — see the route handler) and has a check for the flow.
- If the change touched UI: spawn `ui-reviewer` for light/dark/iPad screenshots.

## 2. Commit

- Branch: work happens on `claude/study-tool-daughter-b5wygv` (owner's designated branch).
- Message: imperative summary + bullet list of user-visible changes + note on test coverage.

## 3. Push & deploy

- `git push -u origin claude/study-tool-daughter-b5wygv`
- The live site deploys from `main`. The owner's established flow is fast-forwarding main to the
  working branch: `git push origin claude/study-tool-daughter-b5wygv:main`
  (ask first if the session has no prior signal that main should move).
- Push to `main` triggers `.github/workflows/deploy.yml` → GitHub Pages at
  https://davidwcy1009.github.io/studyhelper/

## 4. Confirm the deploy (don't assume)

- Check the run via GitHub MCP: `actions_list` (method `list_workflow_runs`) →
  `actions_get` (method `get_workflow_run`) until `status: completed`.
- `conclusion: success` → done; report the live URL.
- Known failure modes (see docs/ARCHITECTURE.md incident log):
  - Fails in ~2s, no runner, no logs → `github-pages` **environment** deployment-branch rule
    doesn't allow `main`. Owner fixes in Settings → Environments; you cannot fix it via API here.
  - Build succeeds but deploy-pages says "Deployment failed, try again later" → GitHub-side
    flake; trigger a **fresh** run with `actions_run_trigger` (method `run_workflow`,
    workflow_id `deploy.yml`, ref `main`) instead of re-running the failed attempt. One retry
    is usually enough; if it persists, report to the owner rather than looping.
- Note: this sandbox cannot fetch `github.io` URLs (network policy) — rely on the run
  conclusion, and ask the owner to eyeball the site for visual confirmation.
