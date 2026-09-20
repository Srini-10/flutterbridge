# M11-I — Completion audit (plan `flutterbridge_plan.md`)

**M11-I is reclassified.** No document in this repository describes M11-I; the only description of it was in
conversation, as an implementation of persistent build-local state. ADR-0048 closed that question: a
build-local has no lifetime under the compiler's contract, so `BRG1311` is the boundary and nothing persistent
is implemented. M11-I is therefore the **completion audit**: reconcile the repository against the master plan,
find real defects by probing rather than assuming, fix each completely, and record what remains.

Labels: **[observed]** a live probe or run, **[runtime-executed]** real React/runtime run, **[analyzer-proven]**
the real analyzer's UIR, **[test-proven]** an automated test, **[derived]** reasoning only, **[not tested]**.

## Ledger

| Area | Status | Evidence | Commits |
|---|---|---|---|
| Repository reconciliation | DONE | HEAD == origin/main == `616aad0` at start; only `hello_bridge/analysis_options.yaml` dirty | — |
| M11-H closure | DONE, not reopened | no analyzer/schema/generator/runtime change since M11-G | — |
| ADR-0048 verification | DONE | consistent; follow-ups resolved; M11-H attribution corrected | `d3ca8bb` |
| Build-level write diagnostic (C1) | DONE | root cause was a generator field-name bug | `44d7d8f` |
| `BRG1311` explanation (C2) | DONE | text + hint state ADR-0048; behaviour unchanged | `2551d2f` |
| `ListView.builder` silent drop (D1) | DONE — 3 defects + 1 tooling | §D1; executed | `2c41179` `8dbc336` `96c5fbc` |
| State scalar / collection / `dart:core` (E) | DONE with documented limits | 54 + 12 cases vs real Dart; ADR-0049 | `8f72e0b` `2f8a547` `b3881d1` |
| Lifecycle (E) | DONE (refused) | M8-Q §7 finally closed | `f3c38b2` |
| Analyzer / UIR audit (F) | DONE, sampled not exhaustive | goldens, identity, ADR-0017, ADR-0038 amendment | `3fa381e` |
| Generator audit (G) | DONE | no-routes router; child-position emission | `14fae19` `8dbc336` |
| Runtime audit (H) | DONE | 416 tests; e2e 57 in Chromium | — |
| Determinism (I) | DONE | 5 apps × 3 runs byte-identical, rerun on final code | — |
| Negative / mutation testing (J) | DONE | every fix mutated; one inert mutant reported | all |
| `rsc-split` audit (K) | DONE, unchanged | deferred `BRIDGE-STUB(M3)` | — |
| Security / robustness (L) | DONE | §L | `07b28ce` |
| Performance (M) | DONE | §M, measured | — |
| Documentation / ADR (N) | DONE | §N; ADR-0049 new | docs commit |
| Full CI (O) | DONE | `just ci` exit 0 on final code | — |
| Ecosystem audit (P) | DONE | §P | docs commit |
| Completion gate (Q) | COMPLETE WITH DOCUMENTED LIMITATIONS | §Completion gate | — |

## Baseline (A, B)

- `git rev-parse HEAD origin/main` → `616aad0…` both. Worktree: `M fixtures/apps/hello_bridge/analysis_options.yaml`
  (unrelated, preserved, never staged).
- `just ci` on the untouched checkout: **exit 0**. Dart 601 + `bridge_uir` 28; every TypeScript package green
  (gen-react 65 files / 589 tests, runtime-react 17 files, compiler 10, cli 3, …). Worktree unchanged by the run.
  `just determinism` and `just e2e` are **not** part of `just ci` and were not run at baseline.
- `BRG1311`: defined once (`codes.dart`), reported once (`expression_extractor.dart` `_target`), 4 refusal tests
  plus the M11-G group pass. UIR schema untouched since M11-E.

## C — Diagnostics and refusal quality

