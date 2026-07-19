# Handoff — session 3

**Windows went from "fails at `test`" to "fails at `stub tags`" to a fix that has not yet been verified.**
Four Windows defects were found and fixed this session; the fourth's CI run was still going when the
session ended.

Run to check first: <https://github.com/Srini-10/flutterbridge/actions/runs/29681765951> (commit `dd17d96`).

---

## 1. Where Windows stands

Each round moved the failure later in the job, which is the shape of real progress:

| Round | Failed at | Cause | Fixed |
| --- | --- | --- | --- |
| 1 | `toolchain versions` | `flutter --version \| head -1` — `head` closes the pipe, the batch script hangs | `d44d9f1` |
| 2 | `test` (portability) | a shell was used for **every** program, re-parsing every argument | `aded765` |
| 3 | `test` (build proof) | `.bin/tsc` is a shim; `tsc.cmd` is refused by `execFileSync` without a shell | `8637cd5` |
| 4 | `stub tags` | the linter's own exemption used a `/` separator, so it flagged itself | `dd17d96` ⏳ |

**Ubuntu and macOS have been green throughout.** `line endings are LF` passes on Windows, so
`.gitattributes` works.

If round 4 is green, the remaining jobs (`reproducible`, `install`, `browser`) run for the first time —
they have been `skipped` every round because `pipeline` gates them. Expect more findings there, especially
`install` on Windows (global npm prefix, `bridge.cmd` shim).

### The two fixes worth understanding

**W-1 — argument encoding.** M5-E set `shell: true` on Windows because `dart`/`npx`/`flutter` are batch
files and `CreateProcess` refuses those. Right about batch files, wrong about everything else: a shell
re-parses **every** argument, and M5-E only quoted ones containing whitespace. CI caught it with
`node -e 'process.stdout.write("ok")'` — no whitespace, so the quoting never fired.

The fix uses a shell only when one is required. A real executable is spawned directly so libuv's
`quote_cmd_arg` does the encoding — nothing re-implements it on the common path. Only batch files go
through `cmd.exe`, and those arguments are encoded in `packages/cli/src/internal/spawn-plan.ts` in two
passes (CommandLineToArgvW, then `^` for cmd metacharacters), following the published rules. Each rule
has a test asserted on the **encoding**, which is pure string logic and checkable anywhere.

**W-4 — the linter flagged itself.** `EXEMPT_FILES` held `'tools/check-stubs.mjs'`; `relative()` returns
`tools\check-stubs.mjs` on Windows. The census printed correctly — 15 entries, identical to every platform
— and the step still exited 1.

The portability checker missed it, and the reason generalises: it looks for **backslashes inside
`join()`/`resolve()` calls**, and this was the mirror image — a **forward slash inside a comparison
constant**. Worth extending the check.

## 2. BRG3006 — blocked, documented

**Not reducible below 2 without a schema change.** [`GAP-mounted.md`](./GAP-mounted.md) has the full
argument; the short version:

`State.mounted` reaches extraction as a reference to a framework property. UIR spells references two ways
— `logic.Ref` with a `target` (needs a declaration in the program) or with a `name` (needs a lexically
enclosing parameter) — and it is neither. No `logic.*` node models a framework-provided intrinsic.

**It cannot be solved downstream**, and this is the part that matters: the record the generator receives is
byte-identical in shape to a genuine unresolved reference, which is what BRG3006 exists to catch. Handling
it there would mean matching the **name**, which C1 forbids and which would mis-handle an application's own
field called `mounted`.

**Erasing the guard would be a heuristic, not a lowering.** `notifyListeners()` (M6-1) was erasable because
its whole effect was already recorded in the action's write set. `if (!mounted) return;` is *control flow*
whose effect depends on code the compiler has not analysed — the early return skips everything after it,
not just a signal write.

The proposed amendment is a `logic.Intrinsic` node with a target-neutral vocabulary (`component.mounted`,
not the Flutter spelling). **Do not write it yet**: the doc names a measurement that decides whether it is a
node or a field on `logic.Ref`, and M5-A's ~990 framework-primitive count was never broken down by which
primitive.

## 3. State

| | |
| --- | --- |
| `main` | `dd17d96`, pushed |
| `feature/m6-foundation` | 6 commits ahead of `main`'s content, **not pushed** — all four Windows fixes were cherry-picked to `main` |
| Release | v0.1.0 published, 8 assets |
| hello_bridge | **28** diagnostics (19 × BRG3010 theme, 5 × BRG3002 class emission, 2 × BRG3006 `mounted`) |
| Local gates | 34/34 turbo, 214 analyzer, 28 uir, 18 browser, portability clean, determinism byte-identical |

The two branches have diverged in shape but not content — `feature/m6-foundation` carries the same fixes
plus the M6-1/M6-B work. **Rebase it onto `main` before continuing** and expect several commits to drop as
already-applied.

## 4. Next, in order

1. **Check run 29681765951.** If green, the three downstream jobs run for the first time — treat their
   output as new information, not as a formality.
2. **Extend `check-portability.mjs`** to catch hardcoded `/` in comparison constants, not only `\` in path
   calls (§1, W-4). Small, and it closes the class rather than the instance.
3. **A real fixture for the `bind.Param` regression** — still outstanding from session 2. The fix has
   end-to-end evidence (`props._` → `props.label`) and no unit test, because the hand-authored node graph I
   wrote had the wrong shape. Mint one from the analyzer.
4. **The `logic.Intrinsic` measurement** (§2), which unblocks the last BRG3006.
5. **npm publish** — still the largest gap between "released" and "usable by a stranger":
   `installation.md` tells people to run `npm install -g @bridge/cli` and nothing is on npm.
6. Then M6-C (navigation), M6-D (runtime), M6-E (real applications).

## 5. What this session should be remembered for

**Four Windows defects, none of which any amount of local testing could have found**, and three of them in
code written *specifically* to make Windows work:

- M5-E's shell fix was correct for batch files and wrong for everything else.
- M5-E's portability tests — written to prove Windows spawning works — were what caught it, on Windows,
  three sessions later.
- The stub linter, hardened in M5-E, flagged its own source.

The pattern is not that the fixes were careless; it is that **a platform you cannot run is a platform you
are guessing about**, and the only cure is the runner. Each round took one dispatch and produced one
precise, legible failure — which is what the matrix was built for and is worth the wall-clock.
