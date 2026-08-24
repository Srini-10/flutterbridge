# M9-E — Dialog actions, dismissal & result semantics

**Baseline:** `0fe298a` (M9-D, "feat(m9-d): support showDialog(builder: AlertDialog(...)) as an inline
route-overlay destination") == `0fe298a5921f3eefac322b3077fde2c12e35a186` == `origin/main`, verified fresh
via `git rev-parse`. Pre-existing, unrelated drift confirmed present and left untouched, never staged:
`fixtures/apps/hello_bridge/analysis_options.yaml`. No other unexpected change existed.

**Outcome: PASS — bounded implementation.** `AlertDialog.actions` is supported: each action's own
`onPressed` renders as an ordinary callback, and a `Navigator.pop(...)` reached from anywhere inside a
dialog's own subtree is provably dismissal of *that* dialog — proven structurally, at extraction time,
never by resolving which `BuildContext` was passed and never by name. Result *values* passed to `pop` are
supported only insofar as they are safely discarded; `await`ing or assigning `showDialog<T>(...)`'s own
return value remains refused, for a real, pre-existing, orthogonal reason this milestone found and
documented rather than fixed.

## 1. Exact premise, and the two claims investigated first

```dart
showDialog<T>(
  context: context,
  builder: (dialogContext) => AlertDialog(
    actions: [TextButton(onPressed: () => Navigator.pop(dialogContext, value), child: const Text('Close'))],
  ),
);
```

The stated question — can FlutterBridge prove `Navigator.pop(dialogContext, value)` dismisses *this*
dialog rather than popping the page? — rests on two separate claims, both checked against real evidence
before any architecture was chosen, both wrong as commonly assumed.

**Claim A — "distinguish by which `BuildContext` was passed."** Checked directly against the real
`BridgeAnalyzer`: a `showDialog(builder: (dialogContext) => ...)` closure's own parameter is never bound
into `Scope` at all. `MaterialRouteAdapter._returned()` reduces the closure to the expression it returns
*before* extraction ever sees its own `FormalParameterList` — the general closure-parameter-binding
mechanism (`ExpressionExtractor.lambda()`) is never invoked for a `builder:` callback. A read of
`dialogContext` inside `onPressed` produces `logic.Ref{name: 'dialogContext', type: BuildContext}` with no
`target` — structurally identical to a free identifier. This is the same category of gap ADR-28 §4 already
names ("parameter declaration-tier identity is deferred") and the M9-A/M9-C "itemParam" gap already flags
as out of scope for a single milestone — inventing an ad hoc, one-off identity mechanism for *this one*
closure's own parameter would be exactly the app/case-specific precedent this project's discipline refuses.
**Building identity-based context resolution is not this milestone's to do**, and turned out not to be
necessary (Claim B).

**Claim B — "an outer-context pop inside a dialog action pops the page, so treating it as dismissal is a
silent reinterpretation."** Checked with a real `flutter_test` widget test (not assumed — see §2): under the
*default* navigator configuration, `Navigator.pop(outerContext)` called from inside a dialog's own action
**dismisses the dialog**, not the page. `BuildContext → Navigator` resolution walks up the element tree to
the nearest `Navigator` ancestor; a dialog's own content is hosted in that same `Navigator`'s `Overlay`, and
the calling page's own context resolves to the identical `Navigator` (no nested one in between, the
common/default case). Both contexts name the *same* Navigator, and a pop always removes whichever route is
currently topmost — which, while the dialog is open and nothing else has navigated in between, is the
dialog, regardless of which `BuildContext` expression was written. **Which context variable is used does
not determine dismissal; it is a Flutter-semantics red herring for the default-configuration case.**

## 2. Real Flutter widget-test verification (not assumed)

Three `flutter_test` widgets tests, run against this repo's own real Flutter 3.47.0 SDK, in a throwaway
scratch package (deleted after evidence extraction, not part of this repo):

1. `Navigator.pop(outerContext)` from inside a dialog action → dialog dismissed, page still present with
   its own button intact. **Confirms Claim B.**