**Finding C1 — `BRG3004` said `<unknown>` for every opaque node.** Layer: generator. Input: any construct the
analyzer leaves opaque (`var count = 0; count++; return Text('$count');` was the reported case). Expected: the
construct and the reason. Observed **[observed]**: "`<unknown>` has no UIR representation …". Root cause
**[analyzer-proven]**: the three refusal sites read `node['source']`; `ui.Opaque`, `logic.OpaqueExpr` and
`logic.OpaqueStmt` carry `dartSource` and `reason` (`l1.json`, `l2.json`). The one existing test hand-wrote a node
with the same wrong field, so it agreed with the bug. Fix: `opaqueDetailOf` reads the schema's fields; message
now carries the first source line and "The frontend's reason: …". Regression **[test-proven]**:
`opaque_refusal_build.test.ts` over a real analyzer document (`fixtures/apps/opaque_refusal`, one component
per opaque kind); restoring the wrong field fails 4 tests.

**Decision on where a build-level write is refused.** The plan asks for the earliest correct layer. A write
*inside a callback* is already refused in the analyzer (`BRG1311`). A straight-line write inside one `build()`
is a different thing: it never crosses the boundary ADR-0048 D4 describes (no callback observes it across
builds), so an analyzer `BRG1311` there would misstate the contract — `var total = 0; for (…) total += x;` is
legitimate Flutter that is merely an unsupported statement shape. It stays `ui.Opaque` and is refused by the
generator, now with an actionable message. The reason string `build body with statements` is a census label
(M8 docs) and was not changed. **[spec-decision]** consistent with ADR-0048.

**Finding C2 — `BRG1311` gave no rationale.** Fix: explanation cites ADR-0048 and the two supported
alternatives; the report carries a `hint`. Tests pin the hint and the explanation; removing the hint fails one.
Behaviour of the refusal is unchanged.

## D1 — Builders and child emission

M11-H recorded "a block-bodied `itemBuilder` emits `<ListView />` with no diagnostic". **The attribution was
wrong.** Probing every shape the plan lists **[analyzer-proven]**:

| Shape | UIR | Result before |
|---|---|---|
| `(c, i) => Text(items[i])` | `ui.List` | expanded |
| `{ return Text(items[i]); }` (block body) | `ui.List` | expanded — block form is **not** the discriminator |
| `{ final t = items[i]; return Text(t); }` | `ui.List` with `ui.Opaque` template | `BRG3004` |
| conditional return; `itemCount: 3` with no collection; nested builder; unsupported item widget; `ListView.separated` | unexpanded `ListView.builder` element | closure **dropped**, `<ListView />`, build succeeded |

