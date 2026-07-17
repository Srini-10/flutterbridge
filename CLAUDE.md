# CLAUDE.md

Context for Claude Code working in this repo. Travels with the clone, so it applies on any machine.

## What this is

FlutterBridge — a Flutter Application Compiler Platform.

```
Flutter project → Universal Semantic Compiler → UIR → N generators (React/Next.js first)
```

Read [README.md](README.md) for the package layout. **Caveat: the README's milestone status table is
stale** — it says M1/M2 "not started", but `docs/spec/` carries amendments through v2.5, ADRs run to
0022, and `packages/generators/react` + `packages/runtimes/react` hold real implementations. Trust
`docs/` and the code over that table.

## Commands

Use `just` (it bridges the pnpm/turbo and Dart/flutter domains). `just --list` for all recipes.

```bash
just install        # pnpm install --frozen-lockfile
just build          # turbo: codegen -> build
just test           # all TS package tests
just typecheck
just lint           # architecture rules (Spec §1.2) + stub-tag discipline
just lint-negative  # prove the architecture rules reject a forbidden import
just codegen-check  # fail if a generated model drifted from its schema
just dart-analyze   # flutter analyze on fixtures/apps/hello_bridge
just ci             # the full local gate — mirrors .github/workflows/ci.yml
```

`just corpus` (M4) and `just e2e` (M2) are deliberate stubs and exit 1.

## Hard rules

1. **The architecture is frozen at Specification v2.0** (+ amendments in `docs/spec/`). This repo
   implements it; it does not redesign it. New abstractions, package splits, or interface changes
   require an ADR documenting a *proven contradiction* in the spec — not a preference.
2. **Deferred work is a tagged stub**: `// BRIDGE-STUB(M<n>): <what the real impl adds>`. `just lint`
   rejects untagged stubs.
3. **Generated source is committed on purpose — never ignore it.** `packages/uir/src/generated/`,
   `dart/bridge_uir/lib/generated/`, `packages/adapters/widgets-material/src/generated/`, and
   `dart/bridge_analyzer/lib/src/session/adapters/widget/generated/` are build *inputs* for every
   consumer. `just codegen-check` fails CI if they drift. `.gitignore` documents this in a `NOTE:`.
4. Found a problem? File it as an implementation issue. Do not redesign the interface.

## Git conventions in this repo

- **Never force-push over published history, and never squash existing commits** to satisfy a literal
  instruction. If a request assumes a fresh repo but history already exists, stop and surface the
  conflict with options. Preserving history has been the explicit choice here.
- **`compiler-v1` is a tag, not a branch.** Checking it out detaches HEAD. This has already stranded
  work once: commit `9ecf84e` was authored detached, belonged to no branch, and was invisible to
  `main` until rescued. If HEAD is detached, check `git reflog` before switching branches — a plain
  `git checkout main` would drop such a commit to garbage collection.
  - To move a branch pointer with a dirty working tree, `git checkout -B main` moves it without
    touching file content (a plain checkout refuses). Hash `git status --porcelain` before and after
    to prove nothing was lost.
- **`92792ef` "feat: initial FlutterBridge project" is the third commit, not the first.** The real
  initial commit is `4559284` (2026-07-12). The message is a misnomer from a setup instruction that
  assumed a fresh repo. Don't infer the project start date from it.

## Open questions

- **`.vscode/` in `.gitignore`**: all of `.vscode/` is ignored except `extensions.json`, so
  `launch.json` and `tasks.json` are excluded too. Srinivasan asked to ignore `settings.json` but
  "keep launch/tasks if useful" — the current file doesn't do that. Flagged and left unchanged; the
  decision is still pending. Don't add the exceptions unasked — that `.gitignore` is hand-authored
  and its policies are deliberate.
