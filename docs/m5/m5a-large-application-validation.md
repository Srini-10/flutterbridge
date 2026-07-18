# M5-A — Large application validation and production hardening

**Status: complete for measurement and hardening; browser E2E not reached, and §8 says exactly why.**

Two real, unmodified production applications were run through the whole pipeline for the first time. **Five
defects were found and fixed, every one of them invisible at fixture scale**, and the analyzer went from
refusing the larger application outright to accepting it cleanly.

| | Before M5-A | After |
| --- | --- | --- |
| **Continuum** (mac app, 2 228 LOC) — analyzer | 0 errors | 0 errors |
| **Continuum** — generator | **42 errors** | **23 errors** |
| **unichat** (113 files, 47 796 LOC) — analyzer | **501 errors — run refused** | **0 errors** |
| **unichat** — generator | *unreachable* | 1 929 errors, all classified |

CI green: 207 analyzer tests + `dart analyze` clean, 28 `bridge_uir`, 22/22 TS test tasks (378 runtime, 117
generator, 126 compiler), 18/18 typecheck, `codegen:check` OK, `lint:stubs` OK.

---

## 1. The applications

The brief prefers Continuum. Continuum is present, and its Flutter surface is genuinely small — a 7-file,
2 228-line macOS app over a 1 132-line `ui-kit`. So a second application was measured alongside it, because
the objective is scale rather than a particular repository:

| App | Files | LOC | Provenance |
| --- | --- | --- | --- |
| `hello_bridge` | 7 | 369 | this repository's own fixture — the largest thing the pipeline had ever run on |
| **Continuum** (`apps/macos/mac`) | 7 | 2 228 | real, unmodified, not written for this compiler |
| **unichat** (`mobile`) | 113 | **47 796** | real, unmodified — larger by LOC than `wonderous` (30 655), the biggest app the M0 corpus scan measured |

Neither was modified in any way. Everything below is from running the shipped pipeline against them.

## 2. The five defects, each found only at scale

### D1 — colour recognition was by name, not by supertype *(analyzer)*

Continuum declares `ColorScheme.fromSeed(seedColor: Colors.deepPurple)` and the analyzer emitted **zero
`app.Token` nodes**. N10 therefore derived no palette, and **19 of Continuum's 42 generator errors — 45% —
were `BRG3010`** for roles the program had in fact asked for.

`_colourOf` tested `value.type?.element?.name != 'Color'`. `Colors.deepPurple` is a **`MaterialColor`**,
which extends `ColorSwatch<int>` (`material/colors.dart:104`) which extends `Color`
(`painting/colors.dart:410`). Every swatch in Flutter's palette — `blue`, `red`, `teal`, `deepPurple` —
failed the test.

This was the **last name-based type test in the adapter**, and C1's evidence is precisely about what one
costs. Fixed to test the resolved supertype chain.

The build proof never caught it because its seed is `Color(0xFF6750A4)` and its named colours are
`Colors.white` and `Colors.black12` — which genuinely *are* `Color`s rather than swatches.

### D2 — `getField` does not see inherited fields *(analyzer)*

Fixing D1 was not enough: the type test then passed and the **read** returned nothing. The Dart constant
model represents a subclass constant as its own fields plus a synthetic `(super)` object, so a
`MaterialColor`'s channels live two levels up:

```text
MaterialColor  →  (super) ColorSwatch<int>  →  (super) Color   ← the channels are here
```

Established by probe, not by inference: `getField('value')` on `Colors.deepPurple` is `null`, and
`getField('(super)').getField('(super)').getField('value')` is `4284955319`. Both readers — the theme
adapter's and M4-E's colour hoisting — now walk the chain. The seed resolves to `#FF673AB7`.

### D3 — token symbols collided across files *(analyzer)* — **496 errors**

`Symbols.token` is the one symbol constructor deliberately *not* file-scoped, and says so:

> A design token. **Not** file-scoped: a token is a property of the application, and the same token declared
> in two places is the same token.

The emission did not match the design. A `TokenExtractor` is built and flushed **per file**, so every file
that hoisted the same literal colour emitted its own `app.Token` under the same symbol — and
`ReferenceResolver.declare` correctly reported `BRG1202`, because two declarations sharing a symbol would
silently merge.

At 113 files this produced **496 errors** (`token:color.colorFFFFFFFF` declared by every file mentioning
white) and the run was **refused outright**. At 7 files it cannot happen.

Fixed at the session boundary — the one place that sees every file — by dropping repeat declarations of
application-scoped symbols. First in the project's fixed order wins, so the surviving span is deterministic.
The diagnostic was not weakened: a genuine collision between two *different* declarations still reports.

### D4 — anchors were not file-qualified *(analyzer)* — **5 errors**

