# Compiler Readiness Report

**Hardening pass, post-M2.** No generator work. No schema change. No new compiler features.

`just ci` → **exit 0**. 182 TypeScript tests, 180 analyzer tests, 28 `bridge_uir` tests. Corpus output
byte-identical to the pre-hardening baseline, except for one deliberately reworded diagnostic message
(§2.1).

---

## 1. Code audit

### Removed

| | where | why |
|---|---|---|
| `PassResult` | `normalize/pass.ts` | interface, zero uses |
| `Program.filter()` | `program.ts` | zero callers; only a test asserting it existed |
| `export type { WidgetRegistry }` | `n8_extract_slots.ts` | dead re-export |
| `pascal()` | `schema-codegen/generator/common.ts` | leftover from an earlier codegen design; only `camel` survived |
| `dependsOn`, `isDeclared`, `isExternal`, `isSignal` | analyzer (`project.dart`, `reference_resolver.dart`, `scope.dart`) | declared, never called |
| `run`, `pipeline`, `order` helpers | `n9_n10_n11.test.ts` | test helpers that were never used |
| unused `mkdirSync` import | `schema-codegen.test.ts` | — |

No `TODO`, `FIXME`, `HACK`, or obsolete compatibility layer remains in production code. Every apparent hit
was legitimate domain vocabulary (the `Deprecated` *annotation*, the *temporary file* in atomic writes,
the `BRG2xxx` code ranges).

### Deduplicated: one tree rewrite

Five passes (N5–N9) each hand-rolled the same bottom-up rebuild with the same
*same-object-when-unchanged* semantics. Five copies of a traversal are five places for that contract to
break independently — and that contract is what the fixed-point check **is**: `manifest.changed` is a
pointer comparison, so a rewrite returning a deep-equal copy instead of the identical object would make
every pass look like it changed the program, forever.

It now exists once, in `internal/normalize/tree.ts`:

- `node(n)` — replace a node, **bottom-up**.
- `item(i)` — splice or drop an item *after* visiting it.
- `prune(i)` — drop an item **before descending into it**.

**`prune` is load-bearing, and I nearly lost it.** My first conversion of N7 dropped dead branches
*after* descending, which would have emitted diagnostics about nodes inside a subtree that was about to be
deleted. A warning pointing inside a branch that can never render sends someone hunting a bug that cannot
fire. The pre-order hook restores the original behaviour, and `tree.test.ts` plus a new N7 regression test
now guard it.

**N5 deliberately does not use `mapTree`**, and a comment in the file says why: it is pre-order and
short-circuiting — it decides the fate of a whole lambda without descending into its body. A bottom-up
walk would lift the closures nested *inside* a callback first, which is a different program.

---

## 2. Architecture audit

Audited comment-stripped, mechanically. **One violation found.**

### 2.1 The violation: framework knowledge in a compiler diagnostic

`BRG2104` (N4) read:

> *"Flutter states them inside the builder closure (`if (snapshot.hasData)`)…"*

The compiler is frontend-neutral by construction; that message is simply **wrong advice** for a SwiftUI or
React Native frontend feeding the same UIR. Reworded to describe the UIR-level fact only. This is the sole
behavioural difference between the pre- and post-hardening corpus output.

### 2.2 Everything else holds

| rule | result |
|---|---|
| No framework name in compiler **code** | ✅ 0 (they appear only in comments explaining why they must not be known) |
| No analyzer concept in the compiler | ✅ 0 — no AST, no `Element`, no `DartType` |
| No compiler/normalization concept in the analyzer | ✅ 0 |
| No framework name in extraction (ADR-18) | ✅ 0 — all 14 `session/extract/` modules |
| `package:analyzer` quarantined to `session/` (ADR-14) | ✅ 0 imports elsewhere; enforced by `dependency_rules_test.dart` |
| Compiler never statically imports an adapter | ✅ enforced by dependency-cruiser + a negative test |
| Dependency direction | ✅ compiler → {core, plugin-sdk, uir}; `widgets-material` is a **devDependency only** |
| Plugin SDK carries no behaviour | ✅ types and interfaces only |
| Generated-code ownership | ✅ single source per artifact; `codegen-check` fails CI on drift |

*(An earlier grep suggested five files imported `package:analyzer` outside `session/`, and that the
compiler knew three widget names. Both were artefacts of matching comment text and doc prose. The precise
checks return zero. I report this because a false positive discarded in silence is indistinguishable from
one never found.)*

---

## 3. Determinism audit

### Found and fixed: `localeCompare` in codegen

`schema-codegen` sorted definitions, fields and validator findings with `String.localeCompare`. **Collation
is an ambient property of the host** — it depends on ICU data and on `LANG`/`LC_COLLATE`, neither of which
is an input to this compiler. Under `tr_TR` the dotted and dotless `i` do not sort where an English locale
puts them, and `'a'.localeCompare('B')` is negative in every locale while code-unit order says positive.