2. `Navigator.pop(dialogContext)` (the textbook idiom) → same result. Control.
3. A **second page pushed onto the same root Navigator while the dialog is still open** → the dialog is no
   longer the topmost/rendered route (`find.byType(AlertDialog)` → empty after the push). Confirms the one
   real way the "same Navigator, same topmost route" premise breaks: an *intervening navigation* between
   the dialog opening and the pop firing. Not a context-identity risk — a pre-existing, general property
   every ordinary, unmodified page-level `router.pop()` already carries (it too trusts the developer's
   control flow put the intended thing on top), not a new risk this milestone introduces.

## 3. The architecture — structural, not identity-based

`TransitionExtractor` gains a private, ambient field, `presentingTransition: String?` — the same
"settable before, reset after" idiom `enclosingComponent` already uses. Set to the transition's own symbol
for the exact duration of `_destination()`'s own `widgets.extract(widget, scope)` call for an inline
destination; restored (not unconditionally nulled — see §16) afterward. Because this is a plain field read
at extraction time, valid for the whole synchronous extent of one call regardless of nesting depth,
closures, or control flow, **every** `Navigator.pop`/`maybePop` found anywhere inside that one dialog's own
extracted subtree — whichever `BuildContext` is written, however deeply nested — is tagged, without gaps,
and without ever inspecting which context was passed.

`logic.Navigate` (schema, additive) gains `dismisses: NodeId` — the `app.RouteTransition` (with an
`inline` destination) this `pop` dismisses. Present only for `action: 'pop'`, only when extraction proved
the pop lexically inside that transition's own presentation.

Full decision recorded in `docs/adr/0025-amendment-dialog-dismissal-scope.md`.

## 4. Reduction ladder — results

| Rung | Shape | Result |
|---|---|---|
| E1 | One action, `Navigator.pop(dialogContext)` | Tagged `dismisses`, verified |
| E2 | `Navigator.pop(dialogContext, true)` | Tagged; the `true` never leaves the pop node (checked by exact key-set, not substring search) |
| E3 | `false` result | Same mechanism, not truthiness-special-cased — nothing about the *value* is ever inspected |
| E4 | Nullable result (`showDialog<String?>`, `pop(ctx, null)`) | Same — the extractor never reads the second argument at all, for any value |
| E5 | String result | Tagged; value dropped, same as E2 |
| E6 | Two actions (Cancel/Confirm), independent results | Both independently tagged, same transition |
| E7 | Action with no `Navigator.pop` | No `logic.Navigate` at all for that action — the dialog stays open by construction, no special-case code needed |
| E8 | Pop via the **outer** page context, from inside a dialog action | Tagged `dismisses` — proves the mechanism is structural, not identity-based |
| E9 | Nested `Builder` context | Not separately tested — `presentingTransition` is a plain field valid for the whole `widgets.extract` call regardless of intervening `Builder`/context layers; no code path distinguishes "wrapped in a Builder" from "not," so nothing to test differently |
| E10 | Renamed builder parameter (`modalScope`) | Tagged identically — no name coupling anywhere |
| E11 | Nested `showDialog` (a dialog action opens a second dialog) | Not modelled or tested; `presentingTransition` is save/restored (LIFO) rather than clobbered, so the outer dialog's own later pops are not silently mis-tagged if this is ever hit — a defensive fix, not a claim of nested-dialog support |
| E12 | `showDialog<void>` result ignored | The evidenced, fully-supported shape |
| E13 | `final result = await showDialog<bool>(...)` | Extracts with **no analyzer error** — the transition is minted but no `push` ever references it (a `VariableDeclaration` initializer is not one of the three statement shapes `logic.Navigate` covers, pre-existing, unrelated to this milestone). The dismiss pop *inside* that same dialog's actions still correctly tags it (proven), but no component ever reaches the transition via a push, so no ref is ever declared and the generator refuses the whole program honestly downstream (verified via a real `bridge build`, §18) |
| E14 | Result used in `if (await showDialog<bool>(...) == true)` | Not separately tested — same underlying gap as E13 (the navigation is not representable in expression position at all); not widened |
| E15 | Barrier dismissal (Escape/backdrop click) | Native `<dialog>` behavior, unaffected either way — no result is ever propagated in this milestone's scope regardless of dismissal cause |
| E16 | Unsupported (project-object) result type | Never reached — no result type is ever read or represented, so there is nothing to guess at |

