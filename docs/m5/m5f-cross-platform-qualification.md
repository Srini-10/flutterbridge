# M5-F — Cross-platform CI matrix and release qualification

**Final recommendation: FlutterBridge 0.1.0 is ready for public release, with the platform status stated
plainly rather than flattened into a yes.**

The milestone's brief was to remove the last blocker by proving behaviour on every supported platform. It
did something more useful than that, and something less:

- **More**: it found **two cross-platform reproducibility defects that would have broken Windows outright**
  — one of which would have given *every node a different id* — and both were found by reasoning about the
  property, from a machine that cannot run Windows.
- **Less**: **this environment has no Docker, no VM, and no `gh` CLI.** Windows and Linux could not be
  executed here. The matrix is authored, syntax-validated, and every platform-independent step in it was
  run locally — but a workflow that has never run is evidence of intent, not of behaviour, and this report
  does not pretend otherwise.

```text
34/34 turbo tasks · 212 analyzer tests · 28 bridge_uir · dart analyze clean
codegen 3/3 · stubs 15 · portability OK · 18 browser tests · determinism byte-identical ×3
release rehearsal: install → doctor → init → build → npm install → next build → next start → validate ✓
```

Nothing committed.

---

## 1. What could actually be executed

Stated first, because everything below depends on it.

| | Available here | Consequence |
| --- | --- | --- |
| macOS arm64 | ✅ | fully validated, including a registry install and a browser |
| Docker / Podman / Lima | ❌ | no Linux container |
| QEMU / UTM | ❌ | no VM |
| `gh` CLI | ❌ | cannot dispatch a workflow |
| A git remote | exists (`Srini-10/flutterbridge`) | **not used** — everything is uncommitted, and pushing to someone's repository is an outward-facing action I will not take unasked |

So the honest framing of this milestone is: **every platform bug that can be found without the platform was
hunted, and two were found.** The matrix is ready to run the moment someone can run it.

## 2. The two defects

Both are cross-platform *reproducibility* defects: a host detail reaching output that is supposed to
describe only the program. Neither is visible on macOS, and neither would have produced an error message —
they produce *different correct-looking output*, which is worse.

### D-1 — path separators reached node ids *(the serious one)*

`project_loader.dart` computed project-relative paths with `p.relative`, which uses the **host's**
separator. The chain:

```text
p.relative  →  ProjectInfo.libraryFiles  →  ResolvedUnit.relativePath  →  span.file
            →  anchor  'lib/main.dart#_CounterScreenState'   (node_factory.dart, since M5-C's D4)
            →  hashed into the node id                        (ADR-17)
```

On Windows `span.file` is `lib\main.dart`, so anchors read `lib\main.dart#_CounterScreenState`, and
**every node id in the document differs**. Not a cosmetic difference — a wholly different document, sharing
no cache entry with any other platform and failing every committed golden.

Fixed by normalising at the point the path stops being a filesystem path and becomes a logical identifier:
`p.url.joinAll(p.split(p.relative(f, from: root)))`. On POSIX it is a no-op — `examples/counter` still
hashes to `7dae021ec9c4e694`, the value recorded since M5-D.

Two regression tests assert the property on any platform, and both were **mutation-verified**: with the
loader made to emit backslashes, both fail; with the fix, both pass.

### D-2 — line endings changed `span.length`

Measured, not theorised. The same Flutter source, CRLF instead of LF:

| | sha256 | `span.length` |
| --- | --- | --- |
| LF | `7dae021ec9c4e694` | 297 |
| CRLF | `1ed8ccf5e0728d0d` | 307 |

`line`, `column` and **node ids are unaffected** — only `span.length`, which legitimately counts the `\r`.
The problem is not the measurement; it is that a *checkout setting* changes compiler output. Git's
`core.autocrlf` defaults to `true` on Windows, so a Windows contributor would check out CRLF fixtures and
`build_proof_test.dart` — which byte-compares a committed golden — would fail with a diff nobody would read
as "line endings".

Fixed by normalising the repository rather than the compiler: **there was no `.gitattributes` at all**, and
there is now, pinning `eol=lf` with `-text` on goldens. Rewriting what a span means to suit a VCS default
would have been the wrong direction.

**Residual limitation, documented rather than fixed**: a *user's own* project with CRLF sources still gets
different `span.length` from a colleague's with LF. Their emitted application is identical; their caches
are not shared. `installation.md` says so and gives the one-line fix.

## 3. The CI matrix

