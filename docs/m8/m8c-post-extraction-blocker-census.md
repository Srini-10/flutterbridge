# M8-C — Post-extraction blocker census & prioritization

**Date:** 2026-08-20. **Baseline:** `8bea55f6283d9052f99674e43f1c29a54403309a` (== `origin/main`, clean
tree, confirmed before any measurement). This is a measurement/classification milestone — **no
analyzer, compiler, generator, runtime, schema, or catalog file was changed.**

## 1. Baseline

HEAD and origin/main both `8bea55f`, working tree clean, confirmed via `git status --short` /
`git rev-parse` / `git log -5 --oneline` before starting.

## 2. Fresh Continuum results

Re-ran both apps fresh (`flutter pub get` already resolved from M8-B; `.bridge`/`build/bridge` removed
and rebuilt from scratch):

| | droid | mac |
|---|---:|---:|
| Analyzer diagnostics | 38 | 9 |
| Generator error lines (unique, excl. rollup) | 19 | 16 |
| Files emitted | 0 | 0 |
| `ui.Opaque` reason `"build body with statements"` | **0** | **0** |
| `ui.Element` nodes | 41 | 31 |
| `ui.Cond` nodes | 6 | 5 |
| `ui.Opaque` nodes (other reasons) | 4 (`widget returned by a call`, `spread`×2, `unrecognised widget expression`) | 3 (`widget returned by a call`, `spread`×2) |

Every M8-B figure reproduces exactly. No discrepancy — nothing to reconcile before proceeding.

## 3. Complete diagnostic inventory

**Analyzer (droid, 38 total):** 32× `BRG1302` ("syntax has no UIR representation" — 23 are one `static
const Set<String>` literal in `notification_policy.dart:18-39`, plus `is-check`×3, `adjacent string
literals`×4, `collection-for`×2, `cascade`×1 spread across other files), 1× `BRG1301` (an unrecognised
widget expression in `notification_filter_section.dart:98`), 1× `BRG1304` (`SettingsPage` cross-package
push).

**Analyzer (mac, 9 total):** 6× `BRG1302` (`is-check`×1, `adjacent string literals`×3, `collection-for`×1,
`cascade`×1), 1× `BRG1304` (same `SettingsPage` push), 1× `BRG1302` `collection-if`.

