# M8-I — Remaining route-boundary ownership audit

**Date:** 2026-08-21. **Baseline:** `c242ba6` (== `origin/main`, clean tree, confirmed before any
measurement). **Type:** measurement + architecture decision. No production code changed — every gate
in §16 failed, so this milestone is docs-only, like M8-G.

## Headline finding

Neither remaining blocker qualifies for implementation. **BRG2303** points at an "override system"
(`ui.OverrideRef`) that is real in the schema but **not implemented anywhere in the pipeline** — not in
the generator, not as a `bridge sync` command, not as a way for anything upstream of generation to even
produce one. **BRG2301** is not one problem: `diagnostics` and `platformSection` are structurally
unrelated objects requiring different verdicts, and grouping them (as the M8-H summary did, informally)
would have been a mistake. Neither can be resolved without a genuine new architecture decision. A
what-if experiment (temporary, uncommitted Continuum copies only) resolving both shows normalize
passing for the first time and generate reached for the first time — surfacing a large, mixed set of
already-known and newly-found gaps, none of which this milestone implements.

## 1. Fresh baseline

```
git status --short   → (clean)
git rev-parse HEAD    → c242ba64938be26cb217757283783126d7aa84e0
git rev-parse origin/main → c242ba64938be26cb217757283783126d7aa84e0
```

