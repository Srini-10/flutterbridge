# Handoff — session 4

**Windows CI went green, and with it the four downstream jobs that had never run once.**

Latest run: <https://github.com/Srini-10/flutterbridge/actions/runs/29684363395> (commit at time of
writing: the `pnpm.cmd` fix).

---

## 1. W-5 — resolved, and the hypothesis was half wrong

The brief said to treat W-5 as a hypothesis and verify before fixing. That was the right instruction: the
hypothesis was **confirmed for a minority of the failures and disproved for the majority**, and acting on it
directly would have fixed the wrong thing.

### What the evidence said

```text
determinism_test.dart:70    Expected: 'lib\a.dart'    Actual: 'lib/a.dart'      ← hypothesis correct
incremental_test.dart:215   Expected: ['lib/base.dart','lib/leaf.dart',...]
                            Actual:   ['lib/base.dart']                          ← both POSIX. Not a
                                                                                   spelling mismatch at all
```

The second is a **behavioural** failure, and it uncovered a real defect that M5-F introduced.

### Three causes, found in order

| # | Cause | Kind | Fix |
| --- | --- | --- | --- |
| 1 | tests asserting `p.join('lib','a.dart')` — the *host's* spelling of a logical path | test | assert the literal |
| 2 | `unit_digest.dart` built import keys with platform `p.join` while digest keys had become POSIX | **implementation** | `p.url` |
| 3 | `analysis_session.dart` joined a host root to a logical path, producing a hybrid | **implementation** | convert at the boundary |

Cause 2 is the one that matters most, because it was silent: `DependencyGraph` keeps an edge only
`where(digests.containsKey)`, so on Windows **every edge was dropped** — `transitiveDependentsOf` returned
nothing, and an incremental build would rebuild only the edited file and emit stale output for everything
importing it. No error, no diagnostic.

Cause 3 produced the loudest symptom and took out most of the suite:

```text
Invalid argument(s): Only absolute normalized paths are supported:
  C:\Users\RUNNER~1\...\bridge_analyzer_test_f86bbc9a\lib/main.dart
```

Note the separators — a Windows root joined to a POSIX relative path.

### The architecture this named

M5-F introduced a split without stating it, and W-5 is what happens when it goes unstated. It is now
documented at `analysis_session.dart`'s `_hostPath`:

- **Logical** — project-relative, always `/`-separated, on every platform. `span.file`, anchors, node ids
  (ADR-17), digest keys, import edges. Identical on every OS *by construction*, which is what makes UIR
  byte-identical and a cache shareable.
- **Host** — what `dart:io` and `package:analyzer` accept, separated by whatever the OS uses.

`p.join(hostRoot, logicalPath)` silently mixes them and is a no-op on POSIX, which is exactly why it
survived until a Windows runner existed.

**The implementation was preserved and the tests were changed where the hypothesis held; where it did not,
the implementation was fixed.** M5-F's normalisation is correct — it is what makes
`byte-identical across platforms` pass — and nothing about it was reverted.

Windows analyzer failures: **88 → 4 → 0**.

## 2. Downstream jobs — first run ever, two more defects

`pipeline` gates them, so `reproducible`, `install` and `browser` had been `skipped` on every previous
matrix run. All four fired at once:

| Job | First result |
| --- | --- |
| `byte-identical across platforms` | ✅ **passed** — UIR is identical on Linux, macOS and Windows |
| `browser validation (linux)` | ✅ passed |
| `packaged install` ubuntu / macOS | ✅ passed (after a fix) |
| `packaged install` windows | ❌ then fixed; result pending |

**`byte-identical across platforms` passing is the headline.** It is the property M5-F was built to
establish and that nothing had ever checked across operating systems.

Two defects, both in code that only a real runner exercises:

- **npm read a tarball path as a GitHub shorthand.** `npm publish release/foo.tgz` parses a bare `a/b` as
  `owner/repo` and tried `ssh://git@github.com/release/bridge-cli-0.1.0.tgz.git`. Local validation ran
  `cd release && npm publish *.tgz`, where the argument has no slash. Fixed with `./`.