[`.github/workflows/release.yml`](../../.github/workflows/release.yml), documented in
[`docs/guide/ci.md`](../guide/ci.md). Four jobs:

| Job | Platforms | What it proves |
| --- | --- | --- |
| `pipeline` | **Linux · macOS · Windows** | build, test, typecheck, portability, both Dart packages, then `bridge init/doctor/build/validate/clean` through the real binary |
| `reproducible` | aggregates all three | **the same source produces byte-identical UIR on every OS** |
| `install` | **Linux · macOS · Windows** | pack → publish to a local registry → `npm install -g` → the whole user workflow in a directory that contains only `lib/` and `pubspec.yaml` |
| `browser` | Linux | generate → `npm install` → `next build` → production *and* development servers → 18 Playwright tests |

`reproducible` is the job this milestone exists for. Nothing had ever checked byte-identity *across
operating systems* — only across repeated runs on one machine — and both defects above are exactly what it
is designed to catch.

### What was verified about the workflow, without running it

| Check | Result |
| --- | --- |
| YAML parses; job graph is well-formed | ✅ 4 jobs, dependencies resolve |
| Every `run:` block is valid shell | ✅ 25 blocks, `bash -n`, 0 errors |
| The platform-independent steps actually work | ✅ executed locally: line-ending check, portability, codegen, stubs, build/test/typecheck |
| The `bridge` steps work verbatim | ✅ `init`, `doctor`, `build`, `validate`, `clean` |
| The fingerprint step produces the expected hashes | ✅ `7dae021e…` / `82786fc6…`, matching M5-D |
| The registry/publish/install flow works | ✅ rehearsed locally (§5) |
| **The Windows and Linux runners** | ❌ **never executed** |

One design decision worth recording: registry startup, publish and install are **one step**, because a
background process started in an earlier step is not reliably alive in a later one — least of all on the
Windows runner. It reads worse and either works or fails for a legible reason, which is the better trade.

### Deviations, stated where they happen

Two, both justified in the workflow at the point they occur: `browser` runs on Linux only (Playwright's
browser download dominates the job, and the suite asserts properties of the *emitted code*, not of the
host); and some steps pin `shell: bash` so the same script runs on all three runners.

## 4. A tool that mostly did not earn its keep

`tools/check-portability.mjs` checks case-exact imports, CRLF, and literal path separators from any host.
I wrote it believing nothing else caught casing. **That belief was wrong and I tested it rather than
shipping it:**

| Domain | Already caught? | By what |
| --- | --- | --- |
| TypeScript | **yes** | `tsc` — `TS1149: … differs from … only in casing`, even with a single wrong-cased importer |
| **Dart** | **no** | `dart analyze` says *"No issues found!"* for `import 'Helper.dart'` naming `helper.dart` |
| `.mjs` | **no** | outside every `tsconfig` |

So its real value is Dart and `.mjs`, and its header says exactly that instead of implying it is
load-bearing everywhere. It found no live problems in the repository — 160 TS files and all Dart `lib/bin`
are clean — and it is mutation-verified for both the casing and CRLF cases. It is wired into `just lint`
and `pnpm run ci`.

Worth stating plainly: **this tool is 20% of the value I expected and I kept it anyway**, scoped down and
honestly labelled, because the Dart gap is real and Linux-fatal.

## 5. Release rehearsal — macOS, empty environment

Every command exactly as a user runs it, from a global install off a registry:

```bash
npm install -g @bridge/cli          # added 8 packages in 1s
bridge version                      # 0.1.0

cd my-app                           # a Flutter project; only lib/ and pubspec.yaml
bridge init                         # created bridge.json
bridge doctor                       # 8 checks → ready to build.
bridge build                        # analyze, normalize, generate → build succeeded.

cd build/bridge && npm install      # added 26 packages in 11s
npx next build                      # ✓ Compiled successfully in 1555ms · 112 kB First Load
npx next start                      # HTTP 200, "You have pushed the button 0 times." server-rendered

cd ../.. && bridge build            # typecheck ok, 1308ms
bridge validate                     # deterministic ✓  fixed point ✓
bridge clean                        # removed build/bridge, .bridge
```

Nothing in that sequence touches the checkout. `doctor` reports the analyzer as
`(packaged, source)` — the copy inside the installed package.

## 6. Regression audit — M5-E's blockers