Fresh `bridge build` (not copied from M8-H's own numbers):

| | droid | mac |
|---|---:|---:|
| Analyzer errors | 0 | 0 |
| Normalize | fail: 1×BRG2303, 2×BRG2301 | fail: 1×BRG2303, 1×BRG2301 |
| BRG2305 | 0 | 0 |
| Generate reached | No | No |
| Files emitted | 0 | 0 |

Identical to M8-H's reported baseline. One aside, unrelated to this milestone's own scope: two
consecutive fresh `dart run bin/bridge_analyzer.dart` invocations against the *same*, unchanged source
produced 92 vs. 93 analyzer *warnings* (record count stable at 202 both times; the difference was in
`continuum_transport_flutter/src/file_system_transfer_storage.dart`'s own line numbers, which also
shifted between runs). Blocking diagnostics (errors, BRG2301/2303/2305) were stable across both runs;
only non-blocking warning line-attribution varied. Flagged, not investigated — outside this milestone's
scope and not blocking.

## 2. Complete remaining-site table

| App | Code | Argument | File:line | Source expression |
|---|---|---|---|---|
| droid, mac | BRG2303 | `onExportLogs` | `pairing_page.dart:427` (droid) / `:399` (mac) | `_exportLogs` (bare tear-off) |
| droid, mac | BRG2301 | `diagnostics` | `pairing_page.dart:429` (droid) / `:401` (mac) | `DiagnosticsInfo(connected: ..., peerName: ..., appVersion: '0.2.0', protocolVersion: protocolVersion, lastSeenMs: ..., uptime: DateTime.now().difference(_startedAt))` |
| droid only | BRG2301 | `platformSection` | `pairing_page.dart:436` | `NotificationFilterSection(settings: env.settings, knownPackages: _seenPackages.toList())` |

All three share one enclosing component (`_PairingPageState`/`PairingPage`), one boundary
(`Navigator.of(context).push(MaterialPageRoute(builder: (context) => SettingsPage(...)))`, inside
`_openSettings`), one destination (`SettingsPage`). **Not grouped by that alone** — §3 and §10 prove
they diverge from there.

## 3. BRG2303 — real source trace

```dart
Future<String> _exportLogs() async { ... }   // _PairingPageState's own method (M8-H's own trace)
...
onExportLogs: _exportLogs,                    // a bare tear-off — no closure, no wrapper
```

Raw UIR (post-M8-H): `bind.Expr{expr: logic.Ref{name: "_exportLogs", target: <real sig.Action id>}}`.
The action's own node: `sig.Action{writes: absent}` (M8-H — `writes` correctly omitted, not `[]`).

Normalized: N11's `classify()` (`n11_promote_cross_route_state.ts:387-403`) resolves the target,
finds the action, computes `writes = []` (empty, since the field is absent), and returns exactly the
branch reserved for this: `{kind: 'unpromotable', reason: 'no state that the compiler can name'}` →
**`BRG2303`**.

**Exact expression shape: a bare tear-off of a targeted, resolvable, write-nothing action.** Not a
closure, not a framework callback, not a service invocation wrapped in a lambda, not a transformation.
The reduction ladder (§7) confirms every *closure*-wrapped variant of the same call hits a *different*,
earlier refusal (N5, not N11) with a different reason string — this is the single simplest shape that
reaches N11's own `unpromotable` branch at all.

## 4. The override system — read completely

Searched every reference to "override system" in the codebase (comments, generated schema doc strings,
ADRs, M0 spike reports): `dart/bridge_uir/lib/generated/uir.dart`, `packages/uir/src/generated/uir.ts`,
`dart/bridge_analyzer/test/extraction_test.dart`, `docs/adr/0011-cross-route-state-promotion.md`,
`spikes/m0-compat-report/**`, `packages/generators/react/src/index.ts`.

**What it is, consistently, everywhere it's described:** a human-authored replacement for a subtree
the compiler could not model, keyed by a stable *anchor* (occurrence identity — ADR-17 ISSUE-6's third
tier), so that **regeneration does not clobber the human's hand-written code.** `ui.OverrideRef`'s own
schema description (`packages/uir/schema/l2.json`): *"A subtree a human owns. The generator emits an
import of the override instead of generated code, and `bridge sync` checks that the override's props
still match the Flutter side."*

Answering Phase 4 directly:

1. **What is an override?** A node (`ui.OverrideRef`) naming a subtree a human has taken over, with the
   props the generated call site would have passed.
2. **Who declares one?** A human, after generation, editing the emitted project directly at the
   anchor-keyed location — not the compiler, not this pass.
3. **Semantic promise:** the generator imports the human's file instead of emitting its own code for
   that subtree; `bridge sync` diffs the override's own prop signature against the Flutter side so a
   changed constructor is a visible diff, not silent drift.
4. **Framework-specific?** No — the mechanism (anchor-keyed, regeneration-preserving) is generic.
5. **Catalog-driven?** No — it is per-*occurrence* (anchor), not per-*type* (a catalog entry names a
   widget *type*; an override names one specific place in one specific program).
6. **Requires resolved identity?** Yes, in the sense that the anchor is derived from the resolved
   `ui.Component`'s own hierarchy — but the override's *own* declaration is a human artifact, not
   analyzer output.
7. **Can application methods participate?** Not applicable — an override is not "a method"; it replaces
   a *subtree*, keyed by where it sits in the render tree, not by resolving to a Dart declaration.
8. **Can closures participate?** Same answer — the question does not apply to what an override *is*.
9. **Preserves return values / async behavior / argument values?** Undetermined — `bridge sync` checks
   *prop signature* match, not runtime behavior; nothing in the schema or its description makes any
   claim about return-value or async-behavior preservation, because the override's *body* is entirely
   human-written and outside the compiler's model.
10. **Intended to cross route boundaries?** Nothing in its description restricts or extends it to route
    boundaries specifically — it is a general "human owns this subtree" mechanism.
11. **Semantic lowering, or diagnostic exception?** Neither, as built: **it is not built.**

**Confirmed unimplemented, exhaustively:**
- `packages/generators/react/src/index.ts`'s own header (`BRIDGE-STUB(M3)`): *"ui.Async, ui.SlotRef,
  ui.OverrideRef, logic.ClassDecl emission and the remaining widgets are later M3 tasks, and are
  diagnosed rather than guessed at."* Still true today — the generator has no code path that emits or
  consumes `ui.OverrideRef`.
- `bridge sync` does not exist as a CLI command (`bridge --help` lists `init, doctor, build, validate,
  analyze, generate, clean, inspect, graph, widget-tree, route-graph, signal-graph, normalize,
  diagnostics, explain, stats` — no `sync`).
- No ADR, spec, or architecture doc names a trigger mechanism — *what* turns an unmodelable construct
  into a `ui.OverrideRef` in the first place is not decided anywhere, and N11's own BRG2303 is an
  **error-severity, normalize-stage** diagnostic that stops the pipeline *before* generation is ever
  reached — so even a fully-built generator-side `ui.OverrideRef` consumer would never see this
  particular construct, because normalize refuses the whole document first. The two halves of the
  "override system" as currently built (an error that stops the pipeline; a schema node the generator
  cannot yet consume) do not connect to each other for this diagnostic's own trigger point.

**"There is an override table" is not what exists.** There is a named future capability, referenced by
comment in at least four places, entirely unbuilt. Rule 6 ("do not add an override merely because it
makes Continuum compile") and rule 7 ("must correspond to an existing architectural rule") are both
satisfied by *not* building toward this — the "existing architectural rule" is a stub note, not a
ratified mechanism.

## 5. Reduction ladder

Built `fixtures/apps/callback_probe/` (temporary — `RootScreen → MidScreen`, one real, `await`ed
`Navigator.push`), pub-get'ed, `flutter analyze` clean, run through the real `bridge_analyzer` +
`bridge build`. Deleted after evidence extraction; not part of the commit.

| Rung | Shape | Result |
|---|---|---:|
| C | direct write-less action tear-off (`_queryLogs`) | **BRG2303**, reason "no state that the compiler can name" |
| D | `() => _queryLogs()` | **BRG2303**, reason "a value the compiler has no id for" (different reason — N5, not N11's action branch) |
| E | `() async => _queryLogs()` | same as D |
| F | `(String x) => _queryWithParam(x)` | same as D |
| G | `() async => (await _queryLogs()).toUpperCase()` | same as D |
| H | `() async { await Future<void>.delayed(...); }` | same as D |
| I | multi-statement closure | same as D |
| J | `() => 42` (returns a primitive) | same as D |
| K | `() async => _queryLogs()` (returns `Future<String>`) | same as D |

**Every closure-wrapped shape, regardless of what it contains, hits the identical N5 refusal with the
identical reason text** — confirmed directly in `n11_promote_cross_route_state.ts:411-413`:
`if (expr['kind'] === 'logic.Lambda') return { kind: 'unpromotable', reason: 'a value the compiler has
no id for' };`, checked before any inspection of the closure's own body. **BRG2303 begins at the exact
point a value is either (a) a targeted action reference with an empty write set, or (b) any closure at
all that N5 declined to lift** — and `_exportLogs`'s real shape is case (a), the simpler of the two.
Rungs L (framework callback with an existing override) and N (cross-package identity) were not built:
L has no real override to compare against (§4); N is already proven by M8-H §16 for the *identity* half
of this exact shape (a write-less action in a local dependency resolves correctly) — orthogonal to
whether N11 can promote it, which it structurally cannot regardless of package.

## 6. Semantic-equivalence analysis

Can `_exportLogs` be replaced by an existing modeled declaration without losing observable behavior?
**No — checked against every listed criterion:**

- **Captured variables:** none beyond `this` (the method reads `_logBuffer`, an instance field — not a
  signal, not itself promotable).
- **Arguments:** none.
- **Return value:** `Future<String>` — the caller (`_SettingsPageState._exportLogs`, M8-H §2) uses it
  (`'Logs saved to ${await export()}'`). N11's promotion mechanism moves *signals and actions* into a
  synthesized store; it has no concept of a return value at all — a promoted action's own schema
  (`sig.Action`) carries no `returns` field (M8-H §14).
- **Async behavior:** `await`s twice; must remain async if ever represented.
- **Exceptions:** none thrown directly, but the *caller* wraps the call in `try`/`catch` — losing the
  ability to propagate a thrown exception would silently change behavior.
- **Invocation count:** called once per user tap — no invariant here N11 would violate, but nothing
  currently *proves* this either, since there's no path to representing the call at all.
- **Receiver identity:** implicitly `_PairingPageState`'s own `this` — the method's real work
  (`getApplicationDocumentsDirectory()`, `File(...)`) has no meaning detached from being invoked as an
  instance method in that scope, but is not itself state-dependent in the reactive sense.
- **Side effects:** file I/O and logging — neither is representable in the signal graph at all (they
  are not signal writes); nothing here is *lost* by refusal, because nothing here was ever going to be
  captured by promotion regardless of the write-empty finding.
- **Lifecycle dependence:** none found (no `mounted` check inside `_exportLogs` itself).
- **`BuildContext` dependence:** none.

**Not proof-safe.** There is no existing modeled declaration this reduces to, and N11's promotion
mechanism has nothing to move — this is not a gap in the promotion mechanism's implementation, it is a
value genuinely outside what "promote into a store" can mean.

## 7. BRG2303 ownership decision

**D — the current refusal is correct**, with the causal finding (§4) that the mechanism its own message
points to for resolution (an override) is not yet built. Not A (no working mechanism exists to already
own it). Not B in the narrow "needs one new semantic rule" sense — building the override system for
real (schema→trigger→generator→`bridge sync`) is a multi-part capability, not a bounded rule addition;
if pursued, it is its own ADR-scale milestone, not a same-milestone amendment. Not C (§6 proves no
existing declaration reaches it). Not E (the root cause — no state to promote — is exactly what the
diagnostic already, correctly, says).

## 8. BRG2301 — traced independently, per site

### 8.1 `diagnostics` — `DiagnosticsInfo`

```dart
class DiagnosticsInfo {
  const DiagnosticsInfo({
    required this.connected, required this.peerName, required this.appVersion,
    required this.protocolVersion, this.lastSeenMs, this.uptime,
  });
  final bool connected;
  final String? peerName;
  final String appVersion;
  final String protocolVersion;
  final int? lastSeenMs;
  final Duration? uptime;
}
```

- **Declared type / package:** `DiagnosticsInfo`, `continuum_ui_kit` (local dependency).
- **Construction:** inline, non-`const` at the call site only because `uptime:
  DateTime.now().difference(_startedAt)` is not a compile-time constant — every field is otherwise a
  primitive or a primitive-derived expression.
- **Mutability:** fully immutable — `const`-eligible constructor, every field `final`.
- **Fields:** `bool`, `String?`, `String`, `String`, `int?`, `Duration?` — every one primitive or
  trivially primitive-decomposable (`Duration` → an `int` of milliseconds, proven directly in §12's
  what-if edit).
- **Methods:** none — no behavior at all, a pure data carrier.
- **Reactive / store:** neither — not a signal, not `ChangeNotifier`-derived.
- **Serializable:** yes, trivially, field by field.
- **Destination usage:** `_SettingsPageState.build()` does `final d = widget.diagnostics;` then reads
  `d.connected`/`d.peerName`/etc. — **reads only, no method call, no mutation.**
  Confirmed by direct source read (`settings_page.dart:148` onward).
- **Identity:** does not matter — a freshly-recomputed `DiagnosticsInfo` with the same field values is
  behaviorally identical; nothing compares instances with `==`/`identical`.
- **Platform resources / callbacks / handles:** none.

### 8.2 `platformSection` — `NotificationFilterSection`

```dart
class NotificationFilterSection extends StatefulWidget {
  const NotificationFilterSection({super.key, required this.settings, required this.knownPackages});
  final SettingsRepository settings;
  final List<String> knownPackages;
  ...
}
```

- **Declared type:** `Widget?` at the `SettingsPage` parameter; the actual constructed type is
  `NotificationFilterSection`, a real `StatefulWidget` — already a genuine `ui.Component` in this
  program (confirmed against M8-F's own extraction).
- **Construction:** inline, `NotificationFilterSection(settings: env.settings, knownPackages:
  _seenPackages.toList())`.
- **Mutability:** the widget class itself is immutable (Flutter convention); its own `State` is
  separately mutable and created via `createState()` once mounted.
- **Fields:** `settings: SettingsRepository` (a service/repository — not primitive, not serializable),
  `knownPackages: List<String>` (primitive-serializable).
- **Reactive:** its *own* internal state is (`_overrides`, `_loading`), but that is internal to the
  component once rendered, not something the caller passes.
- **Store:** no.
- **Serializable:** **no** — `settings: env.settings` is a service/repository reference, categorically
  different from `diagnostics`'s all-primitive shape.
- **Destination usage:** `SettingsPage.build()` renders `widget.platformSection!` **directly as a
  rendered child** (`settings_page.dart:186-188`) — composition, not data consumption. Fundamentally
  different consumption pattern from `diagnostics`.
- **Identity:** does not matter for rendering per se, but the component's *own* internal state (once
  built) is genuinely stateful UI, not serializable data.
- **Platform/host resources:** none directly on the widget; its dependency (`SettingsRepository`) is
  backed by platform storage.
- **Callbacks:** none on the widget itself; internally it invokes `widget.settings
  .notificationOverrides()`/`.setNotificationOverride(...)` — service calls.
- **Handles/controllers/services:** yes — `SettingsRepository`.

**These are not the same kind of object crossing the boundary for the same reason.** §2's instruction
not to group sites without proof is honored: `diagnostics` is a data-carrying DTO; `platformSection` is
a widget subtree being passed as a composition prop. Grouping them under one verdict would have been
wrong.

## 9. BRG2301 — what it protects

ADR-11a (`docs/adr/0011-cross-route-state-promotion.md`): *"`Navigator.pushNamed(context, '/product',
arguments: product)` passes a live Dart object. A URL route carries an identifier, not an object
graph."* Its own motivating example, `product`, is an **entity with identity** — the deferred question
is explicitly *"which field is the identity and which loader re-derives the object… evidence
insufficient — deferred."*

Neither Continuum site is that shape. `DiagnosticsInfo` has **no identity field at all** — it is
stateless, computed, id-less data; ADR-11a's own deferred question ("which field is identity") does not
apply to it, because there is no loader question to answer — the values themselves, decomposed, *are*
the complete payload. `NotificationFilterSection` is not data at all; it is UI structure plus a service
dependency, and even on the intended web target, a URL cannot carry a live React element any more than
it can carry a live Dart widget — the constraint BRG2301 exists to enforce is fully real for this shape,
for a *different* reason than ADR-11a's own worked example (not "we don't know the id," but "there is
categorically nothing here that is data at all").

## 10. Value-object question

Per M7-N/M7-N (ADR-27): the compiler models `ChangeNotifier`/store-instance identity — it never
authorized constructing an arbitrary plain user class as a first-class UIR value. Verified directly
against both sites: `DiagnosticsInfo` is **not** `ChangeNotifier`-derived (`registry.isStoreBase`
requires exactly that lineage, confirmed by reading `signal_extractor.dart`'s own store-instance check,
unchanged since M7-N/M8-H); `NotificationFilterSection` is a `StatefulWidget`, likewise not a store. Per
the task's own instruction, **neither is routed through `app.StoreInstance`** just to silence the
diagnostic — that would misrepresent both: `DiagnosticsInfo` is not reactive state that "outlives a
component," it is a snapshot computed fresh on each navigation; `NotificationFilterSection` is not state
at all, it is UI.

**`DiagnosticsInfo` is the first real evidence found for a genuinely different, third category:** not a
store instance (M7-N), not a primitive (N1-N11's existing primitive path), not a live object with
identity (ADR-11a's own worked example) — a plain, immutable, id-less, fully-primitive-composed value
object. FlutterBridge has **no existing representation for this category.** Building one (a decision
about what such a value object becomes in UIR, how its fields cross a boundary, how the destination
reconstructs it) is a genuine, undecided architecture question — not a bounded implementation gap.

## 11. Object elimination — could a used primitive be promoted instead?

For `diagnostics`: yes, mechanically — `SettingsPage` reads only primitive fields off it (§8.1), and a
hand-edited what-if (§14) proves decomposing the object into six ordinary primitive route arguments,
reconstructing `DiagnosticsInfo` on the destination side from them, is syntactically and semantically
sound. **Not implemented**, per the task's own instruction: no existing pass performs `logic.New`
field-projection today (confirmed by re-reading N1–N11 in full across this and the preceding two
milestones — nothing decomposes an object construction into its constituent argument bindings). Adding
one would mean deciding, generally, *which* `logic.New` shapes are eligible (immutable? id-less? every
field itself primitive or recursively decomposable?) and how the destination-side reconstruction is
named and typed — a new normalization pass, not a projection this milestone can respond to point-blank.

For `platformSection`: no meaningful primitive to promote — the destination doesn't read a field off it,
it renders the whole subtree, and the subtree's own dependency (`SettingsRepository`) is not primitive
data to project in the first place.

## 12. Application-side vs. compiler-side

- **`diagnostics`: B** — the compiler *could* support this class of construct (plain, immutable,
  id-less, fully-primitive value objects) under a new, not-yet-designed decomposition architecture; it
  does not today, and this milestone does not design it.
- **`platformSection`: D** — the current diagnostic is correct, and Continuum's own source is the thing
  that would need to change: `SettingsPage` already renders `_Header` and other same-package widgets by
  constructing them internally; the architecturally consistent fix is for `SettingsPage` to construct
  `NotificationFilterSection` itself from primitive/service-reference props it already receives (exactly
  the pattern its own sibling props already use), rather than receiving a pre-built widget instance from
  the caller. "Real app uses it" does not make a widget-as-cross-route-prop pattern compiler-owned — Phase
  12's own instruction to be willing to conclude C/D is honored here.

## 13. False-coupling check

Real experiment, temporary/uncommitted Continuum copy only (`apps/android/_m8i_whatif_droid`, deleted
after use — never committed).

- **Does resolving BRG2303 alone expose/remove BRG2301?** No — with `onExportLogs: null` (the parameter
  is optional), the *same* 2 `BRG2301`s remained, unchanged, verbatim.
- **Does resolving BRG2301 alone expose/remove BRG2303?** No — with `diagnostics` decomposed to
  primitives and `platformSection: null`, the *same* `BRG2303` remained, unchanged, verbatim (after
  isolating an incidental, unrelated finding — §14).
- **Entirely independent — confirmed by direct experiment, not inferred from diagnostic ordering.**

## 14. Hypothetical what-if results

All edits temporary, in `/Users/srini/Zenthink/continuum/apps/android/_m8i_whatif_droid` +
`packages/_m8i_whatif_ui_kit` (copies), never committed, deleted after use.

1. **BRG2303 hypothetically resolved** (`onExportLogs: null`): normalize's *only* remaining failure is
   the 2 `BRG2301`s — confirmed independent (§13).
2. **BRG2301 hypothetically resolved** (`diagnostics` decomposed into 6 primitive params reconstructed
   inside `SettingsPage.build()`; `platformSection: null`): normalize's *only* remaining failure is
   `BRG2303` — **but only after isolating one incidental discovery**: the first attempt forwarded
   `protocolVersion` (a genuine, real `const String protocolVersion = '0.1.0';` declared in
   `continuum_protocol.dart`, a *different file in a different package*) and hit **BRG2305** — traced to
   raw UIR: `logic.Ref{name: "protocolVersion", type: {...}}`, **no `target`** field. A cross-file (here,
   cross-package) top-level `const` reference has no declaration-tier identity in extraction today,
   exactly the same shape M8-H found and fixed for write-nothing *methods* — but for top-level
   *variables*, unfixed, and misattributed to the same BRG2305 "forwarded parameter" bucket for a third,
   distinct reason (M8-G's `onExportLogs` misattribution was the first; this is a new, second instance
   of the same *pattern* — an untargeted `logic.Ref` reaching N11's `forwarded` case for a cause that
   has nothing to do with parameter forwarding). **Not fixed** — out of this milestone's scope (rule 9
   does not list it, and it is not literally BRG2303/BRG2301's own root cause) — reported as a finding
   (§18) for a future milestone. Substituting a literal (`'0.1.0'`) isolated the true BRG2301-only result.
3. **Both hypothetically resolved:** normalize **passes** (265 nodes) — the *first time in this
   milestone series* Continuum's real droid app has reached that point — and generate is reached for the
   first time too, immediately failing with **53 diagnostics across 7 codes** (`BRG3006`×28, `BRG3001`×15,
   `BRG3004`×12, `BRG3002`×10, `BRG3013`×4, `BRG3008`×1, `BRG3005`×1 — the last is the "N errors, nothing
   emitted" summary). The two most substantial, *not* artifacts of this milestone's own hand-edit:
   `BRG3008`/`BRG3013` — inline/imperative navigation lowering (`Navigator.push(MaterialPageRoute(...))`
   naming no route, `Navigator.of(...).push` needing `logic.Navigate`) — **matches M8-E's own,
   already-identified, still-open P1** ("mid-function awaited navigation"/imperative-push-lowering),
   not a new finding. `BRG3006`'s 28 sites are a wide, heterogeneous mix — several (`formatBytes`,
   `formatUptime`) are the **same cross-file top-level-function-reference gap** just found in step 2,
   recurring; others (`Theme.of`, `_isLast`, `_slides`, `ContinuumFeature.values`, various locals) were
   not individually traced — this milestone records the category, not a full new audit (out of scope;
   `just` a large, mixed "next layer" becoming visible for the first time, not a single next chokepoint).
   `BRG3001`/`BRG3004`/`BRG3002` are the same, already-well-understood "no UIR representation / generator
   cannot lower this shape" categories seen throughout M8-A through M8-H, now simply reached for the
   first time on Continuum's real, larger surface. **Caveat, stated plainly:** this build used a
   hand-decomposed `DiagnosticsInfo` and a nulled `platformSection`/`onExportLogs` — a synthetic stand-in
   for §10-§12's undecided real fixes, not a preview of what an actual implementation would produce; the
   *shape* of what's next (navigation lowering, cross-file top-level references, a long tail of
   already-known generator gaps) is real evidence, the *exact* 53-diagnostic count is not a number to
   plan against.

## 15. Implementation gate

| Condition | BRG2303 | BRG2301 (`diagnostics`) | BRG2301 (`platformSection`) |
|---|---|---|---|
| 1. Maps to an already-decided override semantic | **No** (§4 — unimplemented) | N/A | N/A |
| 2. No schema change required | N/A (fails 1) | **No** — a value-object representation is undecided | **Yes**, but fails 7 |
| 3. No new ADR rule required | N/A | **No** | **No** (application-side fix, not a compiler rule) |
| 4. Semantic equivalence structurally provable | **No** (§6) | Partial — mechanically provable, but *which* shapes qualify is undecided | N/A — not a promotion question |
| 5. Identity resolved, never name-inferred | N/A | N/A | N/A |
| 6. Existing negative cases remain refused | N/A | N/A | N/A |
| 7. Fix bounded to the proven root cause | N/A | **No** — needs a general decomposition pass | **No** — is an application refactor, not a compiler fix |

**All three fail at least one gate. M8-I is docs-only**, per the task's own Phase 15 instruction.

## 16. Diagnostic-quality audit

- **BRG2303:** wording ("no state that the compiler can name… an override must supply it") correctly
  identifies the construct as unsupported and does not blame the user's program. **Not changed** — the
  factual content is accurate; that the referenced mechanism is unimplemented is a roadmap gap, not a
  wording defect the message itself is responsible for disclosing.
- **BRG2301:** the shared suggested fix ("Pass an id and load from it") fits ADR-11a's own worked
  example (`product`, an entity) but fits **neither** real Continuum site precisely — `DiagnosticsInfo`
  has no id to load by (§9); `NotificationFilterSection` isn't data to load at all. **Not changed** in
  this milestone (docs-only; rewriting one diagnostic's advice to correctly cover two now-distinguished
  sub-cases is itself a small design decision, not a wording typo-fix) — **flagged** as a finding for
  whoever designs the value-object architecture (§10) or writes the application-side guidance (§12) to
  revisit.

## 17. Remaining blocker graph

```
BRG2303 (onExportLogs)  ─┐
                          ├─ independent (§13) ─→ both resolved (hypothetically) ─→ normalize passes ─→
BRG2301 (diagnostics)    ─┤                                                          generate reached ─→
BRG2301 (platformSection)─┘                                                          BRG3008/3013 (nav lowering, = M8-E's known P1)
                                                                                      BRG3006 ×28 (mixed; some = new cross-file top-level-ref gap)
                                                                                      BRG3001/3004/3002 (known "unsupported construct" categories)
```

## 18. Exact M8-J recommendation

No single next chokepoint — three independent, genuine architecture questions are now on the table, none
bounded enough for a same-milestone implementation:

1. **Design (not implement) a value-object representation** for `diagnostics`-shaped constructs — plain,
   immutable, id-less, fully-primitive-composed classes crossing a route boundary. This is the most
   evidenced, most clearly-scoped of the three (§8.1-§11 give a complete real worked example).
2. **Decide whether the override system (`ui.OverrideRef`) is worth building now**, given it is the
   named resolution path for BRG2303 and has sat as an M3 stub since early milestones — a real
   feasibility/design pass (schema is ready; trigger mechanism, authoring workflow, and `bridge sync` are
   not).
3. **The cross-file top-level-function/const reference gap** found incidentally in §14 (`formatBytes`,
   `formatUptime`, `protocolVersion`) recurs at real scale (multiple sites in the §14 generate-stage
   sweep) and is a narrow, well-understood, M8-H-shaped fix (give a cross-file top-level declaration a
   real target, mirroring M8-H's own `Symbols.action` pattern for a `Symbols.variable`/`function`
   equivalent) — **the closest thing to a "next M8-H" this audit found**, and the one this report
   recommends measuring first, since it is the only one of the three that looks bounded rather than
   architecture-scale.
