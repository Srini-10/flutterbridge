# Handoff — session 2

**v0.1.0 is published.** <https://github.com/Srini-10/flutterbridge/releases/tag/v0.1.0>

**Three Windows defects are open and diagnosed but not fixed.** They are the first thing to do.

---

## 1. Published

| | |
| --- | --- |
| Repository | `srini-10/flutterbridge` — public, 8 topics, description set |
| PR | [#1](https://github.com/Srini-10/flutterbridge/pull/1), merged with a merge commit (not squashed) |
| `main` | `d44d9f1` |
| Tag | `v0.1.0`, annotated |
| Release | published, 8 tarball assets |
| `v0.3.0-dev-preview` | deleted local + remote (its commit is still reachable from `main` — checked first) |

Full detail: [`docs/release/v0.1.0-verification.md`](../release/v0.1.0-verification.md).

**npm was deliberately not published** — it needs an account and a decision about claiming the `@bridge`
scope. Until then `docs/guide/installation.md`'s `npm install -g @bridge/cli` does not work for a stranger.
That is the single largest gap between "released" and "usable by someone else".

## 2. CI — two defects found and fixed, three open

### Fixed

| Defect | Cause |
| --- | --- |
| `ci.yml` failed on PR #1 | `codegen:check` ran **before** `build`, but `widget-support-doc.mjs` imports the generator's `dist/`. Passed locally forever because `dist/` was already there. Fixed by making the script build what it needs, so `pnpm run codegen:check` works on a fresh clone. |
| Windows job **hung indefinitely** | `flutter --version \| head -1` — `head` closes the pipe, and `flutter` is a batch script that does not survive that. Fixed by removing the pipe (`d44d9f1`). |

### Open — all three on Windows, all diagnosed

Run: <https://github.com/Srini-10/flutterbridge/actions/runs/29680584943>

Windows now gets as far as `test` and fails there. Ubuntu and macOS are **green**.

#### W-1 — `run()` breaks on arguments containing double quotes *(this is a real CLI defect, not a test bug)*

```text
FAIL tests/portability.test.ts > running a subprocess > works on this machine, for a program that exists
AssertionError: expected 1 to be +0
```

The test runs `run('node', ['-e', 'process.stdout.write("ok")'])`. On Windows `run()` uses `shell: true`
(the M5-E fix that made `dart.bat` launchable), and the M5-E quoting logic wraps arguments **containing
whitespace** in double quotes. It does not *escape* double quotes already inside the argument, so the
nesting breaks in `cmd.exe` and the process exits 1.

`survives a path containing a space` fails for the same reason.

So the M5-E shell fix is **incomplete**: correct for paths, wrong for any argument containing `"`. Real
impact on `bridge` is low today — it passes file paths — but the fix is in `packages/cli/src/internal/…`'s
`run`/`spawnPlan`, and it needs proper Windows quoting (escape embedded `"` as `\"`, and handle trailing
backslashes before a closing quote, which is the classic `CommandLineToArgvW` trap).

**Do not guess at this.** It cannot be validated locally on macOS; iterate against the matrix.

#### W-2 — the build proof does not typecheck on Windows

```text
FAIL tests/build.test.ts > the emitted project compiles against the real runtime (M3-D build-proof)
AssertionError: expected "the emitted project does not typecheck: …"
```

Message truncated in the log I captured; get the full text with:

```bash
gh run view 29680584943 --log-failed | grep -A 40 "does not typecheck"
```

Most likely candidates, in order: a path separator reaching an emitted import specifier; or the same
quoting defect as W-1 reaching the `tsc` invocation inside the test.

Worth noting what this is **not**: the analyzer's own path handling was fixed in M5-F and the
`line endings are LF on every platform` step **passes on Windows**, so `.gitattributes` is working.

### How to iterate

```bash
gh workflow run release-qualification --ref main
gh run watch <id>
```

The matrix is the only Windows available. Expect a slow loop; batch fixes rather than pushing one at a time.

## 3. M6 work completed this session

Branch **`feature/m6-foundation`**, 3 commits on top of `main`, **not pushed**.

### M6-1 — `notifyListeners` erased *(previous session)*

hello_bridge 30 → 29, BRG3006 4 → 3.

### M6-B — `widget.foo` lowered to a component prop read

hello_bridge **29 → 28**, BRG3006 **3 → 2**. Three layers, each of which exposed the next:

| Layer | Fix |
| --- | --- |
| Read in the render | `logic.Ref` with `name` and no `target` — how a parameter reference is spelled (§A18.3). Catalog → codegen → adapter → extractor, recognition by resolved element. |
| Read inside an **action** | Action closures are emitted *inside* the component where `props` is in scope, but `declareLocalActions` handed them the **program** scope. Same read, two scopes, one wrong. |
| `bind.Param` | Read `binding['name']`; the schema field is **`param`**. Always `undefined` → emitted `props._`, a valid identifier referring to nothing. Invisible until now because no emitting app read its own props. |

**Validated**: 214 analyzer tests, 34/34 turbo, 18 browser tests, byte-identical across three complete runs.

**One gap, stated plainly**: the `bind.Param` fix has end-to-end evidence — real emitted output went from
`props._` to `props.label` — but **no unit regression test**. The hand-authored node graph I wrote had the
wrong shape, which is the exact trap M5-D already recorded. *Mint a real analyzer fixture for it* — that is
task one of the M6 work, and it is small.

### Blocked and documented, not implemented

[`docs/m6/GAP-route-component-arguments.md`](./GAP-route-component-arguments.md) — `app.Route` has nowhere
to record the arguments a construction site passes, so `home: CounterPanel(label: 'Taps')` generates
`<CounterPanel />` and fails `tsc`. **Requires a schema amendment**, so it was documented and stopped per
the M6 rule. The doc names the smallest amendment and the three questions to settle first — one of which
(how often application components are constructed with arguments outside a route) is a *measurement*, not a
design decision.

## 4. Recommended order

1. **W-1 and W-2** — the release is published claiming Windows is CI-qualified, and right now it is not.
   This is the highest-integrity item on the list.
2. **A real fixture for the `bind.Param` regression** (§3, small).
3. **`mounted`** — the last BRG3006 in hello_bridge. Likely erasable: `if (mounted) …` guards a post-await
   write, and a signal write after unmount is already safe under ADR-20. Verify that claim before erasing.
4. **The route-arguments measurement** (§ gap doc, item 1), which unblocks the schema decision.
5. **npm publish**, when the scope decision is made.
6. Then M6-C (navigation), M6-D (runtime), M6-E (real applications).

## 5. Standing rules that earned their keep again today

- **A clean local run proves nothing about a clean checkout.** `codegen:check` passed for months on stale
  `dist/`.
- **Hand-authored node graphs are a trap** — third time. Mint fixtures from the real analyzer.
- **Unblocking one capability exposes the defect in the next.** `widget.foo` → action scope → `bind.Param`
  → the route-arguments gap, in one sitting.
- **Don't push a fix you cannot validate.** W-1 is diagnosed and left alone for exactly this reason.
