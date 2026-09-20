# M11-I — Completion audit (plan `flutterbridge_plan.md`)

**M11-I is reclassified.** No document in this repository describes M11-I; the only description of it was in
conversation, as an implementation of persistent build-local state. ADR-0048 closed that question: a
build-local has no lifetime under the compiler's contract, so `BRG1311` is the boundary and nothing persistent
is implemented. M11-I is therefore the **completion audit**: reconcile the repository against the master plan,
find real defects by probing rather than assuming, fix each completely, and record what remains.

Labels: **[observed]** a live probe or run, **[runtime-executed]** real React/runtime run, **[analyzer-proven]**
the real analyzer's UIR, **[test-proven]** an automated test, **[derived]** reasoning only, **[not tested]**.

## Ledger

| Area | Status | Evidence | Commit |
|---|---|---|---|
| Repository reconciliation | DONE | HEAD == origin/main == `616aad0` at start; only `hello_bridge/analysis_options.yaml` dirty | — |
| M11-H closure | DONE, not reopened | no analyzer/schema/generator/runtime change since M11-G (`git diff b4c0d96..616aad0`: 2 docs) | — |
| ADR-0048 verification | DONE | consistent with M11-H; two claims corrected (see §D1) | this doc |
| Build-level write diagnostic (C1) | DONE | root cause was a generator field-name bug, not a missing analyzer check | `44d7d8f` |
| `BRG1311` explanation (C2) | DONE | text + hint state ADR-0048; code/severity/behaviour unchanged | `2551d2f` |
| `ListView.builder` silent drop (D1) | DONE — three defects + one tooling defect | §D1 | `2c41179` `8dbc336` `96c5fbc` |
| State collection mutation (E) | PENDING | — | — |
| Analyzer / UIR / generator / runtime audits | PENDING | — | — |
| Determinism, negative/mutation testing | PENDING | — | — |
| `rsc-split`, security, performance | PENDING | — | — |
| Documentation/ADR, full CI, ecosystem audit, completion gate | PENDING | — | — |

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

## Tests at this point

Dart 608 (was 601), gen-react 608 (was 589), CLI 48 (was 42), all run alone with exit codes captured. One
environmental note: `hello_bridge/.dart_tool` disappeared during the session, silently skipping 3 fixture tests
(`Skip: … no package_config.json`); restoring it with `flutter pub get` also rewrote the tracked
`pubspec.lock`, which was reverted. The cause of the disappearance was not identified **[not tested]**.
