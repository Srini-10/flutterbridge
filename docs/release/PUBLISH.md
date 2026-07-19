# Publishing v0.1.0 — runbook

**Everything in this document requires GitHub credentials that this machine does not have.** Each command
was chosen against the verified local state; none has been executed.

## Why this is a runbook and not a completed step

| Needed | Available here |
| --- | --- |
| `gh` CLI (create repo, PR, merge, Release, watch CI) | ❌ `command not found: gh` |
| HTTPS credential for github.com | ❌ `could not read Username … terminal prompts disabled` |
| SSH host key for github.com | ❌ `Host key verification failed` |

`osxkeychain` is configured as the credential helper but holds nothing for github.com, and there is no
`GH_TOKEN`/`GITHUB_TOKEN`. Even with SSH working, five of the seven required steps — create repository,
open PR, merge PR, create Release, monitor Actions — are GitHub **API** operations that `git` cannot
perform.

Nothing was pushed, tagged, or published. The release is prepared and sitting on `release/v0.1.0`.

## Prerequisites

```bash
brew install gh          # or https://cli.github.com
gh auth login            # HTTPS, with the `repo` and `workflow` scopes
gh auth status           # confirm the account is srini-10
```

## Verified local state

```text
branch  release/v0.1.0   15 commits ahead of main, working tree clean
main    db89430          untouched
tags    compiler-v1          4559284
        v0.3.0-dev-preview   db89430   ← same commit as main
```

`v0.3.0-dev-preview` satisfies the "points to the same history" condition, and its version number is
*higher* than the release being published, which will confuse any tooling that sorts tags.

## 1. Create the repository

The `origin` remote already points at `https://github.com/Srini-10/flutterbridge.git`. If the repository
does not exist yet:

```bash
gh repo create srini-10/flutterbridge \
  --public \
  --description "FlutterBridge — Compile existing Flutter applications into production-ready React applications through an intermediate UIR." \
  --source . --remote origin
```

`--source . --remote origin` reuses the existing remote rather than adding a second one. Drop
`--source/--remote` if the repository already exists.

```bash
gh repo edit srini-10/flutterbridge \
  --add-topic flutter --add-topic react --add-topic compiler --add-topic typescript \
  --add-topic dart --add-topic ui --add-topic cross-platform --add-topic codegen
```

## 2. Retire the stale tag

Do this **before** publishing, so no window exists where both tags are visible and the wrong one sorts
highest.

```bash
git tag -d v0.3.0-dev-preview
git push origin :refs/tags/v0.3.0-dev-preview   # no-op if it was never pushed
```

## 3. Push the release branch

```bash
git push -u origin release/v0.1.0
git push -u origin main          # only if main is not yet on the remote
```

## 4. Open the pull request

```bash
gh pr create --base main --head release/v0.1.0 \
  --title "Release v0.1.0" \
  --body-file docs/release/PR-BODY.md
```

## 5. Merge

```bash
gh pr merge --merge          # a merge commit, NOT --squash
```

**Not `--squash`.** CLAUDE.md: *"never squash existing commits to satisfy a literal instruction"*. The
15 commits are a reviewable subsystem-by-subsystem history and squashing discards it.

## 6. Tag and push

```bash
git checkout main && git pull
git tag -a v0.1.0 -F docs/release/v0.1.0-github.md
git push origin main --follow-tags
```

Annotated, carrying the prepared notes. Pushing the tag triggers `release-qualification`.

## 7. GitHub Release

```bash
gh release create v0.1.0 \
  --title "FlutterBridge v0.1.0" \
  --notes-file docs/release/v0.1.0-github.md \
  release/*.tgz
```

Run `just package` first if `release/` is empty — it is git-ignored, so it will be on a fresh clone.

## 8. Watch CI, and expect the matrix to be the interesting part

```bash
gh run watch
gh run list --workflow=release-qualification
```

`ci.yml` has run on Linux for the project's life and should pass. **`release.yml` has never executed on any
runner** — it was authored and syntax-validated, and every platform-independent step was run locally. The
first execution is the point of it, and the jobs most likely to surface something are:

| Job | What a failure would mean |
| --- | --- |
| `pipeline` (windows-latest) | a process-spawning or path assumption the M5-E fixes missed |
| `reproducible` | a host detail still reaching UIR — this is the job that would catch it |
| `install` (windows) | npm global prefix or `bridge.cmd` shim |

If Windows is green, update the platform table in `docs/guide/installation.md`: two ⚙️ become ✅. **Do not
update it before the run** — that table's accuracy is the thing two milestones were spent earning.

## 9. Verification

```bash
gh release view v0.1.0 --web         # README renders, links resolve
npm view @bridge/cli                 # only after `npm publish`, which is a separate decision
```

npm publishing is deliberately **not** in this runbook: it needs an npm account, an org for the `@bridge`
scope, and a decision about whether to claim that scope. `just package` produces the tarballs; publishing
them is a human choice.
