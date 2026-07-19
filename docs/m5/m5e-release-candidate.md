# M5-E — Release candidate hardening and final architecture audit

**Recommendation: RC ready, for macOS. RC blocked for Windows and Linux until someone runs it there.**

That split is the milestone's finding. The audit turned up **one class of defect that would have shipped
broken** — the CLI could not work on Windows at all, three separate ways — and the documentation claimed it
was "expected to work". Everything else found was debt, drift or stale prose.

```text
34/34 turbo tasks · 210 analyzer tests · 28 bridge_uir · dart analyze clean
codegen: 3/3 · stub census: 15 (was 16, one was miscounted) · 18 browser tests
determinism: byte-identical across 3 complete pipeline runs
clean-machine install → doctor → build → npm install → next build → typecheck → validate ✓
```

Nothing committed. 150 files in the working tree.

---

## 1. Release blockers

### RB-1 — the CLI could not run on Windows *(fixed; unvalidated)*

Three independent POSIX-only assumptions, each of which alone stops a stage:

| Where | What | Consequence on Windows |
| --- | --- | --- |
| `project.ts` `which()` | `/usr/bin/env which dart` | `doctor` reports **Dart SDK: not on PATH** on every machine, including correct ones |
| `project.ts` `run()` | `spawn` without a shell | `dart`/`npx`/`flutter` are `.bat`/`.cmd`; `CreateProcess` refuses those → `ENOENT` on a program plainly on `PATH` |
| `build.ts` typecheck | `/usr/bin/env npx` | the typecheck stage cannot start |

Analysis, dependency resolution and typechecking — three of `build`'s four stages — would all have failed.

Fixed by extracting `spawnPlan(program, argv, platform)`, a pure function that enables a shell only on
`win32` and quotes arguments containing whitespace (a shell re-splits an argv array, so
`C:\Users\me\My Projects\app` would otherwise reach the analyzer as `C:\Users\me\My`), and by using
`where` on Windows and `which` elsewhere.

**The fixes have not been run on Windows.** `installation.md` now says so in those words, and the platform
table says `known-broken until 0.1.0; fixed but unvalidated` rather than "expected to work". Replacing a
false claim with an unverified one would be the same mistake in a nicer font.

### RB-2 — `--config <path>`, the documented form, did not work *(fixed)*

`docs/guide/cli.md` documented `--config <path>`. The parser's `VALUED` set — which decides whether a flag
consumes the next token — never got `config` when the production commands added it in M5-B. So the flag
parsed as a boolean and the documented spelling failed with *"--config needs a value."*, while only
`--config=<path>` worked. A flag can be *read* as a value in one file and *declared* as a boolean in
another, and nothing connected the two declarations.

## 2. Architecture audit

Verified against Spec v2.0 + amendments v2.1–v2.5 and ADR-0001…0024.

### What holds