**Normalize:** droid 7 diagnostics, mac 4 (both dominated by the same `ui.Opaque` reasons already listed
in §2 — normalize doesn't introduce new codes beyond what N3/N4-class passes already report for opaque
nodes carrying `"spread"`/`"unrecognised widget expression"` reasons, which do **not** match the
`/builder|for-element|spread/i`… wait — `"spread"` *does* match that regex (contains "spread"), so these
already receive `BRG2103` warnings at normalize, unlike M8-A's own dominant finding).

**Generate (droid, 19 unique error lines + 1 rollup):** `BRG3006`×6 (`_Stage.loading`, `_Stage.idle`,
`_Stage.onboarding`, `env`×2, `states`), `BRG3013`×1 (`Navigator.of`), `BRG3002`×3 (named-argument
passthrough, `SettingsPage` class-declaration gap, list-key-from-index), `BRG3001`×3 (`OnboardingPage`,
`MessageLogView`, `SwitchListTile`), `BRG3004`×5 (opaque source reaching the generator), `BRG3001`×1
(`ListTile.dense`, a partial-prop diagnostic, not a full refusal).

**Generate (mac, 16 unique error lines + 1 rollup):** `BRG3006`×5 (`_Stage.loading`, `_Stage.idle`,
`_Stage.onboarding`, `_Stage.connected`, `env`, `states`), `BRG3013`×1, `BRG3002`×2, `BRG3001`×3
(`OnboardingPage`, `PeerBatteryIndicator`, `DropTarget`), `BRG3004`×3.

All 38 generate-stage occurrences (19+16, excluding rollups) block generation — every one is
`severity: error`, and `BRG3005`'s own rollup confirms 0 files emitted for either app.

## 4. Root-cause collapse

Diagnostic count is not blocker count. Node-id tracing into the normalized UIR (Dart source, resolved
`type`/`library`, and — critically — which shared package each site's declaration lives in) collapses
the 35 generate-stage error lines into **six** distinct root causes:

| Root cause | Diagnostic codes | Droid sites | Mac sites | Hard blocker? |
|---|---|---:|---:|---|
| Cross-package component construction (`continuum_ui_kit`) | `BRG1304`, `BRG3002` (`SettingsPage` class-decl gap), `BRG3001` (`OnboardingPage`, `MessageLogView`, `PeerBatteryIndicator`) | 4 | 4 | **Yes** |
| Unresolved enum-constant reference (`_Stage.*`) | `BRG3006` | 3 | 4 | **Yes** |
| Complex action-body / mid-function imperative navigation lowering | `BRG3006` (`env`, `states`), `BRG3013` (`Navigator.of`), `BRG3002` (named-argument passthrough) | 4 | 3 | **Yes** |
| Uncatalogued Flutter SDK widget | `BRG3001` (`SwitchListTile`), `BRG3001` (`ListTile.dense`, partial) | 2 | 0 | **Yes** (for `SwitchListTile`); no (for the `.dense` partial — degrades, doesn't block) |
| Third-party plugin widget (`desktop_drop`) | `BRG3001` (`DropTarget`) | 0 | 1 | **Yes** |
| Collection spread / null-valued widget expression | `BRG3004` (`spread`×2, `unrecognised widget expression`) | 3 | 2 | **Yes** |
| *(out of M8-C's scope, expected)* `_buildBody`'s `switch`, via "widget returned by a call" | `BRG3004` | 1 | 1 | Yes, but **M8-B's own documented stop boundary**, not a new finding |
| List-key-from-index (N9) | `BRG3002` | 1 | 0 | No — a warning-shaped diagnostic about output quality, not a refusal |

## 5. Unresolved enum / static-constant audit

Every `_Stage.X` reference traced (7 total: 3 droid, 4 mac) is `logic.Ref{name:'_Stage.loading', type:
{library:'package:droid/pages/pairing_page.dart', name:'_Stage'}}` — **no `target` field, ever**. `type`
correctly names the declaring enum; the reference is a genuine, real Dart `PropertyAccess`/
`PrefixedIdentifier` on an **application-declared enum** (`enum _Stage {...}`, private, declared in the
same file as its use) — not a Flutter SDK enum, not a package enum, not an extension member. The first
occurrence (`_Stage _stage = _Stage.loading;`, a field initializer) is a trivial, single-expression
context — confirming the gap is not an artifact of complex surrounding structure.

This is the **same construct class** M7-O's audit independently found in hello_bridge's `ThemeMode.light`/
`ThemeMode.dark` references (a Flutter SDK enum there, an application enum here) — the same underlying
gap, not the M4-C issue (which concerned colour/swatch typing, a different resolution problem entirely).

**A general structural solution exists, without name matching.** Dart's own resolved element model gives
`node.element` a real `FieldElement`/enum-constant element for `_Stage.loading`, exactly as it does for
any other static member access — the same kind of resolved identity M7-N's `Symbols`/`RawRef` mechanism
already uses to give store members a `target` (never matching by spelling). The schema already has
`logic.EnumDecl` as a raw node kind. Wiring a `target` from an enum-constant `logic.Ref` to its owning
`logic.EnumDecl` (or a constant-indexed identity within it) is structurally the same shape of work M7-N
already proved out, not a new mechanism.

## 6. Cross-package component construction audit

`SettingsPage` (`packages/ui-kit/lib/src/settings_page.dart`, package `continuum_ui_kit`) is pushed from
`pairing_page.dart` (each app's own `lib/`) via `Navigator.of(context).push(MaterialPageRoute(builder:
(context) => SettingsPage(...)))`.

- **Where declared:** a sibling workspace package, `path:`-dependency, not either app's own `lib/`.
- **Does the analyzer see the package source?** No — `bridge analyze` scopes to the single Flutter
  project it is pointed at (each app's own root); it never walks a path dependency's own `lib/` to
  extract its widgets as `ui.Component`s.
- **Does a `ui.Component` exist for `SettingsPage`?** No.
- **Does the constructor become `ui.Element`?** The construction site itself is recognised (Dart's own
  type resolution correctly identifies `SettingsPage` as a real, well-typed class — this is not an
  unresolved-symbol crash), but with no `ui.Component` to reference, the route/generator can only report
  it, not represent it.
- **Component identity:** resolves correctly at the Dart level; there is simply nothing in the emitted
  program for it to resolve *to*.
- **Props:** never reach the output — there is no destination component to receive them.

**Classification: D (package source is outside analysis roots), with B as a direct consequence
(component is not included in the program).** Not A (the reference itself resolves fine) and not C (it
is not merely represented as an opaque external type — it is refused by name, with a clear diagnostic
naming the missing capability, per `BRG1304`'s own wording).

`OnboardingPage`, `MessageLogView`, and `PeerBatteryIndicator` (all also from `continuum_ui_kit`,
constructed directly rather than via a route push) hit the **identical** root cause via a *different*
diagnostic code (`BRG3001`, "not a Flutter widget this generator has a mapping for") — the generator's
widget-lookup path and the route-transition path both, independently, hit the same underlying absence
(no `ui.Component` for a cross-package type), and report it in their own vocabulary. This is the root-
cause collapse's single highest-leverage finding: **one architectural gap (no multi-package analysis
root), reported through three different diagnostic codes.**

This is not a small fix — it is a genuine **program-assembly** question (should `bridge analyze` ever
treat a workspace's path-dependency packages as part of the one analyzed program, and if so, whose
`ui.Component`s do they contribute, under what naming, and does that conflict with M4-G's existing
single-project assumptions?) — very likely requiring its own ADR before implementation, not a mechanical
mapping fix.

## 7. Uncatalogued widget audit (Flutter SDK only)

Verified fresh, matching M8-B exactly: **`SwitchListTile`** (droid, 1 occurrence) is the only fully-
refused genuine Flutter SDK widget; **`ListTile.dense`** (droid, 1 occurrence) is a partial-prop gap on
an otherwise-supported widget (`ListTile` itself renders; the `dense` prop is silently unavailable and
reported, not applied). No SDK widget gap was found on mac.

`OnboardingPage`, `MessageLogView`, `PeerBatteryIndicator` (both apps) and `DropTarget` (mac) also surface
via `BRG3001`'s wording but are **not** SDK-widget gaps — see §6 (the first three) and below (`DropTarget`
is a genuine third-party pub.dev widget, `package:desktop_drop`, a materially different fix: the catalog
would need to support a non-Flutter-SDK package at all, which is a separate, smaller-but-still-real
capability question from either §6's program-assembly issue or a plain SDK mapping addition).

## 8. Collection / nullability audit

Two `ui.Opaque` reasons remain, both **already** correctly triggering `BRG2103` at normalize (their
reasons match the existing `/builder|for-element|spread/i` regex, unlike M8-B's own now-resolved gap):

- **`"spread"`** (`[const SizedBox(height: 12), StagedClipBanner(...)]` used inside `if (clip != null)
  ...[...]`, and similarly for `TransferProgressList`) — a **null-aware collection-if with a spread
  body** inside a widget's `children:` list. `ui.List`'s template vocabulary and `ui.Cond` both exist,
  but neither currently composes to represent "conditionally splice zero-or-more literal widgets into a
  sibling list" — this is genuinely different from the already-supported `if (x) Widget()` single-widget
  case the M7 chronology confirmed working. **Classification: extraction gap (B)** — the shape is not
  reached by either `ui.Cond`(single widget) or `ui.List`(a `for`-templated repeat); a spread of a
  *fixed, literal* short list conditionally is a third shape neither covers today.
- **`"unrecognised widget expression"`**, `dartSource: 'null'` (droid only) — a bare `null` literal used
  directly as a `Widget?` in a collection position (Flutter renders nothing for a `null` child).
  **Classification: extraction gap (B)** — a literal `null` in a widget-tree position has no `ui.*`
  representation to fall back to (not even `ui.Opaque` gracefully — it becomes the generic "unrecognised
  widget expression" catch-all, a level below a properly-named gap).

Neither is flattened or guessed at anywhere in the pipeline — both remain honestly opaque, each
contributing exactly one `BRG3004` at generate. No schema gap was found for either; both look like
extraction-layer omissions (a `Widget?` value of `null`, and a spread-of-a-literal-list-inside-a-
collection-if) rather than missing UIR vocabulary.

## 9. Navigation audit

The one newly-visible imperative-navigation diagnostic (`BRG3013`, `Navigator.of`) is **not** a
regression against any M7 claim. Tracing `_openSettings()` (droid, `pairing_page.dart:419-436`) and its
mac equivalent: the `await Navigator.of(context).push(MaterialPageRoute(builder: ...))` call is **not the
last statement of its enclosing function** — more code (re-reading feature-toggle state) runs after it
returns. `statement_extractor.dart`'s `_isLastStatementOfFunctionBody` — the exact mechanism M7-H built
and **deliberately, explicitly scoped narrow** ("a statement last in a nested if/while/try block is not
covered... left to the existing, safe refusal rather than a recursive walk... this milestone found no
evidence it needs") — does not recognise a mid-function await-navigate. M7-H never claimed this broader
form; this is squarely **newly exposed, not a regression.**

This finding also reframes `env`/`states`'s two `BRG3006`s in `_openSettings`: both are ordinary
`Binds.local` variables (`final env = _env;`, `final states = await env.settings.featureStates();`)
whose *unresolved-reference* symptom is a **downstream consequence of the same navigation-lowering gap**
in that one method, not an independent occurrence of the enum-reference issue from §5 (confirmed by
checking `type`: neither `env` nor `states` resolves to an enum type). A **separate** pair of `env`/
`states`-shaped unresolved references (in `_bootstrap()`, a `try`/`catch` with nested `if`/`else if` and
several sequential locals) is a distinct, less-understood instance of the same broad family — complex
action-body lowering — not yet reducible to one precise mechanism the way §5's enum gap is. This family
is reported as its own root cause in §4 rather than folded into either §5 or §6, because its exact
boundary (which action-body shapes the generator can and cannot thread local scope through) was not
fully characterized in this pass.

## 10. Opaque residue audit

| Reason | Exact source | Reachable? | Blocks generation? | Would resolving it expose more widgets? |
|---|---|---|---|---|
| `"widget returned by a call"` | `_buildBody(context)` — the `_Stage`-switch helper method call | Yes (both apps' `PairingPage.build`) | Yes, 1 `BRG3004` each | **Yes, substantially** — `_buildBody`'s own switch renders 5-7 distinct screen states per app, none of which is visible in current widget counts at all. This is M8-B's own explicit, already-documented stop boundary (§10 of `m8b-structured-build-extraction.md`), reproduced here, not new. |
| `"spread"` | conditional literal-list splices (§8) | Yes | Yes, 2 `BRG3004` each | A handful of widgets each (`StagedClipBanner`, `TransferProgressList`, and their small fixed sibling literals) — modest, not comparable to the switch's scope |
| `"unrecognised widget expression"` (`null`) | a nullable widget position (droid only) | Yes | Yes, 1 `BRG3004` | No — resolving a bare `null` exposes nothing further, it renders nothing by definition |

**Widget coverage is not artificially inflated by these residues in the way M8-A's was** — none of them
hide a large unmeasured subtree the way the pre-M8-B wholesale opaquing did, **except** `_buildBody`'s
switch, which is real, substantial, and already known — not a new finding this phase, but worth
restating precisely here since it is the largest remaining opaque-hidden surface in the corpus.

## 11. Shared-package impact

Of the six root causes in §4, exactly **one** originates in a shared package used by both apps
(`continuum_ui_kit`, via `SettingsPage`/`OnboardingPage`/`MessageLogView`/`PeerBatteryIndicator`) — and it
is the only root cause with **zero source-site divergence** between droid and mac (both apps reference
the identical shared components, the identical way). Every other root cause (enum references, action-body/
navigation lowering, `SwitchListTile`, `DropTarget`, spread/null) originates in each app's own `lib/`
independently — droid and mac each declare their *own* `_Stage` enum, their *own* `_openSettings`/
`_bootstrap`, etc. — so a fix there helps both apps only in the sense that the same *pattern* recurs, not
because one shared source location is fixed once.

**Quantified: 1 of 6 root causes is shared-package-sourced (8 of 35 generate-stage error lines, ~23%);
the other 5 root causes (77% of error lines) are application-code-local to each app, independently
duplicated.**

## 12. Revised coverage metrics

M8-A's 100% and M8-B's 98.4% both measured different things; neither alone characterizes the corpus.
Reporting several, explicitly:

1. **Visible SDK widget occurrence coverage:** 63/64 = 98.4% (unchanged from M8-B — this pass added no
   new SDK-widget sites).
2. **Unique SDK widget-type coverage:** 20/22 = 90.9% fully supported (1 partial, `ListTile`; 1 refused,
   `SwitchListTile`).
3. **Reachable UI subtree coverage: cannot be measured reliably.** `_buildBody`'s switch (§10) hides an
   unknown but substantial number of additional widget instantiations across 5-7 branches per app that
   have never been extracted at all — any percentage computed today excludes that entire subtree by
   construction, so a "percent of the app's real UI that's visible" figure would be fabricated, not
   measured. Stated explicitly rather than guessed at, per the milestone's own instruction.
4. **Hard-blocker-free component coverage:** 0 of 5 droid components, 0 of 3 mac components reach
   generation without at least one hard-blocking diagnostic (§15's dominator analysis: every component is
   touched by at least one of the co-dominating root causes).
5. **Application components structurally represented (post-M8-B, pre-M8-C):** 5 of 5 droid, 3 of 3 mac —
   unchanged from M8-B; this metric measures *extraction* success, which M8-C did not touch.
6. **Opaque subtree count:** droid 4, mac 3 (§10) — down from M8-A's 4/2 in raw count but, as established
   in M8-B, entirely different and more precise causes; one of the four (`_buildBody`) is known to be
   large, the rest are small.

## 13. Blocker dominator graph

No single root cause dominates `files emitted > 0` for either app. All three of the following are
independent, **co-dominating** blockers — removing any one alone still leaves the other two:

```
                    ┌─ cross-package component construction (§6)
                    │      (SettingsPage, OnboardingPage, MessageLogView, PeerBatteryIndicator)
files emitted > 0 ──┼─ unresolved enum-constant reference (§5)
                    │      (_Stage.* in both apps' own field initializers and build-adjacent state)
                    └─ complex action-body / navigation lowering (§9)
                           (env/states in _openSettings and _bootstrap, Navigator.of mid-function)
```

None of these three sits "underneath" another in a chain the way M8-A's ui.Opaque wholesale-opaquing sat
underneath everything else — each is independently necessary. Fixing cross-package components alone would
not unblock either app (enum refs and action-body lowering still error); fixing enum refs alone would not
either; fixing action-body lowering alone would not either.

**`SwitchListTile`, `DropTarget`, spread, and the `null`-widget expression are not co-dominators** — each
is a single, narrow site whose removal reduces the error count but does not, on its own or in combination
with the other narrow ones, get either app past the three co-dominators above.

**No single shared root cause dominates both apps' remaining blockers as a group** — cross-package
construction is shared-sourced (§11), but enum references and action-body lowering are each
independently duplicated per app, not fixed once for both.

**Minimum blocker set for droid to emit:** {cross-package components, enum-constant references,
action-body/navigation lowering} — 3 root causes, 11 of droid's 19 error lines (the remaining 8 —
`SwitchListTile`, `ListTile.dense`, spread×2, `null`-widget, list-key-warning, `_buildBody`'s switch —
are not co-dominators and would still need their own resolution, but do not by themselves block emission
the way the three above do; whether droid could emit with only those three fixed and the narrow ones
still erroring depends on whether `bridge generate`'s all-errors-block-emission policy treats every one
identically — under the current policy (§4's `BRG3005` rollup: *any* error blocks *all* emission), **all
19 must be resolved**, not just the three co-dominators, for `files emitted > 0` to become true. The
"co-dominator" framing above answers *which gaps represent real architectural work* versus incidental
narrow gaps — not a claim that the narrow ones are free.).

**Minimum blocker set for mac to emit:** the same three root causes, 10 of mac's 16 error lines, plus the
same caveat — all 16 must resolve under the current all-errors-block policy.

**Shared blocker set between both:** {cross-package component construction} is the only root cause
literally shared at the source level (§11); {enum-constant references} and {action-body/navigation
lowering} are shared as *patterns*, independently present in each app's own code.

## 14. Prioritization

| Rank | Root cause | Tier | Why | Expected unlock |
|---|---|---|---|---|
| 1 | Unresolved enum-constant reference | P1 | Hard-blocks both apps; smallest, most tractable of the three co-dominators; proven general structural solution exists (§5), no ADR needed | Resolves 7 of 35 generate error lines; both apps' field-initializer and stage-state reads become real `bind.Signal`-adjacent references |
| 2 | Cross-package component construction | P1 | Hard-blocks both apps; highest shared-package leverage (§11); but requires a program-assembly / ADR-level decision before implementation | Resolves 8 of 35 error lines; likely the largest single-PR scope of the three, since it touches project/analysis-root assembly, not just extraction |
| 3 | Complex action-body / navigation lowering | P1 | Hard-blocks both apps; least well-characterized boundary (§9); likely needs its own dedicated audit before a safe, narrow implementation (mirroring how M7-H itself was deliberately narrow) | Resolves up to 7 of 35 error lines, but scope of a safe fix is not yet fully known |
| 4 | `_buildBody`'s `switch` (§10) | P2 | Not a hard blocker in the co-dominator sense (only 1 error line each), but hides the largest unmeasured subtree in the corpus (§12 metric 3) | Would make "reachable UI subtree coverage" measurable for the first time; already correctly scoped out by M8-B as its own architecture question |
| 5 | Collection spread / null-widget expression | P2 | Small, narrow, real | Resolves 5-6 error lines total; modest widget-count increase |
| 6 | `SwitchListTile` | P3 | Single site, ordinary catalog mapping work | 1 error line, mechanical fix |
| 7 | `DropTarget` (third-party plugin widget) | P3 | Single site; raises a real but narrower question (does the catalog model third-party packages at all) | 1 error line |
| 8 | `ListTile.dense` | P4 | Partial-prop degradation, not a blocker | Cosmetic only |
| 9 | List-key-from-index (N9) | P4 | Pre-existing, intentional, warning-shaped output-quality note, not a gap | None — working as designed |

No P0 was found — see §17.

## 15. P0 escape hatch

Not triggered. No silent wrong-code and no regression in an already-supported capability was found in
this pass — the one navigation diagnostic (§9) was checked specifically against M7-H's own documented
scope and confirmed to be outside it, not a broken promise. This is a genuine, correctly-refused new
finding, not a correctness defect.

## 16. Exact M8-D recommendation

**Target: unresolved enum/static-constant reference identity.**

- **Exact root cause:** a `logic.Ref` to an enum constant (`EnumType.constantName`) never carries a
  `target`, so it reaches the generator as an apparently-undeclared name.
- **Source examples:** `_Stage _stage = _Stage.loading;` (field initializer, droid `pairing_page.dart:40`,
  mac `pairing_page.dart:39`); `setState(() => _stage = _Stage.idle);` and similar assignment sites; the
  identical construct M7-O independently found in hello_bridge's `ThemeMode.light`/`.dark`.
- **Occurrence count:** 7 across the two Continuum apps (3 droid, 4 mac); at least 2 more in hello_bridge
  (themeMode's conditional, currently masked by an earlier-firing diagnostic there).
- **Affected apps/packages:** both Continuum apps' own `lib/`; not shared-package-sourced.
- **Current UIR shape:** `logic.Ref{name:'_Stage.loading', type:{library, name:'_Stage'}}`, no `target`.
- **Owning subsystem:** the Dart analyzer's extraction layer (the same layer M8-B's own fix lived in) —
  specifically wherever a `PrefixedIdentifier`/`PropertyAccess` on a static/enum qualifier currently
  resolves via `_isStaticQualifier`/`_reference` in `expression_extractor.dart`.
- **Schema impact: none expected.** `logic.Ref.target` already exists as an optional field; `logic.
  EnumDecl` already exists as a node kind. This is wiring existing vocabulary together, the same shape of
  change M7-N made for store members.
- **ADR impact: none expected** — no new architectural decision, unlike §6's cross-package candidate.
- **Expected diagnostics removed:** the 7 `BRG3006`s named above (both apps), plus whatever count
  hello_bridge's own `ThemeMode` case would need once its own earlier-firing diagnostic (`BRG3016`) is
  no longer the reason generation stops there — not claimed as removed by this fix alone, noted as a
  related, second real-corpus site this fix would also help.
- **Expected next pipeline boundary:** neither app reaches `files emitted > 0` from this fix alone (§13's
  co-dominator finding) — the expected boundary moves from "many undifferentiated generate errors" to
  "generate errors concentrated in the two remaining co-dominators (§6, §9)," a real, measurable
  narrowing, not full unblocking.
- **Why it outranks candidate #2 (cross-package component construction):** candidate #2 requires an
  ADR-level program-assembly decision (does `bridge analyze` ever span multiple workspace packages, and
  under what model) before any implementation can safely start — exactly the kind of decision this
  milestone's own instructions say to flag rather than presume. The enum-identity fix needs no such
  decision: it is squarely an extraction-layer wiring task with a directly-precedented mechanism (M7-N),
  scoped entirely within each app's own already-analyzed source, and independently corroborated by a
  second real corpus (hello_bridge, via M7-O). It is the smallest, most immediately actionable, and
  least architecturally uncertain of the three P1 co-dominators.

## 17. Change policy confirmation

Docs-only. `docs/m8/m8c-post-extraction-blocker-census.md` is the only file changed. No analyzer,
compiler, generator, runtime, schema, or catalog file was touched. No scratch reproduction artifact was
created that needed cleanup — every measurement in this document was produced by running the real,
unmodified `bridge` CLI against the two Continuum applications' own working trees (which are outside
this repository and were not committed to).