Replaced with a single code-unit comparator (`schema-codegen/src/order.ts`).

**The schema hash did not move** (`a2c185b828a6d9aa`, unchanged) and the generated Dart and TypeScript are
**byte-identical**: on this machine ICU happened to agree with code-unit order. That is exactly what makes
it worth fixing — it was a latent hazard that would have surfaced as an unreproducible build on someone
else's laptop, not as a test failure here.

`UIR_SCHEMA_HASH` was never at risk: it is a SHA-256 over a **hardcoded, ordered** file list, and
`readdirSync` is used only to build a `Set` for a presence check.

### Verified sound

| source | how it is pinned |
|---|---|
| node order | sorted by `(kind, id)` |
| object keys | `canonicalEncode`, sorted recursively by code unit |
| numbers | canonical form (§A15) — identical bytes in Dart and TypeScript |
| plugin order | sorted by name |
| catalog merge | `(priority, name)`; same-priority conflict is `BRG2108`, an error |
| nav-graph transitions | sorted by id |
| filesystem traversal | `sortedPaths(...)` over `listSync` |
| cache eviction | `(lastAccessed, path)` — the tiebreak is deliberate and commented |
| glob / readdir | never used for ordering |
| parallel execution | none — the compiler is single-threaded |
| NodeId generation | SHA-256 over canonical bytes |
| diagnostics | pass order, then traversal order |

No time, randomness, PID, environment, or hash-order iteration anywhere. Dart's default `Map` is
insertion-ordered; no `HashMap`/`HashSet` is used. No bare `.sort()` on numbers (every one is on strings).

**Measured:** program bytes, diagnostics **and** the normalization manifest are identical across three
consecutive runs on all three corpus applications.

---

## 4. Performance audit

Measured first. Exactly one thing was worth optimizing.

### The finding: generator traversal

`walk`/`walkNode` were `function*`. **`yield*` delegation costs O(depth) per yielded node** — every value
is re-yielded up through the entire generator stack it came from, so a deep tree pays for its depth on
every single node.

On `wonderous` (7.1 MiB, 30,103 nodes): draining one generator walk cost **31.8 ms**; the identical visit
set, traversed eagerly, costs **3.5 ms**. A **9× tax — paid eleven times, once per pass.**

Now eager. Same visit set, same pre-order, byte-identical output.

| | before | after |
|---|---|---|
| hello_bridge | 3.9 ms | **2.5 ms** |
| compass_app | 49.9 ms | **25.6 ms** |
| wonderous | 169.5 ms | **90.0 ms** (1.88×) |

### Not optimized, deliberately

- **`toNdjson` (83.8 ms on wonderous)** — this is `canonicalEncode`, the *specification's* encoder,
  generated into both languages. It is the second-largest cost and I left it alone: changing it risks
  cross-language byte divergence, which is precisely the bug (ISSUE-17) that cost a milestone to fix.
- **`load` (52.2 ms)** — dominated by `JSON.parse` of 7.1 MiB. Inherent.
- **Catalog lookup** — 0.077 µs. **Plugin load** — 1.0 ms, once per run. Neither is a hot path.
- The four verification passes (N1–N4) each still take a full traversal. They could share one walk, but
  that would fuse independent passes and break the pass contract for a few milliseconds. Not worth it.

---

## 5. Developer tooling

`bridge` (`packages/cli`) — **nine commands, all read-only**: `inspect`, `graph`, `widget-tree`,
`route-graph`, `signal-graph`, `normalize`, `diagnostics`, `explain <node-id>`, `stats`.

**The rule: these tools never compute a compiler fact themselves.** `route-graph` *is* `navGraph()`,
`graph` *is* `referencesOf()`, and `bridge normalize` runs the real `PassManager` over the real
`normalizationPipeline()`. A test asserts its output is **byte-identical** to the compiler's own. A
debugger that computes its own answer will eventually disagree with the compiler, and on that day it will
send someone hunting a bug that does not exist.

That failure mode is not hypothetical — **this tool did it to me.** My first `explain` reported *"this
node's id is not the hash of its content — do not trust this document"* on a perfectly healthy
`ui.Component`. Declarations are symbol-addressed (`sha256('d:' + symbol)`), and the symbol is a source
coordinate that **is not carried in the document**. The tool was structurally incapable of verifying it and
said "corrupt" instead of "cannot check". It now distinguishes the two, and a test pins the behaviour.

Establishing that fact produced the strongest evidence in this report: recomputing every id across the
corpus, **all 37,449 nested nodes' ids equal the hash of their canonical content — zero mismatches.**

Exit codes: `0` fine, `1` errors found, `2` bad command, `3` unfit input (INV-5). `2` and `3` are not the
same thing: a script may retry a `2`; a `3` will never work.