The discriminator is whether the index walks one collection (`_lazyList`'s three-part proof). Investigation
found three defects and one tooling defect, all silent:

1. **Dead refusal (generator).** `_lazyList`'s own comment says an unproved builder "extracts as an ordinary
   element … the generator refuses by name". The refusal was a constructor-qualified entry in
   `MISSING_CAPABILITIES`, consulted only when the widget has **no** mapping — and `ListView`, `GridView` and
   `PageView` all have one, so `ListView.separated` and `PageView.builder` entries were dead, and the
   `ListView.builder`/`GridView.builder` entries had been removed at M4-H on the premise that all builders expand.
   The closure was then dropped as an "unmapped prop" (a warning). Fix: `qualifiedMissingCapabilityOf` is
   consulted before the mapping; the two entries are back. Now `BRG3001`, error.
2. **`ui.List`/`ui.Cond` emission convention (generator).** `ui.List` returned child-position text (`{…}`),
   `ui.Cond` a bare ternary. So a list in a slot was `child={{…}}` — invalid TSX — for the canonical
   `Expanded(child: ListView.builder(...))` **[observed]**; and a collection-`if` between a `Column`'s tags was
   emitted as bare text `_flag$ ? <Text/> : null`, which `tsc` accepts and the page renders literally
   **[observed]** (old behaviour reproduced by neutralizing the fix, then restored). `emitUiNode` now returns an
   expression always; `jsxChild` is the single place that wraps for child position.
3. **Container discarded (analyzer).** A *proved* builder returned the bare `ui.List` **in place of the
   widget**. `scrollDirection`, `padding`, `shrinkWrap`, `reverse` and the scroll container vanished with no
   diagnostic at any layer **[analyzer-proven]** — `examples/counter` declares `shrinkWrap: true` on its
   builder and lost it **[observed]**. The proved case is now `ListView(children: [ui.List])` with the builder
   and count props consumed and no constructor name; the list has its own anchor segment (`builder`).
4. **`bridge build` hid warnings from successful stages (CLI).** `finish()` printed only the last line of an ok
   stage's detail and nothing for `analyze`, so the `BRG3001` "is dropped" warning was invisible although
   `bridge generate` printed it **[observed]**. Ok stages now print every line; `analyze` prints its warning
   count and where to read the rest. `--json` unchanged.

Tests **[test-proven]**: `builder_refusal_build.test.ts` (6 unexpanded shapes refused with the right
constructor named; positive control — expression-, block- and grid-indexed builders — emits no error, keeps the
container and all four props, and passes real `tsc --strict`); `jsx_child_positions_build.test.ts`;
5 analyzer tests (`a lazy builder keeps its container`); `build_output.test.ts` (6). **Mutations** (each must
fail): keep builder props, keep `constructorName`, drop the `ui.List` child → 2, 2, 5 analyzer failures;
neutralize `jsxChild` → 6 generator failures; restore last-line output → 2 CLI failures.

Goldens regenerated from source: `layout_proof` (its own build-proof test) and the `counter` set — which was
already stale for M11-E's `namedArgOrder`/`WidgetRef.target`. Four new fixtures: `opaque_refusal`,
`builder_refusal`, `builder_expansion`, `jsx_child_positions`.

**Incidental, not yet acted on:** a `final` State-field collection read as a `ui.List` source
(`final List<String> _items = <String>[…]` in a `State`) reports `BRG3006` "`_items` is not declared" — an
error, so not silent; noted for Phase F. An initialized `final` field on a `StatelessWidget` becomes an
optional `unknown` prop (`props._items`), which is undefined at runtime — noted for Phase F.

## E — State, mutation and `dart:core` value semantics

A driver (scratch, not committed) took a Dart source through the **real analyzer, real generator, strict `tsc`,
and a jsdom mount on the real `@bridge/runtime-react`**, clicked, and compared the DOM text with what Dart prints.
54 State cases + 20 string-literal + 34 identifier cases. Recorded fully in ADR-0049.

**E1 scalar State — 12 of 16 correct [runtime-executed].** The four that are not: a write *without* `setState`
re-renders (the ADR-0048 D3 deviation, expected); a `double` prints `1` for `1.0` (×2, a defect, fixed); an
uninitialised `int?` field fails strict `tsc` (`signal(undefined)` is typed `undefined`; documented, ADR-0049 D4).

**E2 collections — none works, by design of an unmade decision.** Every Dart collection method either fails in
`tsc` or is refused. Not silent, but at the wrong layer; now refused by name (below). *Mutating a State-held
collection needs a rule for how it notifies (copy-on-write breaks aliasing; mutate-then-notify needs an
amendment to ADR-20 R3) — a new semantic contract, recorded as undecided in ADR-0049 D4.*

**Silent-wrong findings, each reproduced against real Dart and fixed:**

| Finding | Layer | Fix | Evidence |
|---|---|---|---|
| `List.sort()` in `setState` compiles, runs, never updates the screen (in place; JS string order) | generator | refuse every non-allow-listed `List`/`Set`/`Map`/`Iterable` method by receiver type | `sdk_collection_semantics_build.test.ts` |
| `['a','b'].join()` → `a,b` (Dart `ab`); **pinned by a committed test** | generator | `join()` → `join('')` | executed: `ab`,`cd` = Dart |
| `'$d'` for `3.0` → `3` (Dart `3.0`) | generator + runtime | `doubleToString` (kit) | executed: `3.0→6.0→12.0` = Dart; 6 runtime tests pinned to observed Dart |
| `'$list'` → `10,9,1` (Dart `[10, 9, 1]`), `'$map'` → `[object Map]`; a committed fixture pinned it | generator | refuse List/Set/Map/Iterable/`num` interpolation | tests + fixture corrected |
| **`initState() { _n = 5; }` silently dropped** — `sig.Effect` has no lowering (M8-Q §7 recorded it, still open) | generator | refuse a lifecycle body with behaviour (`BRG3013`); spare `super.` calls and a framework `dispose()` | `lifecycle_effect_build.test.ts`; 4 mutations |
| a State field named `signal`/`useState`/`delay`/`props`/`arguments`/`eval` → self-referential or shadowing TS | generator | `identifierOf` renames; drift guard against the kit's 64 exports | executed: `0..2` for all seven |

`hello_bridge` (a documented refused corpus) *gained* named blockers rather than silently emitting invalid code:
`Set.contains/add/remove` and its `initState` body.

**String literals and identifiers.** 20 adversarial literals (quotes, backslash, `\$`, newline, tab, U+2028, NUL,
backtick, `${`, `</Text>`, braces, emoji, raw and multi-line strings) round-trip byte-exactly [runtime-executed].
26 of 34 identifier names were already correct (`delete`, `let`, `function`, `yield`, `static`, …); the 5 loud
failures are the fix above and 3 were invalid Dart in my own probe.

## F — Analyzer / UIR audit

- **Content-derived node ids [spec-decision].** The M11-H observation (two `Lit 7` from different declarations
  share an id) is intentional: ADR-0017 makes tree-node identity *content*, stripped of id/anchor/span — "two
  identical subtrees *are* one node" — with the anchor addressing the place. No change.
- **Two identity mechanisms, deliberately separate [analyzer-proven].** Declaration identity is `Element`-keyed
  (`_ordinalsOf`); reference/write resolution is the name-keyed lexical `Scope`. Seven scope-leak shapes gave one
  `BRG1311` each and no false negative (M11-H), so the pair is consistent for the tested set.
- **Golden freshness.** 24 of 51 committed goldens differed from a fresh regeneration. Every non-id difference was
  additive or documented (`WidgetRef.target`, `namedArgOrder`, `constructibleConstructors`, `isGetter`, and
  `hello_bridge`'s async `returnType`, ADR-0046) — staleness, not regression. 23 were regenerated. That exposed
  five tests asserting refusals the compiler no longer makes (they passed only because the stale golden lacked
  `isGetter`), and **an unsound argument in ADR-0038 §10**: dispatch-safety for a `Base`-typed receiver is not
  covered by the reason given. It is sound because a generated program cannot construct a subclass (`BRG3002`);
  recorded as an amendment and pinned by `subclass_construction_refusal_build.test.ts`, which fails if that
  refusal is ever lifted. Left as is: `hello_bridge` (schema v1.8, a refused corpus) and two path-dependency apps
  that need environment setup.

## G — Generator

- **No-routes program emitted a router that could not work.** The warning said "the generated router has none";
  the output had `{ routes: [] }`, which fails strict `tsc` (TS2741) and which `createRouter` rejects at startup
  (`BRG4004`). Making it an error breaks 38 tests in ten files (route-less programs are a supported mode), so the
  router is now not emitted. `no_routes_build.test.ts`.
- The `BRG3004`, builder-refusal, child-position and lifecycle findings are §C–§E.

## H — Runtime

Runtime suite 416 tests (was 410; +6 `doubleToString`). Existing tests already pin the trigger facts ADR-0048
relies on (equal write does not re-render; a batch renders once; a sibling reading another signal does not).
**Browser e2e: 57 passed** in real Chromium against freshly generated apps (counter, promoted-counter,
local-store, inline-push-props, async-push-guard, production and development builds, hydration and hook-order
checks), run *after* every change in this milestone. **[runtime-executed]**

## K — `rsc-split`

Inventory only. A named, never-started, `BRIDGE-STUB(M3)`-tagged pass; nothing implements or depends on it. The
generator marks every component `'use client'`, the correctness-safe direction (missed server rendering, never
wrong output). Audited, **intentionally unchanged**.

## J — Mutation testing

Mutations were run against every fix; each must fail a test. Killed / attempted: `BRG3004` field (4), analyzer
container (3/3), `jsxChild` (6), CLI last-line output (2), lifecycle (4/4), reserved names (3/3), SDK policy (3/4).
**One mutant survived** — making the collection policy name-based — because an eligible project-class call
returns through the ADR-0039 helper branch before the policy is reached, so it is inert for the control I had
built. I said so and rewrote that test to claim only what it proves (no over-reach), rather than leaving a control
that appeared to demonstrate type-keying. That property is the code's by construction (`sdkBaseTypeOf` reads the
receiver's `dart:core` type), not something a test here demonstrates.

## E (continued) — Numeric semantics

`SAFE_BINARY` listed `& | ^ << >>` as "meaning the same in both languages". Twelve cases against real Dart: five
wrong. JavaScript's bitwise/shift operators are 32-bit and Dart's `int` is 64-bit (`1 << 40` → `256` for
`1099511627776`; `0xFFFFFFFF & 0xFFFF0000` → `-65536` for `4294901760`; `1 << 31` negative; `4294967296 | 1` → `1`),
and `true & false` is `0` in JavaScript. Fixed (ADR-0049 D3a): two integer literals fold to Dart's exact 64-bit
result when it is a safe integer; `bool & | ^` lowers to `Boolean(Number(a) op Number(b))` (a plain `boolean & boolean`
is rejected by strict TypeScript, TS2447, which the tests caught); every other `int` operand and unary `~` is
refused by name. Executed: `1099511627776`, `4294901760`, `-4`, `false→true` ×2 = real Dart. Three mutations killed.
**Not changed, and stated:** `+ - *` on an `int` silently loses precision beyond 2^53
(`3037000499 * 3037000499` → `…000` for `…001`); an operator cannot be refused on a value it cannot see, and the
domain is ADR-5 D2's.

## L — Security and robustness

Probed as untrusted input **[observed]**:

| Input | Result |
|---|---|
| malformed Dart | clean `BRG1310`, no crash |
| 250 nested `Column`s | analyze/normalize/generate ok (131 KB emitted), strict `tsc` clean |
| 400 nested `Column`s | rejected by **Dart's own** analyzer (`stack_overflow`, reproduced by plain `dart analyze`), surfaced faithfully as `BRG1310` |
| 3000 sibling children; 300 State fields + 300 actions; a 1 MB string literal | all fine; normalize ≤ 40 ms, generate ≤ 29 ms |
| 20 adversarial string literals (quotes, `\`, `\$`, `${`, backtick, `</Text>`, braces, U+2028, NUL, emoji) | byte-exact round trip **[runtime-executed]** |
| identifiers `delete`, `let`, `function`, `yield`, `static`, `interface`, `await`, `undefined`, `Object`, `$x`, … | correct; the colliding ones are the §E fix |

The CLI reads only its own manifests and UIR documents and writes only generated files under the configured
output, with names sanitized by `fileNameOf` (no separators); the generator plugin has no `fs` imports
(`lint:deps`, ADR-8). Nothing program-content-driven reaches outside the project. Not investigated: hostile
`bridge.json` plugin paths (an in-process plugin is trusted by design, ADR-8).

## M — Performance (measured, nothing optimized)

Dominated by analyzer start-up, ~6.9 s on this machine (`just analyzer-binary` exists for ~3× faster start-up).
After it, normalize and generate cost tens of milliseconds even for a 3000-wide tree or 300 actions. No
optimization is justified by this evidence.

## N — Documentation

Corrected: `supported-widgets.md` and its generator (`tools/widget-support-doc.mjs`; the guide is generated, and a
first hand edit failed `codegen-check`) now list lifecycle bodies, collection methods, interpolation, unexpanded
builders, bit operators and `build()`-local writes; `troubleshooting.md`'s `BRG3004` section describes the new
message; the README's hard-coded "90 widgets" (91 by the generator's own count) no longer states a number;
`CLAUDE.md`'s "ADRs run to 0024" no longer states a number; ADR-0038 has a dated amendment, ADR-0048's follow-ups
are resolved, and M11-H's wrong `ListView.builder` attribution is corrected. New: ADR-0049. Milestone reports
(`docs/m8/…`) still say "`sig.Effect` … silent"; they are point-in-time records and were left as written — this
document and ADR-0049 are where it is now refused.

## Findings ledger (the plan's format, condensed)

| # | Finding | Layer | Label | Fixed in |
|---|---|---|---|---|
| 1 | `BRG3004` said `<unknown>` (wrong field name; a test pinned it) | generator | analyzer-proven | `44d7d8f` |
| 2 | `BRG1311` gave no rationale or hint | analyzer | observed | `2551d2f` |
| 3 | unexpanded builder: closure dropped, `<ListView />`, build succeeded (dead refusal) | generator | observed | `8dbc336` |
| 4 | `ui.List` in a slot → `child={{…}}`; collection-`if` as bare text `tsc` accepts | generator | runtime-executed | `8dbc336` |
| 5 | proved builder discards its `ListView` container and props (`shrinkWrap` lost in `examples/counter`) | analyzer | analyzer-proven | `2c41179` |
| 6 | `bridge build` hid every warning from a successful stage | CLI | observed | `96c5fbc` |
| 7 | `join()` → `a,b`, `'$d'` for `3.0` → `3`, `'$list'` → `1,2`; **`sort()` never updates the screen** | generator | runtime-executed | `8f72e0b` `2f8a547` |
| 8 | `initState() { _n = 5; }` silently dropped (`sig.Effect` never lowered, M8-Q §7) | generator | runtime-executed | `f3c38b2` |
| 9 | State field named `signal`/`useState`/`delay`/`props`/`arguments`/`eval` → self-referential/shadowing TS | generator | runtime-executed | `07b28ce` |
| 10 | 24 of 51 goldens stale; 5 tests asserting refusals the compiler no longer makes | tests | observed | `3fa381e` |
| 11 | ADR-0038 §10's dispatch-safety argument does not cover a `Base`-typed receiver | design | derived → observed | `3fa381e` (amendment + tripwire) |
| 12 | route-less program emits a router that fails `tsc` and throws `BRG4004` | generator | test-proven | `14fae19` |
| 13 | `1 << 40` → `256`, `0xFFFFFFFF & 0xFFFF0000` → `-65536`, `bool &` → `0` | generator | runtime-executed | `b3881d1` |
| 14 | two real-`tsc` tests on a 5 s default timeout flaked under parallel load | tests | observed | `95bb9fd` |

## P — Ecosystem audit

Evidence maturity is a 0–5 audit measure of *test/evidence*, not a quality ranking: 0 none, 1 theoretical, 2 one
test, 3 repeatable automated, 4 automated + integration/runtime, 5 also negative + determinism + release evidence.

| Area | Status | Evidence | Supported | Unsupported / refused | Score |
|---|---|---|---|---|---|
| Analyzer (resolved element model) | works | Dart 608 tests; real-analyzer fixtures | resolved types, scopes, declaration identity, callbacks | records, `is`, cascades, `Set` literals with elements (`BRG1302`/`BRG3004`); *not exhaustively audited* | 3 |
| Scope / write handling | works | 7 scope shapes + `BRG1311` tests | shadowing, closures, loop/catch/pattern vars | `build()`-local write refused | 4 |
| UIR / identity | works | goldens, ADR-0017, determinism | content-addressed ids | — | 4 |
| State (scalar) | works | 12/16 executed identical; deviations named | fields → signals, `setState` | write-without-`setState` re-renders (ADR-0048 D3) | 4 |
| State (collections) | **unsupported** | 22 cases | read, replace whole | in-place mutation: undecided (ADR-0049 D4) | 3 (of the refusal) |
| `dart:core` values | narrow, exact | executed vs Dart | `double` text, `join`, `indexOf`, constant folds, `bool` ops | every other collection method; `List`/`Map`/`num` interpolation; runtime `int` bit ops; **`int` > 2^53 arithmetic silently inexact** | 4 |
| Lifecycle | **refused** | fixtures, mutations | `super.` calls, framework `dispose()` | bodies with behaviour | 3 |
| Callbacks / actions | works | N5, runtime tests, e2e | inline handlers, params | — | 4 |
| Lists / builders | works | fixtures, `tsc`, e2e counter | expanding builders (container kept), `for`, `.map` | unproved builders, `separated`, `PageView.builder` | 4 |
| Conditional rendering | works | executed | collection-`if`, ternary | — | 4 |
| Composition | works | ADR-0047, `BRG3009` guard | project widgets by id | — | 3 |
| Stores | works | e2e local-store | `ChangeNotifier` → store | `Set` methods in `hello_bridge` | 4 |
| Navigation | partial | e2e | routes, push with props | imperative `Navigator.*`, overlays (`BRG3013`) | 4 |
| React generation / Next.js | works | 644 tests; e2e 57 in Chromium (prod + dev) | see guide | see guide | 4 |
| Runtime kit | works | 416 tests; e2e | signals, hooks, widgets | — | 4 |
| Diagnostics | improved | `BRG3004`, `BRG1311`, `BRG3013` messages | named, sourced | opaque render reason is a census label | 4 |
| Determinism | proven | `just determinism`, 5 apps × 3 runs | byte-identical | — | 5 |
| CLI / tooling | works | 48 tests; live runs | `bridge build` now shows warnings | `build` skips `tsc` without `npm install` (stated) | 3 |
| CI | works | `just ci`; `e2e`/`determinism` separate | — | not in `just ci`: e2e, determinism | 4 |
| `rsc-split` | deferred stub | inventory | all `'use client'` | server components | n/a |

**External, descriptive only.** Flutter rebuilds on every `setState` and identity-skips `const` widgets; the
generated React re-renders on a value-changing signal write and does not skip. Dart's `int` is 64-bit and
`double.toString` appends `.0`; JavaScript's number is one IEEE-754 type. These are the concrete differences this
audit found; no comparison of quality or speed is made.

**Refinement plan.**
*Required for correctness/completion:* none outstanding beyond the documented limitations below.
*Valuable hardening:* (1) decide the State-collection contract (ADR-0049 D4) — the largest unsupported area;
(2) decide lifecycle lowering; (3) an `int` domain rule for `+ - *` beyond 2^53 (ADR-5 D2); (4) audit the analyzer
across patterns/generics/extensions/records/`async*`, which this pass sampled but did not exhaust; (5) find why
`.dart_tool` directories disappear (below).
*Future enhancement:* `rsc-split`; a real Windows/Linux run; `String` method coverage.
*Speculative:* none started.

## Remaining intentional limitations

- State-held collections cannot be mutated in place; lifecycle bodies with behaviour are refused; imperative
  navigation, gestures, slivers, custom painting and explicit animation remain unsupported (README, guide).
- `int` arithmetic beyond 2^53 is silently inexact; `num` interpolation is refused.
- Uninitialised nullable fields (`int? _n;`) and empty collection initialisers (`= []`) fail strict `tsc`
  (`signal(undefined)` is typed `undefined`, `signal([])` is `never[]`) — loud, not silent (ADR-0049 D4).
- `hello_bridge` remains a documented refused corpus (multi-hop route forwarding, `FutureBuilder` branches,
  `Set` methods, `initState`); its raw golden is at UIR schema v1.8 and was not refreshed.
- `bridge build` skips `tsc` when the generated project's dependencies are not installed, and says so.

## Unexplained

`.dart_tool` directories (`fixtures/apps/hello_bridge`, `fixtures/apps/opaque_refusal`, `dart/bridge_uir`) disappeared
during the session, silently skipping 3 Dart tests and failing `uir-lint` with 324 errors until `dart pub get
--offline` restored them. No script in the repository deletes them by name and the cause was **not found**. It
is an environment fragility, not a defect this work introduced or fixed; the symptom is loud (skips print a
reason; `uir-lint` fails).

## Tests, baseline → final

| Suite | Baseline (`616aad0`) | Final |
|---|---|---|
| Dart `bridge_analyzer` | 601 | 608 |
| Dart `bridge_uir` | 28 | 28 |
| `gen-react` | 589 | 644 |
| `runtime-react` | 410 | 416 |
| `cli` | 42 | 48 |
| `compiler` | 159 | 159 |
| browser e2e (Chromium) | not run at baseline | 57 passed |
| determinism | not run at baseline | byte-identical, 5 apps × 3 runs |
| `just ci` | exit 0 | exit 0 |

New fixtures (all from real analyzer output): `opaque_refusal`, `builder_refusal`, `builder_expansion`,
`jsx_child_positions`, `sdk_lowering`, `sdk_collection_refusal`, `lifecycle_refusal`, `lifecycle_erasable`,
`reserved_identifiers`, `subclass_construction_refusal`, `int_bit_operators`, `int_bit_refusal`.

## Completion gate

**COMPLETE WITH DOCUMENTED LIMITATIONS**, for the plan's own definition: no *known* silent semantic loss in the
audited paths, refusals explicit and tested, the build-local contract documented and enforced, full suites, CI and
determinism green, and documentation matching the code. That is a statement about *audited* paths. The audit
sampled the analyzer and generator through real programs rather than exhausting the Dart language, and it found
fourteen defects — several of them silent and long-standing — which is evidence that unaudited paths may hold more.
It is **not** a claim that FlutterBridge compiles every Flutter program: the README states, correctly, that a large
production app does not yet compile end to end, and the limitations above are why.