`BRG1205`: *"Two nodes claim the anchor `_EmptyState`"*, and four more like it — `_SideToolbar`,
`_SectionHeader`, `_SendButton`, `_InitialAvatar`.

Every one is a pair of **private helper widgets in different files**, which is ordinary Dart: a leading
underscore makes a class private *to its library*, so two screens each declaring `_EmptyState` is two
correctly-named classes.

The schema has always specified the format, and the implementation did not follow it:

> A human-stable path to a node, e.g. **`lib/screens/checkout.dart#CheckoutScreen/build/Column[0]`**

The diagnostic was right — an anchor is the key an override is stored under and must name one node — and the
anchor was wrong. Root anchors now carry their file, taken from the span the record already holds rather than
threaded through as a second copy of the same fact.

### D5 — a diagnostic printed the analyzer's own class names *(diagnostics)*

Real applications produced: *"A `AdjacentStringsImpl` has no UIR representation"* and *"A
`RethrowExpressionImpl` …"* — 29 occurrences across the two apps. That names a private class in a package the
user does not depend on, for constructs they wrote as `'a' 'b'` and `rethrow`.

`_describe`'s fallback was `node.runtimeType.toString()`. Every construct the two applications actually hit
is now named in Dart's own vocabulary, and the fallback strips the analyzer's `Impl` suffix so an unmet
construct degrades to something searchable rather than to something that looks like a leak.

## 3. What remains, by true owner

The brief asks for the owner of every failure. unichat's 1 929 generator errors are dominated by `BRG3006`
(1 298), and that is **not one defect** — reading the 10 207 untargeted references in its normalized UIR
separates them into six owners:

| Class | Count | Owner | Status |
| --- | --- | --- | --- |
| Lambda/catch/local names (`data`, `e`, `c`, `message`, …) | ~1 500 | *none* — resolved by `paramInScope` | not a defect |
| **Framework primitives** — `context` 336, `widget` 186, `mounted` 175, `notifyListeners` 120, `super` 109, `this` 64 | **~990** | **analyzer (INV-22)** | documented since M4-H |
| **Non-reactive fields** — `_socket` 170, `prefs` 118 | **~290** | **analyzer** | documented since M4-I |
| Dart SDK functions — `debugPrint` 297, `unawaited` 70 | ~370 | generator | **new** |
| `FontWeight.w600` and kin | ~56 | runtime kit (no `FontWeight` value type) | **new** |
| `Navigator.of` | 53 | schema — [ADR-0024](../adr/0024-performing-a-navigation.md) | documented |

The other error classes: `BRG3004` ×187 (opaque Dart constructs — switch expressions, cascades, records,
is-checks; **analyzer**), `BRG3002` ×224, `BRG3013` ×45 (gesture model, overlays), `BRG3010` ×72 (theme roles
in files with no `ColorScheme`), `BRG3008` ×17 (ADR-0024).