## 5. Flutter semantics established

- `showDialog<T>` pushes a `DialogRoute<T>` via `Navigator.of(context, rootNavigator: useRootNavigator).push(...)` — `useRootNavigator` defaults to `true`.
- The builder's own context resolves to the same Navigator the route was pushed onto (its content is hosted in that Navigator's own `Overlay`).
- The calling page's own context resolves to the same Navigator too, absent a nested one — verified empirically (§2), not merely reasoned.
- `Navigator.pop(context, result)` finds the nearest enclosing Navigator from `context` and pops its topmost route, completing that route's own `Future` with `result` — regardless of which context reached that Navigator.
- `useRootNavigator: false` can select a *different* Navigator than the calling page resolves to, breaking the shared-Navigator premise — refused (§8).
- Barrier dismissal resolves the route's `Future` with `null` under real Flutter semantics — irrelevant here since no result is ever propagated regardless.

## 6. Architecture candidates considered

- **Option A (identity-based dialog-dismiss operation)** — rejected: requires the closure-parameter
  identity Claim A ruled out of scope.
- **Option B (scoped navigation capability, structural)** — **selected**. An ambient, ordinal-scoped marker
  set only for the duration of extracting one dialog's own subtree; no BuildContext resolution needed.
- **Option C (dialog action receives an explicit close function)** — effectively what the generator side
  already does (`dialogRef.current?.close()`), reached from the analyzer's own `dismisses` tag rather than
  from a runtime-visible closure parameter.
- **Option D (reinterpret the same `logic.Navigate(pop)` in generator scope)** — this is what happens
  today for a page-level pop; M9-E instead makes the *analyzer* decide and record the distinction
  explicitly (`dismisses`), so the generator never infers anything — it only reads a field.
- **Option E (runtime intercepts `router.pop()`)** — rejected outright, matches the prompt's own
  prohibition: the runtime never guesses based on "a dialog is currently open."
- **Option F (defer everything, keep the M9-D refusal)** — rejected once Claims A/B were resolved with
  real evidence; a bounded, sound subset was available.

## 7. ADR decision

New amendment written and implemented: `docs/adr/0025-amendment-dialog-dismissal-scope.md`. Amends the
M9-D amendment and ADR-0025 §A17.3. Covers: dialog/presentation ownership (§3, the ambient marker),
dismissal operation (`dismisses`), context identity (deliberately not used, §2), outer-route-pop
distinction (§2, resolved by Flutter semantics rather than by the compiler), nested presentation (§4,
"not decided," LIFO-safe by construction), barrier dismissal (§4, irrelevant to scope), result semantics
(§4, deliberately not transported), unsupported navigator configurations (`useRootNavigator`, refused, §8),
generator/runtime contract (§7 there, §11/§13 here), diagnostics, determinism, relationship to
`logic.Navigate`/`app.RouteTransition.inline` (both direct: the field lives on the former, names the
latter).

## 8. Implementation gate — 20/20 conditions, PASS

