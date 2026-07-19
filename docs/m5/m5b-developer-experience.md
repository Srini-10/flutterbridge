# M5-B — Developer experience, CLI, packaging and release infrastructure

**Status: complete for the CLI, configuration, packaging and the core documentation set. Two deliverables
are partial and §9 says exactly which and why.**

The headline: **FlutterBridge had no public entry point from a Flutter project to an emitted application.**
Every milestone from M0 to M5-A drove the pipeline through tests and one-off harnesses. `bridge` existed,
but its own help text said what it was — *"These tools are for debugging. None of them changes how anything
compiles."*

It does now:

```bash
cd examples/counter
bridge init && bridge doctor && bridge build
```

```text
  ok   analyze      9845ms
  ok   normalize      14ms   56 nodes
  ok   generate        8ms   wrote 10 file(s) to build/bridge
  skip typecheck      0ms   dependencies are not installed. Run `npm install` in build/bridge…

build succeeded.
```

CI green: 207 analyzer tests + `dart analyze` clean, 28 `bridge_uir`, 33/33 turbo tasks (378 runtime, 117
generator, 126 compiler, **9 core** — new), `codegen:check` OK, `lint:stubs` OK.

---

## 1. What was there, measured before designing

| Deliverable | Before M5-B |
| --- | --- |
| `bridge analyze` / `generate` / `build` | **did not exist** — `BRIDGE-STUB(M2)` since M0 |
| project configuration | **did not exist** |
| a runnable example | **did not exist** — the one program known to generate cleanly was a Dart string inside a test |
| installation / quick-start docs | **did not exist** |
| LICENSE, CHANGELOG, root README | **did not exist** |
| debugging commands (`inspect`, `widget-tree`, …) | nine, and good |

## 2. CLI architecture

Two surfaces, one rule.

**Production** — `init`, `doctor`, `analyze`, `generate`, `build`, `validate`, `clean`, `version`.
**Inspection** — the nine that were already there, unchanged.

**INV-17 still holds: there is no compilation logic in the CLI.** Every stage delegates —

| Stage | Delegates to |
| --- | --- |
| `analyze` | the Dart analyzer, spawned as a process (it is a separate program in a separate language, ADR-2) |
| `normalize` | the real `normalizationPipeline()` through the real `PassManager`, via the *same* `normalize` helper the inspection commands use |
| `generate` | a generator loaded through `PluginHost`, exactly the way a third-party one loads (Spec §1.2 rule 3) |
| writing files | the CLI — precisely *because* ADR-22 forbids the generator from touching disk |

`build` composes the stage functions rather than reimplementing them, so there is one place that knows how
to run the analyzer, one that knows how to load a generator, and one that knows how to write files.

**Streams**: results to stdout, progress and errors to stderr — so `bridge build --json | jq` works while a
human still sees progress.

**Exit codes**: `0` success, `1` the program is not fit to build, `2` the command was wrong, `3` an input
was refused. `1` and `3` are deliberately distinct: `3` can never succeed on retry.

## 3. The defect this milestone found

### A third-party generator could never have been loaded

`PluginHost.load` used a bare `import(specifier)`. A bare specifier resolves relative to **the module
performing the import** — which is `@bridge/compiler`'s own `host.ts`. So every plugin had to be a
dependency of the compiler.

That is why `@bridge/widgets-material` appears in `compiler/package.json`, and it is the exact opposite of
what Spec §1.2 rule 3 exists for:

> the compiler discovers generators/adapters via the plugin host at runtime, never via static import. **This
> is the guarantee that a Vue/Angular/Svelte generator can be added without touching the compiler.**

Resolving from the compiler made touching the compiler *mandatory*: nobody can add a dependency to a package
they do not publish. The rule was enforced on import statements and defeated by resolution.

Found the first time a plugin was loaded from outside this workspace — which is the first time anything ever
did. `PluginHost.load` now takes resolution bases; the CLI passes **the project first, then its own
directory**, so a generator you install wins over the bundled one and the first-party generator works with
nothing installed.

## 4. Configuration specification

`bridge.json`, found by searching upward from the working directory. One parser, in `@bridge/core` — which
its own description has named since M0 (*"…diagnostics engine, **config loader**, structured logging"*) as a
tagged stub. Core sits below both the compiler and the CLI, so it is the one place both can read the same
file without either importing the other. **There is no second parser in the workspace.**

| Key | Default | Read by |
| --- | --- | --- |
| `source` | `"."` | `analyze` |
| `out` | `"build/bridge"` | `generate`, `build`, `clean` |
| `work` | `".bridge"` | all stages |
| `generator` | `"@bridge/gen-react"` | `generate` |
| `plugins` | `["@bridge/widgets-material"]` | all stages |
| `diagnostics.level` | `"warning"` | `generate`, `build` |
| `build.typecheck` | `true` | `build` |

Three decisions worth stating:

- **Every field is consumed by something.** A configuration key that nothing reads is fake functionality: it
  invites a user to set a value and changes nothing. So `watch`, `assets` and `runtime` — all named in the
  brief — are **absent**, because nothing would read them yet.
- **`diagnostics.level` cannot suppress a failure.** It changes what is *shown*. An `error` still fails the
  build at every level; a filter that could hide one would make a broken build look clean.
- **JSON, not YAML.** The workspace has no YAML parser and needs none — every authored configuration here is
  already JSON — and `$schema` gives editor completion with no plugin. A `bridge.yaml` is **not silently
  ignored**: `doctor` reports it and says which format is read.

Unknown keys are reported with the valid ones listed, every problem is collected rather than the first, and
the order is deterministic. Nine tests cover it.

## 5. Diagnostics polish