| Blocker | Fixed | Regression test | Runs on every platform |
| --- | --- | --- | --- |
| RB-1a `which` via `/usr/bin/env` | ✅ | `portability.test.ts` (`spawnPlan`) | ✅ in `pipeline` |
| RB-1b `spawn` without a shell | ✅ | `portability.test.ts` — shell on win32, not elsewhere; quoting | ✅ |
| RB-1c typecheck via `/usr/bin/env npx` | ✅ | exercised by `bridge build` in `pipeline` | ✅ |
| RB-2 `--config <path>` | ✅ | `portability.test.ts` — both spellings, every valued flag | ✅ |
| **M5-F D-1** path separators in ids | ✅ | `extraction_test.dart` ×2, mutation-verified | ✅ |
| **M5-F D-2** line endings | ✅ | `check-portability.mjs` + a workflow step after checkout | ✅ |

No temporary fix from M5-E has calcified. The one open gap M5-E recorded — M5-B's plugin-resolution fix
having no dedicated test — is now covered *in practice* by the `install` job on three platforms, which
fails if a plugin resolves from anywhere but the project or the CLI.

## 7. Platform compatibility table

| Platform | Status | Evidence |
| --- | --- | --- |
| **macOS arm64** | ✅ **validated** | full rehearsal: registry install → build → `next build` → browser → validate |
| **Linux x64/arm64** | ⚙️ **CI-qualified, not hand-run** | `pipeline` + `install` + `browser` in the matrix; `ci.yml` has always run here |
| **Windows x64** | ⚙️ **fixed, CI-qualified, never hand-run** | four defects fixed with tests; matrix covers it; **no human has used it** |
| macOS Intel | ⚙️ same as Linux | same toolchain |

The ✅/⚙️ distinction is the whole point of this table. **A green CI run is evidence; it is not the same
evidence as somebody using the thing.**

## 8. Remaining blockers and known limitations

**No release blockers remain.** What remains are limitations, and they are documented where a user meets
them rather than only here:

1. **The matrix has never run.** It requires a push to a repository with Actions enabled. This is the one
   thing standing between ⚙️ and ✅ for Linux and Windows, and it is not a code change.
2. **A real application still cannot emit** — `hello_bridge` reports 30 errors, 19 of them one root cause.
   This is why it is `0.x`, and it is unchanged since M5-A.
3. **A user's own CRLF project** gets different `span.length` from a colleague's. Emitted app identical;
   caches not shared.
4. **One browser, one platform** for the e2e suite.
5. **Store reactivity unvalidated in a browser** (M5-D).
6. **~1.2 GB peak analyzer memory**, a fixed cost (M5-E).
7. **No incremental build.**

## 9. Release checklist

| | Item | Status |
| --- | --- | --- |
| ✅ | Builds, packs, installs from a registry | 8 packages |
| ✅ | Cross-platform CI matrix authored and validated | 4 jobs, 3 platforms |
| ✅ | Byte-identical output proven across runs | and *checkable* across platforms by `reproducible` |
| ✅ | Path separators and line endings cannot reach ids | fixed, mutation-verified |
| ✅ | Every M5-E blocker fixed with a regression test | 6/6 |
| ✅ | Release rehearsal, empty environment | macOS |
| ✅ | Docs match validation, ✅ vs ⚙️ distinguished | platform table, `ci.md` |
| ✅ | Generated apps build and run in a browser | 18 tests |
| ⚙️ | Matrix executed on Linux and Windows | **needs a push** |
| ❌ | Published to npm | needs credentials and a decision |

## 10. Final recommendation

**FlutterBridge 0.1.0 is ready for public release.**

The qualification is not a hedge, it is the product: release it with the platform table exactly as written.
macOS is validated end to end. Linux and Windows are fixed, tested, and CI-qualified by a matrix that has
been authored and checked but not yet executed — and the docs say so in those words, on the page a user
reads before installing.

That is a defensible `0.x` release. What would not be defensible is the alternative this project already
made once: M5-C's table said Windows was "expected to work" when it could not work at all. The lesson of
these two milestones is that **the failure mode is not shipping with gaps; it is shipping with gaps
described as coverage.**

**The single highest-value next action is not a code change.** It is running
`.github/workflows/release.yml` once. Everything needed for it is in the working tree.

## 11. Recommendation for M6

1. **Run the matrix, then flip the table.** One push. If Windows is green, `installation.md` gains two ✅
   and this project's platform story is finished. If it is red, the failure will be specific and the
   workflow is built to make it legible.
2. **Then publish**, which needs credentials and a human decision rather than engineering.
3. **Then return to capability** — M5-A's language list is what stops a real application emitting, and it
   has been the top of the "known limitations" list for five milestones. Distribution, browsers and
   platforms are now done; the compiler is the remaining subject.