1. Refusal reproduced (M9-D's own `checkCapabilities` guard, confirmed present at baseline). 2. `Navigator.
pop` extraction reproduced (§ investigation: bare, unconditional, argument never read). 3. Builder-context
identity is **not** what the implementation depends on (Claim A resolved by *not needing it*, §1/§3). 4.
Dialog-local pop distinguished from page pop — structurally, via `presentingTransition`, proven (§9). 5.
Distinction survives normalization — confirmed: N5 uses no per-kind registration (§12), and the real
build-proof runs the document through unmodified N1–N11. 6. UIR represents the distinction explicitly
(`dismisses`, schema §3). 7. Generator never infers from variable names — confirmed by E8/E10. 8. Runtime
never guesses "dialog currently open" — `close()` is called only via the resolved `dialogRefFor` lookup,
identical in shape to `show()`. 9. Result values transported without type guessing — they are not
transported at all (deliberate, §4/§16). 10. Awaited result semantics understood — investigated (§ E13),
confirmed pre-existing and orthogonally refused, not solved, not silently wrong. 11. Barrier dismissal
understood (§5). 12. Multiple actions deterministic (E6, real test). 13. Nested scopes cannot accidentally
dismiss the wrong layer — LIFO save/restore (§16). 14. Unsupported cases stay honestly refused
(`useRootNavigator`, popUntil, awaited results — all verified). 15. No app-specific behaviour (generic
fixture, generic mechanism). 16. No Continuum dependency (§20). 17. Real generated TypeScript typechecks
(real build-proof, §18). 18. Existing page navigation unchanged (full regression suite, §19). 19. No
unrelated blocker had to be solved first. 20. ADR written before implementation (§7).

**Implementation performed: yes.**

## 9. Schema changes

`packages/uir/schema/l1.json` — `logic.Navigate` gains optional `dismisses: NodeId`. Additive only. `just
codegen` regenerated `dart/bridge_uir/lib/generated/uir.dart` and `packages/uir/src/generated/uir.ts`
cleanly. `catalog/widgets/material.json`'s own `navigation` block gains `useRootNavigatorProp:
"useRootNavigator"`; `tools/catalog-codegen/src/model.ts`/`dart.ts` regenerate a new
`MaterialCatalog.navigationUseRootNavigatorProp` Dart constant (Dart-only — this vocabulary was never
generated into the TS side, matching `navigationBuilderProp`'s own precedent).

## 10. Analyzer changes

- `dart/bridge_analyzer/lib/src/session/extract/transition_extractor.dart` — `presentingTransition` field
  (§3); `_destination()` restructured to defer inline-widget extraction to the caller (`maybeExtract`),
  which now mints the transition's own symbol *before* extracting its content, so the content can be
  tagged with an identity that already exists. Extraction is wrapped in a `try/finally` that restores the
  *previous* value of `presentingTransition`, not `null` (§16).
- `dart/bridge_analyzer/lib/src/session/extract/expression_extractor.dart` — new `PresentingTransitionHook`
  typedef and `presentingTransition` field, mirroring the existing `TransitionHook`/`transitions` pattern
  (a function, not a direct class reference, to avoid a circular import — the same reason `transitions`
  is shaped that way).
- `dart/bridge_analyzer/lib/src/session/extract/extractor.dart` — wires `expressions.presentingTransition
  = () => transitions.presentingTransition;` alongside the existing `transitions.maybeExtract` wiring.
- `dart/bridge_analyzer/lib/src/session/extract/statement_extractor.dart` — `navigateOf`'s pop branch reads
  `expressions.presentingTransition?.call()` (only for plain `pop`, never `popUntil`) and sets `dismisses`.
- `dart/bridge_analyzer/lib/src/session/adapters/route/material_adapter.dart` — `transitionOf`'s overlay-
  opener branch reads `useRootNavigator:`; refuses (`Codes.unsupportedWrapper`, `BRG1304`) unless absent or
  the literal `true` (§8).

## 11. Validation changes

`dart/bridge_analyzer/lib/src/emit/validation.dart` — `_checkTransitionDestinations` (renamed in effect,
not in name) now also indexes which `app.RouteTransition`s have an `inline` destination, and checks every
`logic.Navigate.dismisses`: only on `action: 'pop'`, only naming a node that is an `app.RouteTransition`
with `inline` set. `Codes.malformedTransition` (BRG1307)'s own explanation text updated to describe this.
Not independently unit-tested (matches this validator's own existing, pre-M9-E checks — none of which have
dedicated tests either, since real extraction cannot currently produce the malformed shapes they guard
against; defense-in-depth, verified by code reading and by the dangling-reference mutation, §17 Mutation 2,
which incidentally also tripped this check's sibling, `_checkReferencesResolve`).

## 12. Compiler/N-pass changes

**Zero.** N5 (`n5_lift_closures.ts`) locates closures via fully structural `walk`/`walkNode` — no per-kind
registration anywhere — so the new `dismisses` field on an existing node kind needed no code change.
Confirmed by the unmodified full compiler suite (159/159) and by the real fixture running cleanly through
unmodified N1–N11 as part of its own build-proof.

## 13. Generator changes

- `packages/generators/react/src/internal/emit/statement.ts` — the `logic.Navigate` `pop` case checks
  `dismisses` and `scope.dialogRefFor?.(dismisses)` *before* requiring `router` in scope (mirroring the
  push/replace case's own ordering, for the identical reason: a dialog-only component declares no
  `router`), and returns `${dialogRef}.current?.close();` when resolved. Falls through to the unchanged
  `router.pop()` otherwise.
- `packages/generators/react/src/internal/emit/component.ts`:
  - `checkCapabilities`'s `AlertDialog` children refusal (M9-D) **removed** — actions render as ordinary
    children now that dismissal is sound.
  - `needsRouter` extended: a `pop` needs `router` unless its own `dismisses` names a resolvable inline
    transition (mirroring the existing push/replace branch).
  - `declareDialogHosts` restructured from one pass to two: every ref is declared *before* any dialog's own
    content is emitted, and an extended scope (`dialogRefFor` resolving the just-declared refs) is used
    for emitting each dialog's own content — the fix that lets a dismissal *inside* a dialog resolve that
    same dialog's own ref, which the single-pass M9-D version could not do (found and fixed as part of this
    milestone's own required execution path, not a pre-existing defect — it never mattered until dismissal
    existed to need it).

## 14. Runtime changes

`packages/runtimes/react/src/internal/widgets/dialog.ts`:
- `DialogHostHandle` gains `close(): void`. `DialogElement` (the structural, DOM-lib-free interface) gains
  `close(): void`, the real `HTMLDialogElement` method.
- `AlertDialogProps` gains `children?: ReactNode`; `AlertDialog` renders them in an `actions` wrapper div,
  after title/content. No awareness of dismissal in this component at all — `close()` is called at the
  `logic.Navigate` call site, never here.

## 15. Exact supported subset

`showDialog<T>(...)` (fire-and-forget — unassigned, unawaited-for-value) with `actions:` containing
supported button widgets (any `WIDGET_MAP` entry) whose `onPressed` may call `Navigator.pop(...)`/
`maybePop(...)` — any `BuildContext` expression, any or no second argument (discarded), any number of
actions, any mix of dismissing and non-dismissing actions. Default navigator configuration only
(`useRootNavigator` absent or `true`).

## 16. Exact refused subset

- `useRootNavigator: false` (or any non-boolean-literal value) on an overlay opener — `BRG1304`.
- `Navigator.popUntil(...)` inside a dialog action — unchanged, unaffected, still refused (`BRG1304`) with
  its own pre-existing, unrelated message.
- `await`ing or assigning `showDialog<T>(...)`'s own return value — not newly refused by this milestone
  (pre-existing gap, §1 E13), but confirmed, via a real `bridge build`, to still be refused honestly
  end-to-end (generator-level `BRG3005`/`BRG3006`/`BRG3013`, zero files emitted), not silently miscompiled.
- Nested dialogs — not implemented; `presentingTransition`'s LIFO save/restore (§ below) prevents the one
  silent-wrong outcome this would otherwise risk (an outer dialog's later pop losing its own tag), but no
  claim of correct nested behavior is made or tested.
- A project-defined result type — never reached; no result is read at all.

## 17. A real bug found and fixed in this milestone's own new code

While designing the extraction mechanism, reasoned through (not merely assumed) what happens if a dialog
action opens a *second* dialog: the original design unconditionally reset `presentingTransition` to `null`
after each inline extraction, which would have left it `null` — not restored to the *outer* dialog's own
symbol — once the inner call returned, silently un-tagging any later pop in the outer dialog's own action.
Fixed before it shipped by saving/restoring the previous value instead of hardcoding `null` (§3, §10). Not
a claim of nested-dialog support — a defensive fix against a specific silent-wrong outcome in code written
this same session, costing nothing.

## 18. Tests

- `dart/bridge_analyzer/test/transition_test.dart` — new `TextButton` stand-in class (the file's own
  `flutter` stand-in package had none; using it undefined would have silently dropped its own `onPressed`
  callback from extraction entirely — found and fixed as part of writing these tests, §21). New
  `dialogDismissal()` group, 15 tests: E1, E2/E5 combined, E6, E7, E8, E10, a negative control (unrelated
  page-level pop never tagged), a negative control (project-defined `showDialog` function never triggers
  this mechanism), `useRootNavigator: false` refused, `useRootNavigator: true` unaffected, E13 (orphaned
  transition, documented not fixed, including the real double-walk artifact this specific shape exposes —
  investigated and explained, not hidden), determinism.
- `packages/generators/react/tests/generate.test.ts` — `M9-D — AlertDialog.actions is refused` group
  rewritten to `M9-E — AlertDialog.actions renders as ordinary children`: children now render, not refused;
  a new regression test pins the "dismiss naming an orphaned transition is refused, not emitted against an
  undeclared ref" finding with hand-built UIR.
- `packages/generators/react/tests/dialog_destinations_build.test.ts` — the M9-D fixture extended in place
  (per this milestone's own preference for extending over proliferating fixtures): each of the two existing
  dialogs gains one action; one uses the builder's own `dialogContext`, the other deliberately uses the
  outer page context, proving E8 through the real pipeline. 7 tests (was 6): both dismissals lower to
  `close()` on the correct, distinct ref; still no router declared; real `tsc` typecheck.
- `fixtures/apps/dialog_destinations/` + `fixtures/uir/dialog_destinations.ndjson` — golden regenerated,
  verified byte-identical on a fresh `bridge analyze`, verified deterministic + fixed-point.

## 19. Negative controls (§17 of the milestone brief)

1. Project-defined `showDialog` function — not recognised (ISSUE-18, resolved element only); its own pop
   never tagged. Tested.
2. Project-defined `Navigator` class — covered by the *same* resolved-element discipline every existing
   navigation test in this file already exercises; not separately re-proven (would duplicate existing
   coverage this milestone did not touch).
3. Outer page context used inside a dialog action — tagged correctly (E8), proven not a bug.
4. `useRootNavigator` set to a non-default value — refused. Tested.
5. Unsupported result type — never reached; nothing reads a result at all.
6. Nested navigator case — not modelled; LIFO-safe by construction (§17), not tested as "supported."
7. A callback literally named `closeDialog` — no significance anywhere in this design; nothing matches on
   callback names at all.
8. A project variable named `dialogContext` elsewhere in an unrelated scope — E10 already proves renaming
   the *real* builder parameter changes nothing; an unrelated same-named variable elsewhere has no
   mechanism to interact with `presentingTransition` at all (it is not Scope-based).

## 20. Mutation / adversarial results

1. **`presentingTransition` never set** (`transition_extractor.dart`) — 8 of 15 dismissal tests failed
   (every positive-tagging assertion). Reverted, clean.
2. **Every pop claims a bogus `dismisses` id, unconditionally** (`statement_extractor.dart`) — 8+ tests
   failed, including both negative controls, *and* the pre-existing `_checkReferencesResolve` dangling-
   reference check (`BRG1201`) independently caught it too. Reverted, clean.
3. **Generator-side `dismisses` → `close()` lowering disabled** (`statement.ts`) — 6 of 7 build-proof tests
   failed (missing `close()` calls, `BRG3006` "no router in scope" errors, zero files emitted). Reverted,
   clean.
4. **`useRootNavigator: false` refusal disabled** (`material_adapter.dart`) — the dedicated test failed
   (extracted a full transition + tagged dismiss where a refusal was expected). Reverted, clean.

All four reverted; `dart analyze --fatal-infos` and the full Dart/TS suites re-confirmed clean after each
revert and after all four.

## 21. Errors found and fixed during this milestone (self-discovered, disclosed)

- `TextButton` was never a resolvable class in `transition_test.dart`'s own `flutter` stand-in package —
  using it undefined caused its `onPressed` callback to be silently dropped from extraction (not an error;
  a real, if narrow, test-infrastructure gap, not a compiler defect). Fixed by adding a minimal stand-in,
  the same idiom `AlertDialog`'s own M9-D stand-in already established.
- `declareDialogHosts`'s single-pass structure (M9-D) could not let a dialog's own action resolve its own
  ref — found and fixed as part of this milestone's own required execution path (§13).
- `presentingTransition`'s reset-to-`null` (rather than save/restore) would have silently mis-tagged a
  later pop after a hypothetical nested dialog — found and fixed before shipping (§17).
- An orphaned-transition double-walk artifact for the `await`+assign shape (§18, E13 test) — investigated,
  explained, confirmed safe (the containing program is refused end to end regardless, verified via a real
  `bridge build`), not fixed (would require widening general expression lowering, out of scope).

## 22. Real build proof

`fixtures/apps/dialog_destinations` extended with one action per dialog (one via the builder's own
`dialogContext`, one via the outer page `context`). Real `bridge analyze` (zero errors) → committed golden
→ real `bridge normalize` (N1–N11 unmodified) → real generator → real `tsc` against the real, unmocked
`@bridge/runtime-react`. All 7 build-proof tests pass, including the full chain. A second, hand-built
generator-level test pins the orphaned-transition refusal (§18).

## 23. Regressions

Full Dart suite: 385/385 (`dart analyze --fatal-infos` clean across `bridge_analyzer` and `bridge_uir`).
Full TS compiler suite: 159/159. Full TS generator suite: 349/349, including every M7/M8/M9-A/M9-B/M9-C/
M9-D build-proof and diagnostic test, all re-run fresh after every mutation revert. `Navigator.push`,
`Navigator.pop` (page-level), `Navigator.replace`, route arguments, an inline dialog with no actions, and
`app.RouteTransition` destination exclusivity all confirmed unchanged. Anchor ownership (M9-D's own
`transition[$ordinal]` scheme) confirmed unaffected — the ordinal-minting reorder in `maybeExtract` (§10)
changes *when* the symbol is minted relative to `_destination`, not the ordinal sequence itself for any
program that reaches emission (a refused destination still returns before any ordinal is consumed, exactly
as before this milestone). No ordinary route pop was reinterpreted — every page-level `Navigator.pop`
lowers to `router.pop()` exactly as it did before this milestone, unchanged, in every test file.

## 24. CI / determinism / fixed-point

- `just ci`: exit 0.
- `bridge validate --json` on `fixtures/apps/dialog_destinations`: `{"ok": true, "checks":
  [{"deterministic": true}, {"fixed point": true}]}`.
- `git diff --check`: clean.
- Schema changed → `just codegen` run, `codegen-check` passed as part of `just ci`.
- Real `tsc` run as part of the build-proof (§22).
- The full browser-based `just determinism` was not run this pass, matching M9-D's own honest disclosure of
  the same — the compiler-level determinism/fixed-point guarantee above was verified directly instead.

## 25. Silent-wrong-code audit

- Wrong context closes wrong layer — impossible by construction: no context is ever resolved or compared;
  the tag is purely extraction-scope-based.
- Page route popped instead of dialog / dialog closed instead of page — E8 proves the opposite risk
  (assumed-page pop actually being dialog-correct) does not manifest as a bug, because it is not a bug —
  it is real Flutter semantics (§2, §5).
- Result lost / changed / resolved twice / never resolves — no result is ever transported, so none of these
  apply; `close()` takes no argument.
- Barrier dismissal wrong result — irrelevant, no result path exists.
- Callback evaluated twice — not applicable; nothing in this milestone re-evaluates a callback.
- Action callback dropped — E7 confirms an action with no navigation still extracts (and would still
  render, once emitted) — nothing is dropped, it simply produces no `logic.Navigate`.
- Nested dialog closes parent / parent closes child — not supported or claimed; the LIFO fix (§17) prevents
  the one silent-wrong outcome reachable from the current mechanism, without claiming full support.
- Stale dialog binding captured — each dialog's own ref is a fresh `useRef` per component instance,
  standard React lifecycle; no cross-instance sharing exists.
- Router unnecessarily required — `needsRouter`'s pop-side extension (§13) prevents this for the dismiss
  case, the same way M9-D's own extension prevented it for the show case.
- Action rendered but semantically inert — an action with no `Navigator.pop` renders and does whatever its
  own callback does; "inert" would only describe a *dismiss* action whose `dismisses` failed to resolve,
  which falls through to the honest `router.pop()`/`BRG3006` refusal path (§18 Mutation 3, §22), never to
  silent inertness.
- The one real double-walk artifact found (§18 E13, §21) was investigated to its root cause and confirmed
  non-dangerous (the containing program never compiles), not merely asserted safe.

A compiling TypeScript result was never treated as sufficient proof on its own — every claim above is
backed by a semantic assertion in a real test (extraction-level `dismisses` values, generator-level exact
lowering strings, or a real Flutter widget test for the underlying navigator semantics), and the two
riskiest claims (§2's Flutter semantics, §17's nested-dialog LIFO fix) were verified or reasoned through
before any test was written, not after.

## 26. FlutterBridge/Continuum boundary audit

`git diff HEAD` (this milestone's full diff) contains zero occurrences of "continuum" — checked directly,
not assumed. One pre-existing, unrelated "Continuum" mention remains in `component.ts` (a doc comment from
M8-F, predating this milestone, citing it as historical evidence per CLAUDE.md's own provenance-only
allowance) — not touched, not added to, confirmed via `git diff` showing it outside this milestone's own
added lines. No Continuum fixtures, no Continuum-specific compiler branch, no copied Continuum source, no
external app names in any new generic test — `fixtures/apps/dialog_destinations` and all new Dart tests use
only generic names (`Home`, `HomeScreen`, `Confirm`, `Cancel`, `Close`).

## 27. Remaining FlutterBridge-only blocker graph

Unchanged from M9-D except this milestone's own item resolved (bounded):

- `BridgeAnalyzer` does not gate on the resolved unit's own analyzer errors — unchanged, not investigated.
- The widget-tree collection-for's own `itemParam` identity — unchanged, and now more precisely understood
  to be a *different, harder* problem than dialog dismissal was (per-iteration identity vs. single-instance
  presentation identity) — confirmed by this milestone's own investigation, not merely restated.
- Private/derived getters — unchanged.
- `ScaffoldMessenger.of` — unchanged.
- Class-declaration module emission — unchanged.
- **New**: `showDialog<T>(...)`'s own return value, when `await`ed or assigned, is not representable —
  minted as an orphaned transition, safely refused end-to-end by the generator, but not honestly refused
  *at the analyzer stage* with a precise diagnostic naming the actual cause. A real, if non-dangerous,
  message-quality gap (§21), not fixed here — would require deciding whether `logic.Navigate` (or a
  wrapping construct) can produce a value in expression position, a materially larger question than this
  milestone's own bounded scope.
- **New**: `useRootNavigator: false`, nested dialogs, and dialog result propagation remain explicitly out
  of scope — each would need its own dedicated investigation before implementation, matching this
  milestone's own discipline.

## 28. Recommended M9-F

Not preselected. Three concrete, evidence-backed candidates:

1. **Whether a navigation can produce a value in expression position** — the prerequisite for `await
   showDialog<T>(...)` (assigned or in a condition) to ever be representable, and the prerequisite for any
   future dialog *result* propagation. A materially large, separate architecture question (§27).
2. **Whether `BridgeAnalyzer` should gate on the resolved unit's own analyzer errors** — carried over from
   M9-C/M9-D, still not investigated.
3. **The widget-tree collection-for's own `itemParam` identity** — now more precisely scoped (per-iteration
   identity, a genuinely different and harder problem than the single-instance presentation identity this
   milestone solved for dialogs) — carried over from M9-A, still not investigated.

**M9-E complete. FlutterBridge remains the sole development target. M9-F has not been started.**