Two further gaps were fixed because they were cheap and general, not because one app hit them:
**`FilledButton` had no mapping at all** (M3's default emphasis button), and **`.icon` was not declared as a
slot** on any of the four button types — `TextButton.icon` produced `BRG2112`, meaning the icon would have
been silently dropped.

## 4. Language constructs the analyzer does not model

Ranked by real-world frequency, which is new information — the previous ranking was by guess:

| Construct | unichat | Continuum |
| --- | --- | --- |
| `is` check | 131 | 1 |
| collection element in a map/set literal | 89 | 1 |
| record | 46 | 0 |
| collection-`if` (non-widget) | 31 | 1 |
| cascade | 27 | 1 |
| adjacent string literals | 25 | 5 |
| `switch` expression | 8 | 3 |
| `throw` expression | 8 | 0 |
| index **write** (`m[k] = v`) | 8 | 0 |
| `rethrow` | 4 | 0 |

`is` checks lead by a wide margin and are cheap — `logic.Binary` with an `is` operator, or a dedicated node.
Records are the largest genuinely new modelling problem.

## 5. Performance — measured, and deliberately not optimized

| Stage | hello_bridge (369 LOC) | Continuum (2 228) | unichat (47 796) |
| --- | --- | --- | --- |
| Analyzer, wall clock (`dart run`) | 8.9 s | 10.2 s | 28.6 s |
| Nodes produced | 36 | 134 | 1 456 |
| `bridge normalize` | 0.08 s | 0.10 s | **0.63 s** |
| Generator | ~9 ms | 9.3 ms | **53 ms** |

**Scaling is linear and there is no bottleneck to optimize.** Subtracting the ~8.7 s fixed cost that
`hello_bridge` establishes, marginal analysis is 0.42–0.67 ms per line; normalization and generation are
sub-second on 1 456 nodes.

The fixed 8.7 s is **`dart run` compiling the analyzer**, not analysis — an AOT `dart compile exe` binary was
built to confirm, and could not run the analyzer package (`rc=255`), so the number is reported with its
caveat rather than adjusted. Removing it is a packaging change (a JIT snapshot or a persistent process), not
a compiler optimization, and the brief's rule — *only optimize measured bottlenecks* — says to leave the
compiler alone. Nothing was optimized.

## 6. Determinism and fixed point, on the real applications

Run on both applications in isolated directories, not just on the fixture:

```
continuum-mac   determinism: OK   fixed point: OK   a74a605fb21a2abc4c0978ece959cc4068841d7176e7b08affa5a2c467c58776
unichat         determinism: OK   fixed point: OK   0dcccca1442261ed6bb4eeaec0252ba1451161d09e3125db03565d78ce0070a4
```

A first attempt reported `fixedpoint=FAIL` on both. It was **my harness, not the compiler**: re-normalizing
in place put the analyzer's `.manifest.json` beside a document it did not describe, and the loader's
truncation check correctly refused it. Re-run in clean directories, both hold. Worth recording because the
failure looked exactly like a real one.

The build proof's own chain is unchanged and green: three independent `normalize` runs and the fixed point
all at `4a1eba68…`, analyzer golden `8f92199a…`.

## 7. Diagnostic audit

- **Correctness** — D5 fixed: no diagnostic prints an analyzer implementation class name.
- **Ownership** — `BRG2110`'s message said *"The frontend must emit them as children"*. M4-G established that
  was wrong (the **catalog** was missing, and extraction's fallback was behaving correctly), and M5-A
  corrects the message to say so and to name the fix. Every other diagnostic sampled from the two runs names
  a capability and an owning subsystem.
- **Deterministic ordering** — two runs of each application produced identical diagnostic sequences.
- **Frontend neutrality** — the compiler's diagnostics (`BRG2xxx`) name no Flutter widget except by quoting
  the program's own text. `BRG2112`'s report of `TextButton.icon` is the catalog answering, not the pass.
- **Actionable guidance** — the one gap: `BRG3010` tells an author to add `ColorScheme.fromSeed`, which for
  unichat is right, but 72 of them fire because a *widget file* has no theme while the app root does. The
  message should distinguish "this program declares no palette" from "this file is not the one that does".
  Not fixed; recorded.

## 8. Browser E2E — not reached, and why that is the finding

The brief asks for browser build, hydration, routing and console-error checks. **Neither application emits a
project yet**: Continuum reports 23 generator errors and unichat 1 929, and the pipeline refuses to emit from
a program carrying an error — deliberately, because a partial project *"would compile around the holes and
fail where they are"*.

So the blocker is not missing test infrastructure. There is nothing to load in a browser until §3's owners
are addressed. Building a Playwright suite against the build-proof fixture instead would test the fixture,
which `build.test.ts` already does through `tsc` against the unmocked kit — it would add a browser, not a
subject.

The honest sequencing is: close §3's top two owners, get one real application emitting, and *then* the
browser suite has something to assert about. That is M5-B's first task and §10 says so.

## 9. Production readiness

M5-A changes the assessment in one specific way, and it is not the widget surface.

Before this milestone the compiler had never been run on an application it was not written alongside. Two
attempts produced **five defects that fixture-scale testing structurally could not find** — three of them
(D2, D3, D4) impossible in a program with fewer than two files that share a colour or a private widget name.
Corpus coverage is 56.8%, unchanged by M5-A, because M5-A added no widgets: it made the compiler survive
contact with real code.

What a real application still cannot do is **emit**. The gap is no longer breadth of widget support — it is
a small number of high-frequency language and framework constructs: framework primitives INV-22 should erase
(~990 references in one app), non-reactive fields (~290), `is` checks (131), and `debugPrint` (297). None of
these is a widget, and none was visible from the corpus scan, which counted widget instantiations.

## 10. Recommendation for M5-B

In this order, by measured frequency and by cost:

1. **Erase the framework primitives INV-22 already forbids** — `context`, `widget`, `mounted`, `super`,
   `this`, `notifyListeners`. ~990 references in one application and the largest single class. The invariant
   is already written; the adapter is where it is enforced.
2. **Emit non-reactive fields** — ~290 references. A `final` field nothing mutates currently produces no node
   at all, so every reference to it dangles.
3. **Model `is` checks and adjacent strings** — 131 and 25 uses, both cheap. `a is T` is a `logic.Binary`;
   adjacent strings are compile-time concatenation and fold to a literal.
4. **Then, and only then, the browser suite** — with one real application emitting, §8's blocker is gone and
   hydration, routing and console errors become assertable.
5. **[ADR-0024](../adr/0024-performing-a-navigation.md)** remains the largest single decision, unchanged.

Records (46 uses) are the one genuinely new modelling problem and deserve their own analysis rather than
being bundled into (3).