| Check | Result |
| --- | --- |
| ADR-22 — generator `generate` is pure/synchronous | ✅ no `fs`, `Date.now`, `Math.random`, `process.env` anywhere in `packages/generators/react/src` |
| ADR-15/INV-19 — no module-scope mutable state in **emitted output** | ✅ (`expression.ts`'s module-scope `lowerStatements` is in the *generator*, not its output — a documented cycle-break) |
| ADR-13/INV-20 — no literal colours in the kit | ✅ only in docstrings; the historical violation is recorded as fixed |
| Spec §1.2 rule 3 — plugins never statically imported | ✅ every reference is a string specifier resolved by `PluginHost` |
| **Determinism of emitted output** | ✅ **no** `Date.now`/`Math.random`/`localeCompare`/unsorted iteration in any path that reaches output, in either language domain |

### Drift and debt found

**D-1 — the ARGB `(super)` walk was implemented twice** *(fixed)*. `flutter_adapter._channelsOf` and
`expression_extractor._packChannels` were the same algorithm in the same Dart package, and both doc
comments independently narrated the *same* M5-A defect — because it had to be fixed in both. Flutter has
already changed colour representation once (3.27); the next change would have to be found twice, and
finding one gives colours that resolve on one extraction path and not the other. Extracted to
`session/colour_constants.dart`.

Proof it changed nothing: `examples/counter` produces UIR hashing `7dae021ec9c4e694` — **the exact value
recorded in M5-D's determinism runs**, before any M5-E change. And the committed golden
(`fixtures/uir/layout_proof.ndjson`), which contains `#FF2196F3` — `Colors.blue`, a `MaterialColor`
swatch — is byte-compared by `build_proof_test.dart`, which passes.

**D-2 — a second, weaker NDJSON parser in the CLI** *(fixed)*. `parseDocument` reimplemented what
`@bridge/compiler` exports, and was worse twice over: `JSON.parse(line)` bare, so a malformed line gave a
raw `SyntaxError` with no line number in the one path users run; and the index came from a `.map` applied
**after** a `.filter` that dropped blank lines, so every reported line number was wrong by the number of
blank lines above it. Now delegates to `parseNdjson`.

**D-3 — `@bridge/verification` was a published, empty package** *(fixed)*. Its source is `export {}` behind
an M2 stub tag, nothing imports it, and it was both a runtime dependency of `@bridge/cli` and published at
`0.1.0`. Every user downloaded an empty package promising "verifier host, first-party verifiers,
reference-build manager, report renderer". Removed from the CLI's dependencies and marked `private`; it
stays in the workspace because Spec §1.2's rules are enforced against its directory. Publishable packages:
**9 → 8**.

**D-4 — the stub census was inflated, and punished good documentation** *(fixed)*. `check-stubs.mjs`
counted a *retired* stub described in prose (`` `index.ts` carried `BRIDGE-STUB(M2): …` ``) as a live one.
The census is a release-readiness number, so an inflated one is a wrong answer to a decision. It also had
a second cost: comments were reworded twice in earlier milestones to appease it — documentation made worse
to keep a tool quiet. A tag now counts only when it *opens* its comment. Census 16 → **15**. The same file
sorted with `localeCompare`, which this project forbids elsewhere for determinism; also fixed.

### Documented, not fixed

**ADR-18 drift in `app_root.ts`.** `const APP_ROOTS = new Set(['MaterialApp', 'CupertinoApp', 'WidgetsApp'])`
hardcodes three names that *are* in `catalog/widgets/material.json` — and the comment above it cites the
catalog. ADR-18 says framework metadata is authored once. **Not fixed**, because the catalog has no field
expressing "is an application root": the fix is a catalog *schema* addition, and the brief says not to
redesign architecture unless validation proves it necessary. It has not. (`ASSET_PROVIDERS` next door looks
like the same problem and is not — `AssetImage` is an `ImageProvider`, not a widget, so ADR-18 does not
govern it.)

**14 of 15 stubs have passed their milestone.** M1×1, M2×2, M3×4, M4×7; only the M5 animation engine is
not overdue. They are discipline-compliant — the linter checks tags exist, never whether the milestone has
passed — which is how 14 overdue stubs sit under a green gate. `just corpus` still says "not implemented
until M4"; M4 shipped nine reports ago.

**`kind` and `depth`** are declared value-taking flags that nothing reads.

## 3. Regression traceability

Every defect since M0 that a report claims to have fixed, against the test that would catch it again.
Abbreviated to the ones where the answer is interesting; **the gaps are the point**.

| Milestone | Defect | Regression test | Verified |
| --- | --- | --- | --- |
| M5-A D1 | colour recognition by name, not supertype | `extraction_test.dart` › *a MaterialColor is a colour* | ✅ **added this milestone** |
| M5-A D2 | `getField` does not see inherited fields | same group, `(super)` walk | ✅ **added this milestone** |
| M5-A D3 | token symbols collided across files | `fixture_app_test.dart` | ✅ |
| M5-A D4 | anchors not file-qualified | `extraction_test.dart` › distinct anchors | ✅ |
| M5-B | plugins resolved from the compiler | **NONE FOUND** | ❌ gap |
| M5-C | emitted `workspace:*` protocol | `runtime-kit-range.test.ts` | ✅ |
| M5-C | `@types/react-dom@19.2.7` does not exist | `runtime-kit-range.test.ts` | ✅ |
| M5-C | `dart run` splits paths at `@` | `analyzer.test.ts` | ✅ |
| M5-C | manifest schema refusal inert | `cli.smoke.test.ts` | ✅ |
| M5-D B1 | `.js` specifiers broke `next build` | `browser-regressions.test.ts` | ✅ |
| M5-D B2 | expression signal reads never subscribed | `browser-regressions.test.ts` + browser suite | ✅ |
| M5-E RB-1 | POSIX-only process invocation | `portability.test.ts` | ✅ |
| M5-E RB-2 | `--config <path>` | `portability.test.ts` | ✅ |

**M5-A D1/D2 had no test for five milestones**, and the reason is worth recording: the Dart fixture's
Flutter stub could only express a plain `Color`. `MaterialColor`/`ColorSwatch` did not exist in it, so the
case that broke was **not expressible**. The stub now carries them.

Those tests are **mutation-verified** — with the `(super)` walk removed, exactly the two tests that should
fail do, and the ARGB-format test correctly still passes. A regression test nobody has watched fail is a
hypothesis.

**One gap remains open**: M5-B's plugin-resolution fix has no regression test. It is exercised implicitly
by every clean-install validation (a plugin that resolved from the compiler would fail `doctor`), which is
why it is a gap rather than a blocker.

**No temporary fix was found that became permanent architecture.** A search for `for now`, `temporary`,
`workaround`, `hack` across both domains returned only Dart's `@deprecated` *detection* logic.

## 4. Performance

Measured; nothing optimized, because nothing measured justifies it.

| Stage | | Browser (median of 5) | |
| --- | --- | --- | --- |
| `flutter pub get` | 765 ms | server ready | 614 ms |
| **`bridge build`** | **8 427 ms** | TTFB | **3 ms** |
| ├ analyze | 8 335 ms (**99%**) | first contentful paint | **20 ms** |
| ├ normalize | 13 ms | DOMContentLoaded | 12 ms |
| ├ generate | 8 ms | **interactive** | **12 ms** |
| `npm install` (emitted app) | 4 238 ms | First Load JS | **112 kB** |
| `next build` | 8 145 ms | | |

**Memory** — new this milestone, and the most interesting number:

| | Peak RSS |
| --- | --- |
| Dart analyzer, `examples/counter` (82 lines) | **1.22 GB** |
| Dart analyzer, `hello_bridge` (369 lines, 7 files) | **1.19 GB** |
| normalize + generate (Node) | 59.7 MB |

**Memory is a fixed cost, not a function of application size** — it is `package:analyzer` loading the
Flutter SDK's element model. Good news for large applications; a hard floor of ~1.2 GB regardless. A CI
runner with 2 GB is tight. This is not in the documented requirements and should be.

The two standing observations are unchanged: analysis is 99% of compile time and the cause is Dart VM
startup rather than analysis (M5-A), and the generated application itself is fast enough that there is
nothing in the output to optimize.

## 5. Documentation audit

Every factual claim in README, CHANGELOG, CLAUDE.md and `docs/guide/*` was checked against the code.
Corrected:

| Document | Claim | Reality |
| --- | --- | --- |
| `installation.md` | "pulls **nine** packages", listing `runtime-react` and `verification` | **seven** `@bridge` + one third-party; `runtime-react` is installed by the *emitted app*, `verification` is not published |
| `installation.md` | Windows "expected to work" | known-broken; see RB-1 |
| `installation.md` | `doctor` — 8 checks, then nine enumerated | eight always, a ninth only when a `bridge.yaml` exists |
| `compatibility.md` | `verification` in the lockstep train | not published at all |
| `compatibility.md` | manifest sample | omitted `diagnosticCount`, which `Manifest` requires |
| `compatibility.md` | "the four language features that block it" | M5-A measures six owner classes and ten constructs |
| `CHANGELOG.md` | "All packages published" | eight of nine |
| `CLAUDE.md` | "the README's milestone table is stale"; "ADRs run to 0022"; "`just e2e` is a stub" | the table is gone, ADRs run to 0024, `just e2e` is real since M5-D |
| `.changeset/config.json` | lockstep group | omitted `uir` and `widgets-material`, included the unpublished `verification` |

**Added: `docs/guide/supported-widgets.md`.** There was no public list of what compiles — the only way to
find out was to write a widget and be refused by `BRG3001`. It is **generated** from `WIDGET_MAP` and
checked by `codegen:check`, so it cannot drift (ADR-18's argument applied to documentation). 90 widgets
render; 35 more are catalogued but unmapped, and publishing that gap is more honest than hiding it.

**Also removed: a registry auth token from `.npmrc`.** M5-C's `npm config set --location=project` wrote
`//localhost:4873/:_authToken=fake` into the repository's own `.npmrc` **and deleted two lines of
hand-authored explanation** while doing it. The file is restored exactly; the harness credential now lives
in the scratch directory where it belongs, passed via `--userconfig`.

Still missing, and not written: migration guidance (nothing to migrate from yet), `CONTRIBUTING.md`,
`SECURITY.md`, and a JSON Schema for `bridge.json` — `init` writes a `$schema` URL with nothing behind it.

## 6. RC validation

Run end to end, from a **fresh registry publish and a clean global install**, after every change above:

| Step | Result |
| --- | --- |
| `npm install -g @bridge/cli` | 8 packages, 1 s |
| `bridge doctor` | ready to build |
| `bridge doctor --config ./bridge.json` | ready to build *(RB-2, from an install)* |
| `bridge build` | succeeded |
| `npm install` in the emitted app | 26 packages, 12 s |
| `next build` | ✓ compiled in 1 503 ms, 102 kB shared |
| `bridge build` again | **typecheck ok, 1 152 ms** |
| `bridge validate` | deterministic ✓, fixed point ✓ |
| browser suite | **18 passed** |
| determinism, 3 complete pipeline runs | **byte-identical** |

## 7. Release checklist

| | Item | Status |
| --- | --- | --- |
| ✅ | Builds, packs, installs from a registry | 8 packages |
| ✅ | Versions, licences, metadata, exact inter-pins | `0.1.0` lockstep |
| ✅ | No `workspace:`/`catalog:` protocol in any tarball | asserted by `just package` |
| ✅ | Analyzer ships and runs from an install | `vendor/dart/` |
| ✅ | Generated apps install, build and run in a browser | 18 tests |
| ✅ | Determinism and fixed point on a real project | byte-identical ×3 |
| ✅ | Docs match implementation | audited claim by claim |
| ✅ | Supported-widget list, generated and drift-checked | 90 |
| ✅ | Every M5 defect has a regression test | one M5-B gap, documented |
| ❌ | Validated on more than one platform | **macOS arm64 only** |
| ❌ | CI publish workflow | not written |
| ❌ | Memory requirement documented | ~1.2 GB floor, measured today |
| ❌ | `just corpus` | still an M4 stub |

## 8. Known limitations

Unchanged and load-bearing:

1. **A real application still cannot emit** — `hello_bridge` reports 30 errors, of which 19 are one root
   cause (literal theme colours, no full role set) and 11 are genuine gaps. This is why it is `0.x`.
2. **One application, one browser, one platform.** Forms, dialogs, navigation between routes, scrolling
   and stores have no emitting subject to be validated against.
3. **Store reactivity is unvalidated in a browser.** M5-D's B2 was in the component-local path; the store
   path is analogous and has never been run.
4. **No incremental build.** The analyzer has a `--cache` flag and a cache-key implementation; nothing in
   the CLI uses them.
5. **~1.2 GB peak memory**, fixed cost.

## 9. Recommendation

**RC ready for macOS. RC blocked elsewhere.**

The system is production-quality on the platform it has been run on: it installs from a registry, compiles
a real Flutter application, produces an app that builds and behaves correctly in a browser, refuses what it
cannot do faithfully, and produces byte-identical output across complete rebuilds. The audit found no
architectural drift that required a redesign and no workaround that had calcified into architecture.

What stops it being an unqualified RC is not capability. It is that "works on Windows" and "works on Linux"
are claims nobody has earned, and this milestone found that the Windows claim was **actively false** while
being documented as probably true. That is the failure mode worth blocking on: three POSIX-only calls that
no test could catch, because every test ran on the one platform where they work.

**M5-F should be a CI matrix and nothing else.** `just release-check` is the gate; what is missing is a job
that runs it on macOS, Linux and Windows and then publishes. Windows first — it is the only platform whose
code has never executed, and RB-1 is a fair warning about what unexecuted platform code is worth.