Compilation behaviour is unchanged. No command mutates a document in place.

---

## 6. Documentation

- **`docs/architecture/compiler.md`** — **new, and the largest gap closed.** There was no compiler
  architecture document at all. Covers: the boundaries, document loading and refusal, canonical form,
  two-tier NodeId generation, the pipeline and pass order, the pass contract, the pass manager, the one
  tree rewrite, plugins and the catalog, the full determinism table, the diagnostic lifecycle, measured
  performance, tooling.
- **`docs/tooling/bridge-cli.md`** — new. The nine commands, the flags, the exit codes, and what `explain`
  will *not* claim.

Every mechanical claim in both was re-verified against the implementation. Two were wrong and were
corrected: the catalog has **59** widgets (not 60), and framework names *do* appear in compiler comments
(just not in code).

---

## 7. Test audit

**182 TypeScript + 180 analyzer + 28 `bridge_uir`.** Compiler: 105 → **115**.

### Added, because the hardening pass exposed contracts nothing was guarding

- **`tree.test.ts` (9)** — the same-object identity contract; bottom-up ordering; splice and drop; and
  that **`prune` never descends**. That last one is a regression test for a bug I introduced and caught.
- **N7: "says nothing about the nodes inside a branch it deletes"** — the same contract, at the pass level.
- **Analyzer: "every tree node in the emitted document is content-addressed (ADR-17)"** — recomputes every
  nested id from scratch against a real extracted Flutter app. `builder/validation.dart` already checked
  id *injectivity* (one id never denotes two contents — a collision check); it did **not** check the
  derivation, and so would not catch a builder that minted ids some other way entirely.
- **CLI (14)** — including the byte-identity contract and the symbol-addressed-declaration case.

### Fixed: CI was not type-checking the test suite

`just ci` ran `build` (which type-checks `src` only) but **never ran `typecheck`**. Four type errors had
accumulated in test files, invisible. All fixed; **`typecheck` is now a CI gate.**

---

## 8. Readiness

### Architecture — sound

The boundaries hold, and they hold *mechanically*: dependency-cruiser, a negative test, the analyzer's own
`dependency_rules_test.dart`, and `codegen-check` all enforce them in CI. The compiler does not know what
Flutter is; the analyzer does not know what normalization is; framework metadata is authored once.

### Known limitations

1. **N11 promotes nothing on the corpus** — extraction emits `app.Route` *declarations* but not
   `app.RouteTransition` *call sites* (`Navigator.push`, `context.go`). The nav-graph therefore has nodes
   and no edges. **This is an analyzer gap, not a compiler one**, and it carries an unresolved design
   question: `RouteTransition.target` is a `NodeId`, but for
   `Navigator.push(MaterialPageRoute(builder: (_) => Screen(...)))` the destination is an *inline
   component*, not a declared route. Pointing `target` at the component is a reading of the frozen schema
   that needs a ruling. **`bridge route-graph` says this out loud rather than drawing an empty graph.**
2. **N10 derives nothing on the corpus** — none of the three apps uses `ColorScheme.fromSeed`. Correct
   behaviour, not a gap.
3. **`logic.Index` does not exist** (ISSUE-15, approved for a future amendment, not implemented).
4. **`bind.Const(null)` is unrepresentable** (ISSUE-14) — canonical JSON omits nulls, and `bind.Const.value`
   is required. The workaround (`bind.Expr(logic.Lit)`) is why N6 refuses to fold a null literal.

### Technical debt

- **The repository has no git history.** `master` has zero commits; everything is untracked. This blocked a
  diff-based baseline for the whole hardening pass — I had to build a golden-output harness to prove the
  refactors were behaviour-preserving. **This is the most urgent item in this report**, and it is not a
  code problem.
- The corpus harness lives in a scratch directory, not the repo. `just corpus` is still a stub (M4-T6).
- The `analyze | build | verify` production CLI surface remains a stub (M2-T21). Only the debug surface
  exists.

### Prerequisites the generator will need

- **`app.RouteTransition` extraction** (limitation 1) — without it, a generator cannot emit navigation, and
  N11 cannot promote cross-route state.
- **A ruling on `RouteTransition.target`** for inline components.
- Generators must consume `NormalizationManifest` to know which passes changed the program, and must treat
  any `error`-severity diagnostic as disqualifying: a program with an error is **not fit to generate from**,
  because something would have to be invented.

### Assessment

**The compiler is production-ready for its scope: it normalizes.** It is deterministic (proven, not
asserted), idempotent, a fixed point on all three corpus applications, and it produces **zero errors** on
every one of them. Its architecture is enforced mechanically rather than by convention. It refuses what it
cannot do rather than guessing — which is the property that matters most, because a compiler that guesses
is one that is quietly wrong, and quietly wrong is the only failure this project cannot absorb.

The gating work before M3 is **in the analyzer, not the compiler**: route transitions.