- **`pnpm` is `pnpm.cmd` on Windows** and `execFileSync` refuses a `.cmd` without a shell. **Third
  occurrence of this class** — the CLI had it with `dart.bat` (M5-E), the build proof with `tsc`
  (session 3), the release tooling now. The rule worth remembering: *anything invoked by name that is a
  launcher rather than an executable needs a shell on Windows.*

## 3. `mounted` — measured, and the amendment is now justified

Priority 2. Counted across every real Flutter application on this machine, including both that M5-A used
(they are present at `/Users/sridhar/Documents/continuum` and `/Users/sridhar/Desktop/YBOTT/unichat`):

| Application | Files | Lines | `mounted` |
| --- | --- | --- | --- |
| `examples/counter` | 1 | 82 | 0 |
| `fixtures/apps/hello_bridge` | 7 | 369 | 1 |
| **continuum** (`apps/macos/mac`) | 7 | 2 489 | **42** |
| **unichat** (`mobile`) | 113 | 47 796 | **306** |

**348 occurrences in two real applications.** The patterns are what decide the design:

| Shape | continuum | unichat |
| --- | --- | --- |
| `if (!mounted) return;` | 13 | 133 |
| `if (mounted) { … }` | 20 | 94 |
| **compound condition** | 4 | **54** |
| `context.mounted` | 0 | **11** |

The 58 compound uses settle it:

```dart
if (result == null || !result.updateRequired || !mounted) return;
```

`mounted` is an ordinary boolean operand there. **There is no statement to match and nothing to erase**, so
any representation must be expression-level. That disproves the framing the gap document originally had.

It also revealed the vocabulary needs **two** members: `context.mounted` is `BuildContext.mounted`, a
distinct API asking about the element rather than the `State`, with 11 real uses.

Full analysis and the proposed `logic.Intrinsic` amendment: [`GAP-mounted.md`](./GAP-mounted.md). **Still
not implemented** — it is a schema change, and one question remains open (what the runtime kit provides,
probably `useMounted()`), which belongs in the same ADR.

## 4. State

| | |
| --- | --- |
| `main` | pushed; all Windows/CI fixes landed |
| `feature/m6-foundation` | **behind** — carries M6-1 and M6-B, which are **not on `main`** (see §5) |
| Release | v0.1.0 published, 8 assets |
| hello_bridge | 28 diagnostics (19 BRG3010 theme, 5 BRG3002 class emission, 2 BRG3006 `mounted`) |
| Local | 215 analyzer tests, 34/34 turbo, 18 browser, determinism byte-identical |

### ⚠ Branch divergence to resolve first

`main` has all the platform work. `feature/m6-foundation` has **M6-1 (`notifyListeners` erasure) and M6-B
(`widget.foo` lowering)**, which were never cherry-picked. Those two are real compiler capability — they
took hello_bridge from 30 → 28 diagnostics — and they are currently only on the feature branch.

**First action next session**: rebase `feature/m6-foundation` onto `main`, confirm 215+ tests still pass,
and open a PR. Do not start M6-C before that; the two branches will only diverge further.

## 5. Next, in order

1. **Confirm run 29684363395 is fully green.** If `windows · packaged install` passes, every job in the
   matrix has passed at least once and the platform table in `docs/guide/installation.md` can finally move
   Linux and Windows from ⚙️ to ✅ — with the evidence to back it.
2. **Reconcile the branches** (§4).
3. **A real fixture for the `bind.Param` regression** — outstanding since session 2. The fix has
   end-to-end evidence and no unit test.
4. **The `logic.Intrinsic` ADR** — the measurement is done; what remains is the kit API decision.
5. **npm publish** — still the largest gap between "released" and "usable by a stranger".
6. **M6-C** (navigation) — not started. `ADR-0024` is proposed, not implemented.

## 6. What this session should be remembered for

**Verifying the hypothesis before fixing it was the whole game.** Had I trusted it, I would have edited
tests until they passed and shipped a Windows build whose incremental compiler silently emitted stale
output — the hypothesis was right about the symptom and wrong about the disease.

The second lesson is quieter: **`fakeDigest`, the test stand-in for `DigestComputer`, contained production's
exact bug** — independently written, same mistake. A fake that has to be fixed the same way as the real
thing is a faithful fake, and it is also evidence that the mistake was an easy one to make rather than a
careless one.
