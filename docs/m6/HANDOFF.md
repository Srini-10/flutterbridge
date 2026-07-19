# M6 — session handoff

**Read this first.** It says what is done, what is blocked and why, and where to start.

## 1. The release is prepared and NOT published

`release/v0.1.0` — 17 commits, working tree clean, `main` untouched, **nothing pushed**.

**The GitHub work could not be done from this machine**, and this is a hard blocker rather than a
judgement call:

| Needed | State |
| --- | --- |
| `gh` CLI — create repo, PR, merge, Release, watch CI | ❌ `command not found` |
| HTTPS credential for github.com | ❌ `could not read Username … terminal prompts disabled` |
| SSH host key for github.com | ❌ `Host key verification failed` |

`osxkeychain` is the configured helper but holds nothing for github.com, and no `GH_TOKEN`/`GITHUB_TOKEN`
is set. Even with SSH working, five of the seven requested steps are GitHub **API** operations that `git`
cannot perform.

**→ [`docs/release/PUBLISH.md`](../release/PUBLISH.md)** has every command, checked against the verified
local state. It takes about ten minutes once `gh auth login` succeeds.

Two decisions are recorded there rather than left to the moment:

- **Merge, do not squash.** CLAUDE.md forbids squashing existing commits; the 17 are the reviewable
  history.
- **Do not update the platform table until the matrix has actually run.** That table's accuracy is what
  two milestones were spent earning.

## 2. A correction worth carrying forward

In the previous session I reported the v0.1.0 release documents as committed. **They were not.** The
`.gitignore` rule `release/` is unanchored, so it matched `docs/release/` as well, and `git status` does
not list ignored files — a clean status read as proof the commit had landed.

Fixed (`/release/`, anchored) and the documents are now tracked. The lesson generalises: *a clean
`git status` is not evidence that a file was committed.* `git ls-files <path>` is.

## 3. M6 work completed

Branch **`feature/m6-foundation`**, one commit.

### M6-1 — `notifyListeners` erased (priority 1: store lowering)

ADR-4/ADR-20: *a signal write **is** the notification*. `notifyListeners()` announces what the UIR has
already recorded in the action's write set, so INV-22 says it must not survive extraction. It did, as a
reference to an undeclared name, and the generator refused the program with BRG3006.

`hello_bridge`'s store has said *"No generator ever sees `notifyListeners`"* in a doc comment **since M0**,
and nothing enforced it.

| | |
| --- | --- |
| hello_bridge errors | 30 → **29** |
| BRG3006 | 4 → **3** |
| `notifyListeners` in UIR | **0** |
| Store extraction | 1 signal, 1 derived, 1 action — exactly the documented contract |

Implemented along the `setState` precedent: metadata in `catalog/widgets/material.json`, generated into
both domains (ADR-18); the adapter answers the question; the extractor never learns what the call is.
Recognition is by **resolved element**, so a user's own method of that name survives.

Both tests are mutation-verified — and the first version of the "not erased" test **did not bite**: it
asserted on document bytes, which the fixture's own declaration satisfies, so it passed with the guard
deliberately removed. It now walks the action body.

## 4. Where to start next

The three remaining BRG3006 cases are `mounted`, `widget` and `context` — **`State` framework primitives**,
and they are one problem rather than three. M5-A counted ~990 references to them in a single real
application, which makes this the highest-value item in the whole M6 list.

They are harder than `notifyListeners` because they are not erasable — they carry meaning:

| Primitive | What it means | Plausible lowering |
| --- | --- | --- |
| `widget.foo` | read a prop from the enclosing component | `props.foo` — the component scope already resolves params this way |
| `mounted` | is this component still in the tree | erasable in most positions: `if (mounted) …` guards a post-await write, and a signal write after unmount is already safe |
| `context` | the element tree handle | **not** erasable in general — `Theme.of(context)`, `Navigator.of(context)` are different problems |

Suggested order, and the reasoning: **`widget.foo` first.** It is a real lowering rather than an erasure,
the component scope already knows how to resolve a parameter to `props.x`, and it is the most frequent of
the three. `mounted` second, as an erasure with a narrower proof obligation. `context` last, and probably
not as one task — it is the doorway to `Theme.of`/`Navigator.of`, which is priority 2 (navigation).

Do not start with `context`. It looks like the same shape as the other two and is not.

### Also queued, in the brief's priority order

2. **Navigation runtime** — ADR-0024 is *proposed, not implemented*. Imperative navigation, overlays,
   dialogs, bottom sheets, menus. Read the ADR before designing.
3. **Widget coverage** — 90 rendered of 120 catalogued.
4. **Browser runtime** — store reactivity has *never been exercised in a browser*; M5-D's defect was in
   the component-local path and the store path is analogous. That is a real risk, not a hypothetical.
5. **Asset pipeline**, 6. **incremental compilation** (99% of build time is analysis; the analyzer already
   has `--cache` and a cache-key implementation that nothing in the CLI uses), 7. **real applications**,
   8. **docs**.

## 5. How to verify anything here

```bash
just ci                                      # build, test, typecheck, lint, portability
cd dart/bridge_analyzer && dart test         # 214
pnpm --filter @bridge/e2e run e2e            # 18 browser tests, real pipeline
pnpm --filter @bridge/e2e exec node src/determinism.mjs
cd fixtures/apps/hello_bridge && rm -rf .bridge build && \
  node ../../../packages/cli/bin/bridge.mjs build 2>&1 | grep -oE "BRG[0-9]+" | sort | uniq -c | sort -rn
```

That last one is the M6 progress meter: **29 errors, and the histogram tells you what to attack.**

Current: `BRG3010 ×19` (fixture theme authoring, not a compiler defect — the app uses literal colours on
purpose, so no full Material role set exists), `BRG3002 ×5`, `BRG3006 ×3`, `BRG3016 ×2`, `BRG3013 ×2`,
`BRG3008 ×2`, `BRG3007 ×2`, `BRG2104 ×1`.

**Do not "fix" the 19 by editing the fixture.** They are the compiler being right, and the fixture uses
literal theme colours deliberately — it is N10's input.

## 6. Standing rules that caught real defects

- **Recognition by resolved element, never by name.** C1 found 18 widgets misclassified by name; M5-A
  found every `Colors.<swatch>` unresolvable for the same reason.
- **Mutation-test every regression test.** Three tests in the last two sessions passed against a
  deliberately broken implementation. A test that does not bite is worse than none.
- **Run the documented sequence, not the convenient one.** `bridge analyze && bridge generate` was broken
  for the entire life of the CLI and nobody noticed, because everything went through `build`.
- **A clean `git status` is not proof of a commit** (§2).