- **`bridge build` prints the compiler's diagnostics unchanged**, with severity colour and code. Rephrasing
  them in the CLI would be a second voice describing the same problem — the thing the adapter contract
  forbids inside the analyzer, for the same reason.
- **`doctor` never says "not found" and stops.** Every failing check carries what to do about it.
- **An uninstalled emitted project reports the precondition, not 18 module errors.** `tsc` before
  `npm install` produces eighteen "cannot find module 'react'" errors that say nothing about the generated
  code and bury anything that would. The stage now checks for `node_modules` and says *"dependencies are not
  installed. Run `npm install` in build/bridge"*. It is **not** a suppressed failure — the stage reads
  `skip`, and an installed project typechecks for real.
- **Paths are shown as a person would read them** — relative when shorter, absolute when not. `doctor`'s
  first run printed `../../../../../../../../Users/…` for the analyzer.

## 6. `bridge validate`, and the bug it nearly shipped with

`validate` checks determinism and the normalization fixed point **on the user's own project**, because both
are contracts rather than implementation details.

Its first run reported **`fixed point: FAIL`** — while `bridge normalize` on the same document proved the
property holds. The cause was mine: `validate` compared documents serialized with a hand-rolled
`JSON.stringify` over `program.nodes`, where the canonical serializer is `Program.toNdjson()`. Two
byte-different, semantically identical documents.

Worth recording, because M5-A hit the same class of false alarm from a different direction, and a validator
that cries wolf is worse than no validator. It now uses the canonical serializer, and passes.

## 7. Installation validation

Run on a copy of a real project (`fixtures/apps/hello_bridge`) and on the new example, using **only public
entry points** — no test harness, no internal import.

| Step | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | **0.3 s** warm / ~25 s cold |
| `pnpm run build` | **3.4 s** |
| `bridge init` | writes `bridge.json`, detects the `pubspec.yaml` beside it |
| `bridge doctor` | 7 checks; correctly failed on a missing generator before §3's fix |
| `bridge build` | analyze 9 845 ms, normalize 14 ms, generate 8 ms |
| `bridge validate` | deterministic ✓, fixed point ✓ |
| emitted project through `tsc` against the real kit | **clean** |

`hello_bridge` correctly **fails** to build, with its 29 known diagnostics — the CLI surfaces them properly
rather than hiding them.

**Cold vs warm build: 9 867 ms vs 9 625 ms.** There is no incremental build: `analyze` dominates at 97% of
wall clock and re-runs in full. M5-A already established the cause — ~8.7 s of that is `dart run` compiling
the analyzer, not analysis — and that it is a packaging problem rather than a compiler one. Nothing was
optimized, per the brief's rule.

## 8. Packaging

- **LICENSE** (Apache-2.0) at the root; `license` and `repository` on all six TypeScript packages.
- **README** rewritten: what it is, what it refuses to do, honest status numbers, and where to start.
- **CHANGELOG** covering M4-B…M5-B, written from the milestone reports.
- **`examples/counter`** — a Flutter app that compiles with **no diagnostics at all**, with its own README
  explaining what each construct is there to exercise and what it deliberately avoids.
- Generated example output is git-ignored.

## 9. What is partial, and why

**`bridge watch` — not implemented.** It would re-run `analyze` on change, and `analyze` is 9.8 s of which
8.7 s is process startup. A watch mode with a ten-second latency is not a watch mode; it is a slower way to
type the command. The honest prerequisite is a persistent analyzer process, which is packaging work with a
measured payoff — recorded in §11 rather than shipped as something that would disappoint.

**Documentation: 6 of the 14 named documents.** Written: installation, quick start, CLI reference,
configuration, architecture overview, troubleshooting. Not written: plugin system, generator system,
runtime, FAQ, migration, developer, contributing, release. The six chosen are the ones on the path from
"never seen this" to "it built" — the brief's own primary objective. The rest are for contributors, who
have `docs/adr/` and the milestone reports, and I would rather ship six documents that are true than
fourteen that are thin.

**No npm release.** Packages are `private: true` at `0.0.0`. Publishing needs a version policy, a release
workflow, and — the real blocker — **the Dart analyzer packaged alongside the CLI**. Today `bridge` finds it
by looking relative to itself or at `$BRIDGE_ANALYZER`, which works in a checkout and not in an install.

## 10. Remaining production blockers

1. **The analyzer is not packaged.** A published `@bridge/cli` cannot find a Dart binary it does not ship.
   This is the single blocker between "works from a checkout" and "works from `npm i -g`".
2. **No incremental build.** 97% of build time is a full re-analysis.
3. **A real application still cannot emit.** Unchanged from M5-A: framework primitives INV-22 should erase
   (~990 references in one app), non-reactive fields (~290), `is` checks (131), `debugPrint` (297).
4. **[ADR-0024](../adr/0024-performing-a-navigation.md)** — imperative navigation and overlays.
5. **The gesture model.**

## 11. Recommendation for M5-C

1. **Package the analyzer, and publish.** Blocker 1 is what makes every other DX improvement reachable by
   someone who is not in this repository. A `dart compile jit-snapshot` shipped in the npm package removes
   both the packaging blocker and most of the 8.7 s startup — one change, two payoffs.
2. **Then `bridge watch`**, which becomes worth having the moment analysis is sub-second.
3. **Then the M5-A language work** (framework primitives, constant fields, `is` checks) — after which a real
   application emits, and the browser E2E suite M5-A deferred finally has a subject.

Item 1 before item 3 is deliberate and I want to flag the trade-off: item 3 raises what the compiler can
*do*, item 1 raises how many people can *try it*. M5-B's evidence is that nobody outside this repository can
run FlutterBridge at all today, which makes distribution the binding constraint rather than capability.
