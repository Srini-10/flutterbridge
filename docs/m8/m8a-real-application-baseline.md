# M8-A — Real application baseline & blocker census

**Date:** 2026-08-20. **Baseline:** `0d9dbea1820c3379b894e981478d4ae800b11df0` (== `origin/main`, clean
tree, confirmed via `git status --short` / `git rev-parse HEAD origin/main` / `git log -5 --oneline`
before any measurement began).

This is a measurement/audit milestone. **No compiler, analyzer, generator, or runtime code was changed
while producing this document.** Where a severe gap was found, it is documented with its smallest
reproduction and left unfixed, per this milestone's own change policy.

## 1. Repository baseline

HEAD and origin/main both `0d9dbea1820c3379b894e981478d4ae800b11df0`, working tree clean. This is
M7-O's own final commit — M7 is formally closed, no code changed since.

## 2. Corpus / application metadata

**Continuum** (`/Users/srini/Zenthink/continuum`, HEAD `a7a519f9d48b560ffd1c87f018d1240059cdbc44`,
2026-07-17) is a real, git-controlled, open-source LAN-first Continuity-replacement app. It is a
monorepo with **no single application pubspec** — it has two Flutter application roots and five shared
Dart/Flutter packages, all wired by path dependencies:

| Project | Kind | `.dart` files | LOC |
|---|---|---:|---:|
| `apps/android/droid` | Flutter app (Pixel) | 8 | 1,516 |
| `apps/macos/mac` | Flutter app (Mac) | 4 | 959 |
| `packages/protocol` | Dart package (protobuf) | — | — |
| `packages/transport` | Dart package | — | — |
| `packages/transport_flutter` | Flutter package (platform channels) | — | — |
| `packages/ui-kit` | Flutter package (shared widgets) | 4 | 857 |
| `packages/pairing` | Dart+Flutter package (pairing/persistence) | — | — |

Both apps were built and measured independently, each as its own `bridge` project root (`source: "."`
inside `apps/android/droid` and `apps/macos/mac` respectively) — this matches how an external developer
would actually invoke the CLI (there is no single Flutter project encompassing the whole monorepo).

Toolchain: Dart SDK 3.13.0 (stable), Flutter 3.47.0 (stable channel).

**unichat**: not present anywhere in this environment (`find` for the name returned nothing). Stated
explicitly rather than substituted with a guess, consistent with M7-O's own finding.

**Other Flutter projects found alongside Continuum** (`/Users/srini/Zenthink/thangamagan` has a
`pubspec.yaml`): not previously used as a FlutterBridge corpus application in any prior milestone
record found in this repository, so it is out of this milestone's scope — noted for completeness, not
measured.

## 3. Public CLI results

Ran the same workflow an external developer would: `flutter pub get` → `bridge doctor` → `bridge init`
→ `bridge build`, for each app independently.

- `flutter pub get`: required first — `bridge doctor` correctly refused with `fail resolved packages`
  until it was run. Both apps resolved cleanly (Riverpod 2.6.1, SQLCipher/sqlite3, protobuf, and others
  — see §9).
- `bridge doctor`: green after `pub get`, both apps ("ready to build").
- `bridge init`: wrote a default `bridge.json` for both apps (`@bridge/gen-react`,
  `@bridge/widgets-material`, `typecheck: true`) — no edits needed.
- `bridge build` (`analyze` → `normalize` → `generate`, timed):

| Stage | droid | mac |
|---|---:|---:|
| analyze | 8,110 ms — ok | 7,908 ms — ok |
| normalize | 33 ms — ok, 127 nodes | 23 ms — ok, 109 nodes |
| generate | 11 ms — **fail** | 9 ms — **fail** |

Both builds fail at generate with hard errors — 0 files emitted for either app. `bridge validate`,
`npm/pnpm install`, `tsc`, and `next build` were not reachable for either app as a consequence (§10/§11).

## 4. Pipeline funnel

| Boundary | droid | mac |
|---|---|---|
| Flutter source → analyzable files | PASS (8 files) | PASS (4 files) |
| → raw UIR | PASS (81 records, 33 diagnostics, all warnings) | PASS (63 records, 9 diagnostics, all warnings) |
| → normalized UIR | PASS (127 nodes, 2 diagnostics) | PASS (109 nodes, presumed similarly clean — not separately re-inspected beyond the build summary) |
| → generator-accepted program | **FAIL** — 5 errors (`BRG3006`×1, `BRG3004`×4), rolled up as `BRG3005` | **FAIL** — 3 errors (`BRG3006`×1, `BRG3004`×2), rolled up as `BRG3005` |
| → files emitted | NOT REACHED | NOT REACHED |
| → npm/pnpm install | NOT REACHED | NOT REACHED |
| → tsc | NOT REACHED | NOT REACHED |
| → next build | NOT REACHED | NOT REACHED |
| → browser boot | NOT REACHED | NOT REACHED |
| → interactive application | NOT REACHED | NOT REACHED |

"Files emitted" and "application converted" are not conflated here: for both apps, generation itself
refuses outright (`generation reported N error(s)... nothing was written`) — there is no partial output
to mistake for a working conversion.

## 5. Diagnostic census

**By code, ranked by raw count** (analyze-stage, both apps combined):

| Rank | Diagnostic | Capability | Occurrences | Owner |
|---|---|---|---:|---|
| 1 | `BRG1302` | "Syntax has no UIR representation" (multiple distinct constructs share this code) | 40 (32 droid + 8 mac) | Analyzer (extraction) |
| 2 | `BRG1304` | Cross-package/workspace component reference in an inline route push | 2 (1 each) | Analyzer (route-graph extraction) |

Plus generate-stage: `BRG3006`×2 (1 each), `BRG3004`×6 (4 droid + 2 mac), `BRG3005`×2 (rollup, 1 each).
Plus normalize-stage: `BRG2101`×1 (droid only, a cascade expression).

**Raw ranking is misleading here — 23 of droid's 32 `BRG1302`s are one root cause.** Grouped by root
cause instead:

| Root cause | Diagnostics it produces | Occurrences (droid / mac) | Severity | Pipeline stage |
|---|---|---:|---|---|
| **A multi-statement `build()`-shaped method body (a helper method returning `Widget`, containing an `if`-chain, local variables, or a `switch`, rather than a single `return <expr>`) is extracted wholesale as `ui.Opaque` instead of a structured tree.** | `BRG3004` (when the opaque node is on a reachable render path) — normalize-stage `BRG2103` does **not** fire for this specific opaque reason (see §12) | 4 / 2 (generate-fail instances alone; §6 shows this is also why the formal widget census is nearly empty) | **Hard build failure** | extraction → generate |
| A `switch` statement on a private enum, with an empty (fallthrough) `case`, used as the above pattern's specific mechanism | `BRG3006` (`_Stage.loading` unresolved) | 1 / 1 | Hard build failure, same root cause family as above, one further wrinkle (fallthrough case) | extraction → generate |
| `static const Set<String>`/`Map` literal of plain (non-widget) values as a field initializer, one diagnostic per element | `BRG1302` ("collection element...") | 23 / 1 | Warning only, does not block build | extraction |
| `is`-type-check expression outside a widget tree | `BRG1302` ("is-check") | 3 / 1 | Warning only | extraction |
| Adjacent string literals (`'a' 'b'`) | `BRG1302` | 3 / 3 | Warning only | extraction |
| `collection-for`/`collection-if` inside a non-widget collection | `BRG1302` | 2 / 1 | Warning only | extraction |
| Cascade operator (`..`) | `BRG1302` (analyze) / `BRG2101` (normalize) | 1 / 1 | Warning only | extraction/normalize |
| A component from a different workspace package (`continuum_ui_kit`'s `SettingsPage`) pushed via an inline `MaterialPageRoute` builder | `BRG1304` | 1 / 1 | Warning only — the route edge is dropped from the route graph, N11 cannot see it, but this is reported, not silent | analyzer route-graph extraction |

**The single dominant root cause — multi-statement `build()`-shaped method bodies opaquing wholesale —
is the only one that hard-fails the build for both apps.** Every other root cause is a non-fatal warning.

## 6. Widget coverage

Measured by parsing both `uir.ndjson` documents in full (recursive walk, not a flat scan) for every
`ui.Element` node.

**The formal count is nearly empty, and that emptiness is itself the finding.** Only 2 `ui.Element`
nodes exist per app: the root `MaterialApp` (SDK, catalog-supported via the dedicated app-root lowering
path) and the app-defined `PairingPage` root component (excluded from the coverage denominator — it
becomes a `ui.Component`, not a catalog entry). Every other screen/widget class in both apps
(`PairingPage`'s own `_buildBody` content, `NotificationFilterSection`, `_CameraRationale`, mac's
`_ConnectedView`) never produces `ui.Element` nodes at all — its `build()`-shaped method has a
multi-statement body and is extracted as `ui.Opaque` (§5's dominant root cause), before any widget
inside it is ever seen.

| Scope | Formal instantiations (excl. app-defined) | Unique types | Catalog-supported | Unique-type coverage | Occurrence-weighted coverage |
|---|---:|---:|---:|---:|---:|
| droid | 1 (`MaterialApp`) | 1 | 1 | 100% | 100% |
| mac | 1 (`MaterialApp`) | 1 | 1 | 100% | 100% |

This 100% is **not** a meaningful coverage measurement — it is an artifact of near-total upstream
opaquing. A non-authoritative regex scan of the raw Dart source text trapped inside the opaque nodes
shows what is actually written there: `Text`, `SizedBox`, `Padding`, `Icon`, `Row`, `Column`, `Expanded`,
`Center`, `Scaffold`, `AppBar`, `IconButton`, `FilledButton`, `TextField`, `CircularProgressIndicator`
(all catalog-supported widgets, had they been reachable) alongside app-defined components
(`OnboardingPage`, `StagedClipBanner`, `TransferProgressList`, `MessageLogView`,
`PeerBatteryIndicator`) and one third-party widget (`DropTarget`, from `desktop_drop`, not in the
catalog). **This is illustrative only — it was never structurally parsed, so no prop/nesting/coverage
claim can be made from it.** It exists to show that the widgets Continuum actually uses are
overwhelmingly ordinary, already-supported Material widgets — the blocker is that extraction never
reaches them, not that the catalog is missing them.

`ui.Opaque` node counts: droid 4, mac 2 — all with `reason: "build body with statements"`. These account
for the majority of both apps' screen-level `build()`/build-helper methods.

**Do not compare this to the stale 56.5%/56.8% figure** — that number was never a Continuum measurement
at all (see §14).

## 7. Semantic capability census

Measured by grep across all `.dart` files in both apps' `lib/` and the relevant shared packages
(protocol, transport, transport_flutter, ui-kit, pairing — 49 files total), cross-referenced against
known FlutterBridge capability boundaries.

| Family | Real usage found | Classification |
|---|---:|---|
| Local state (`StatefulWidget`/`setState`) | 63 `setState` calls | **SUPPORTED** (dominant pattern) |
| Stores / `ChangeNotifier` | 0 | NOT USED |
| `ValueNotifier` | 0 | NOT USED |
| Riverpod (`ConsumerWidget`, `ref.watch`, `StateNotifier`, etc.) | 0 real consumption — `flutter_riverpod` is imported only to wrap the root in an unused `ProviderScope` | NOT USED in practice, despite being a declared dependency |
| Derived state | not separately measurable without reachable widget trees | NOT MEASURED (blocked by §5/§6's finding) |
| Callbacks | pervasive (button `onPressed`, etc., inside the opaqued bodies) | PARTIAL — present in source, unreachable to verify past extraction |
| async/await | 230 occurrences | **SUPPORTED** (heavily used) |
| `FutureBuilder`/`StreamBuilder` | 0 | NOT USED |
| Navigator operations | 4 files use `Navigator.` (inline `MaterialPageRoute` push, no named routes) | PARTIAL — inline push is supported per M7 (with the cross-package caveat in §5's `BRG1304`) |
| Named navigation (`pushNamed`, `onGenerateRoute`, `routes:`) | 0 | NOT USED |
| Overlays | not separately measured | NOT MEASURED |
| `mounted`/`context.mounted` | 0 | NOT USED (despite M7-J having implemented this) |
| Forms/controllers (`TextEditingController`) | 2 files | PARTIAL — present, unreachable to verify past extraction |
| Theme switching (`ThemeMode`) | 0 | NOT USED |
| Animations | 0 | NOT USED |
| Assets (`Image.asset`/`AssetImage`) | 0 | NOT USED |
| Lists/builders (`ListView.builder`) | 1 hit, in a barrel-export file — likely not real usage | NOT USED (effectively) |
| Slivers | 0 | NOT USED |
| Custom painters | 0 | NOT USED |
| Platform APIs (`MethodChannel`/`EventChannel`) | 9 files — battery, discovery, clipboard bridges | **UNSUPPORTED** — no catalog/analyzer awareness of platform-channel plumbing found |
| Plugins (`qr_flutter`, `hotkey_manager`, `desktop_drop`, `mobile_scanner`, `file_picker`, `flutter_foreground_task`) | present, see §8 | UNSUPPORTED — none in the catalog |
| Persistence/database (SQLCipher, `drift`, `sqlite3`) | present in `pairing` package | UNSUPPORTED — no web equivalent, no catalog/analyzer awareness |
| Networking | `StreamController`-driven transport, no `http`/`WebSocket` package usage found | PARTIAL — custom transport over `dart:ffi`/sockets, not a modeled pattern |
| Dependency injection | none beyond the unused `ProviderScope` | NOT USED in practice |

The most consequential finding here is not any single family — it is that **Continuum's actual state
pattern (`setState`) does not match the pattern FlutterBridge's store model is built around
(`ChangeNotifier`, ADR-11/ADR-27)**. Riverpod is a declared dependency but is not the load-bearing
pattern either. A real application does not need to use FlutterBridge's currently-modeled reactivity
mechanism at all to be otherwise convertible — `setState` is the plain-Flutter default, and it works
today (63 real occurrences, unblocked by anything found in this census) wherever extraction actually
reaches the code that calls it.

## 8. Dependency / package audit

Every non-SDK, non-dev dependency across both apps' `pubspec.yaml` and the five workspace packages:

| Package | Category | Visible to FlutterBridge? | Fatal or ignorable? |
|---|---|---|---|
| `cupertino_icons` | UI (icon font) | No | Ignorable |
| `flutter_riverpod` | State mgmt (declared, effectively unused — §7) | Only its `@riverpod` codegen annotation string, not `ProviderScope`/consumption | Ignorable in practice; `ProviderScope` itself is an unrecognized opaque widget if reached |
| `logging` | Pure Dart logic | No | Ignorable |
| `qr_flutter` | UI plugin | No (not in catalog) | Unmodeled, non-fatal to the rest of the app |
| `hotkey_manager` | Native platform plugin (macOS) | No | Unmodeled; no web equivalent — fatal for that feature only |
| `desktop_drop` | Native platform plugin | No | Unmodeled; fatal for that feature only |
| `path` | Pure Dart logic | No | Ignorable |
| `path_provider` | Native platform plugin | No | Unmodeled but load-bearing; non-fatal to compile |
| `mobile_scanner` | Native platform plugin (camera) | No | Unmodeled; fatal for the QR-scan pairing flow |
| `file_picker` | Native platform plugin | No | Unmodeled; fatal for that feature |
| `flutter_foreground_task` | Android-only platform plugin | No | Unmodeled; no web equivalent — fatal for that feature |
| `fixnum` | Pure Dart logic | No | Ignorable |
| `protobuf` (+ generated `.pb.dart`, 1,588 lines) | Codegen + logic | No | Likely fatal for the `protocol` package if ever reached — entirely opaque `GeneratedMessage` surface |
| `ffi` (`dart:ffi`, Noise handshake) | Native/platform | No | Fatal for that code path — no JS/web equivalent |
| `async` | Pure Dart logic | No (standard patterns likely handled generically) | Ignorable |
| `crypto` | Pure Dart logic | No (only FlutterBridge's own internal use of the package name was found, not catalog support) | Ignorable/low-risk |
| `flutter_secure_storage` | Native platform plugin (Keychain/Keystore) | No | Fatal — no browser equivalent |
| `drift` (+ `drift_dev`) | Persistence + codegen | No | Likely fatal for the `pairing` persistence layer — generated table/DB code entirely opaque |
| `sqlcipher_flutter_libs` | Native platform plugin | No | Fatal — no SQLCipher in a browser |
| `sqlite3` | Native/FFI | No | Fatal — FFI-based |
| `build_runner` (dev) | Codegen tool | Partial — generic "codegen hasn't run" diagnostics exist for dangling `.g.dart`/`.freezed.dart` parts, but nothing `drift`-specific | Non-fatal by itself; masks the real `drift` blocker behind a generic message |

**Internal workspace packages** (`path:` deps, not pub.dev): `continuum_protocol`, `continuum_transport`,
`continuum_transport_flutter`, `continuum_ui_kit`, `continuum_pairing` — layered (`pairing` →
`transport_flutter`/`transport`/`protocol`; `ui-kit` → `protocol`/`pairing`). FlutterBridge's analyzer
resolves symbols across these via the Dart analyzer's element model (e.g. `SettingsPage`'s type resolves
fine), but does not walk into their source to model their own widget/logic trees independently — which
is why the cross-package `SettingsPage` push produces a warning (dropped route edge, §5) rather than a
crash: the analyzer correctly identifies it as "a component this project does not declare," not as an
unresolved symbol.

**Net finding: none of these platform/persistence/codegen dependencies are reachable in either app's
own `lib/` analysis today, because analysis is scoped to the app's own source tree.** They matter for
*future* work (a real conversion of Continuum's actual pairing/persistence/platform features would need
answers for them), but they did not contribute to either generate-stage failure in this measurement —
the failure is entirely inside the apps' own `lib/pages`/`lib/notifications` code (§5).

## 9. Generated output audit

**Not applicable — 0 files were emitted for either app.** Generation fails outright at the `BRG3005`
rollup stage before any file is written. There is no generated output to inspect for TODOs, stubs,
placeholders, duplicate components, lost props, or unresolved identifiers.

## 10. TypeScript / Next build

**NOT REACHED for either app.** No output exists to install, typecheck, or build.

## 11. Browser validation

**NOT REACHED for either app.** The exact pipeline boundary preventing it: generation itself (§4's third
funnel boundary) — both apps refuse before any file is written, so there is nothing to install, no
`tsc` to run, no `next build` to attempt, and no page to boot.

## 12. Silent failure audit

Checked specifically for: emitting code despite lost information, silently dropped props/callbacks/
children, unresolved symbols reaching output, dropped lifecycle behavior, unsupported constructor
arguments consumed without a diagnostic.

**No silent-wrong-code defect was found.** The compiler's stated design — prefer refusal over wrong
output — held throughout this measurement: `ui.Opaque` unconditionally errors (`BRG3004`) the moment it
is reached during emission (`packages/generators/react/src/internal/emit/component.ts:936-946`); there
is no code path where an opaque node is silently rendered or dropped without a diagnostic. Both apps'
build failures are loud, not silent — 0 files emitted, explicit error codes, explicit reasons.

**One diagnostic-timing gap was found, smaller than a silent-correctness defect but worth recording
precisely, per this milestone's instruction to document a severe finding and stop rather than fix it.**
N3 (`expand-builders`, `packages/compiler/src/internal/passes/n3_expand_builders.ts:33`) reports `BRG2103`
at normalize time for an opaque node whose `reason` matches `/builder|for-element|spread/i`. The dominant
root cause found in this audit — a multi-statement `build()`-shaped method body — is tagged with reason
`"build body with statements"`, which does **not** match that regex (it contains "build", not
"builder"). The practical effect: a developer converting Continuum gets **no warning at normalize time**
for the single most common real blocker in this corpus — the first diagnostic they see is the hard
`BRG3004` failure at generate. This is a diagnostic-timing gap, not a correctness defect (the build still
correctly refuses rather than emitting wrong code) — reported here for whichever milestone addresses the
extraction gap itself (§15), not fixed in this audit.

**Smallest reproduction of the dominant blocker**, for whoever picks up §15's recommendation:

```dart
class Foo extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Scaffold(body: Center(child: _body()));

  Widget _body() {
    if (someCondition) {
      return const Text('a');
    }
    return const Text('b');
  }
}
```

`build()` extracts structurally (single `return <expr>`); `_body()` does not (an `if` before its final
`return`) and becomes `ui.Opaque{reason:"build body with statements"}` the moment it is inlined into
`build()`'s tree — reproducing the exact shape both Continuum apps hit, without any of Continuum's own
domain code.

## 13. Comparison against M5-A

M5-A's own report (`docs/m5/m5a-large-application-validation.md`) was reconstructed rather than copied
from. Its methodological scope differs from M8-A's in one material way, stated here rather than
smoothed over: **M5-A measured a combined "app + `ui-kit`" tree as one 7-file, 2,228-LOC unit**
(`apps/macos/mac` plus the shared `ui-kit` package analyzed together); **M8-A measures each Flutter
project root independently** (the way `bridge` actually scopes a project, and the way an external
developer would run it), with `ui-kit` reached only via cross-package symbol resolution, not as directly
analyzed source. The two file/LOC counts are therefore not directly comparable — Continuum's own
structure has also changed substantially since M5-A (2026-07-19): the `notifications/` subsystem and
the Android app's foreground-service/file-picker features did not exist in M5-A's 7-file measurement.

| Metric | M5-A (mac, combined w/ ui-kit) | M8-A (mac, app only) | Change |
|---|---:|---:|---:|
| Analyzer errors (before → after) | 0 → 0 | 0 (fresh) | Unchanged — Continuum was never analyzer-broken |
| Generator errors (before → after) | 42 → 23 | 3 (fresh) | **-87% vs. M5-A's own end state** |
| Files emitted | 0 | 0 | Unchanged — still fails to emit |
| tsc reached | No | No | Unchanged |
| Browser reached | No | No | Unchanged |
| Widget coverage figure cited | 56.8% (never a Continuum measurement — see below) | Not meaningfully computable (§6) | Not comparable |

**Why the improvement occurred:** M5-A's 23 residual Continuum generator errors were never broken down
by owner in its own report (its per-owner breakdown was for unichat, not Continuum). Given the M7-A
through M7-N chronology (navigation, mounted, Duration, promoted stores, local store instances, Material
theme fallback) all landed between M5-A and this measurement, and given M8-A's fresh 3-error state is
concentrated entirely in the single "multi-statement build-body" root cause (§5) rather than spread
across navigation/theme/store gaps, the plausible explanation is that M6/M7's navigation, theme, and
store work closed most of M5-A's 23 errors — the ones still open today are a different, extraction-level
gap that no M6/M7 milestone targeted.

**The 56.5%/56.8% figure must not be reused as a Continuum number.** It was never a Continuum
measurement at all — it comes from M4-I's `packages/generators/react/tests/corpus.test.ts`, an
occurrence-weighted scan of pre-captured `wonderous`/`compass_app` widget instantiations against
`WIDGET_MAP`. M5-A itself states this explicitly ("Corpus coverage is 56.8%, unchanged by M5-A, because
M5-A added no widgets") — it was already a citation of an unrelated, unmoved metric even in M5-A's own
report, not a Continuum result.

## 14. Prioritized blocker table

| Tier | Blocker | Impact reasoning |
|---|---|---|
| **P1** | Multi-statement `build()`-shaped method bodies extracted wholesale as `ui.Opaque` instead of a structured tree (§5, §6, §12) | Hard build failure for 2/2 real applications measured; the only root cause that blocks generation entirely; also the reason the formal widget census is nearly empty — this single gap suppresses visibility into everything else a real app does |
| P2 | `switch`-statement-on-enum branching specifically, including an empty-fallthrough `case` (`BRG3006`'s specific unresolved-reference shape) | A sub-case of the P1 gap; worth tracking separately because even a full "if/local-var" extraction fix may not automatically cover N-way `switch` branching (open schema question, §15) |
| P3 | `static const` collection-of-primitives field initializers reported per-element (`BRG1302`, 24 of the 40 raw diagnostic count) | Warning only, does not block build; a plain Dart data constant, arguably legitimately out of a UI compiler's scope |
| P3 | Cross-workspace-package component reference in an inline route push (`BRG1304`) | Warning only; drops one route edge, correctly reported, not silent |
| P4 | Platform channels, native plugins (QR/hotkey/drag-drop/scanner/file-picker/foreground-service), `drift`/SQLCipher/`sqlite3` persistence, `protobuf`-generated code, `dart:ffi` | Intentionally out of scope for this milestone's recommendation — none of these are reachable in the app's own `lib/` analysis today, and none contributed to the actual build failures measured (§8) |
| P4 | Riverpod, `ChangeNotifier`, `mounted`, animations, slivers, custom painters, assets, named routes, `FutureBuilder`/`StreamBuilder`, theme switching | NOT USED in this corpus (§7) — no evidence either way from this measurement; already-known gaps (`ui.Async`, `themeMode`, multi-hop) remain independently deferred per M7-O, unaffected by this audit |

No P0 (silent wrong-code) blocker was found (§12).

## 15. Exact M8-B recommendation

**Root cause:** Dart extraction only structurally decomposes a `build()`-shaped method whose body is a
single `return <expr>`. Any other shape — an `if`-chain before a final `return`, a local variable
declaration, or a `switch` statement — is extracted wholesale as `ui.Opaque{reason:"build body with
statements"}` before any widget inside it is ever modeled.

**Occurrence count:** the sole cause of both real applications' hard build failures (5 errors / droid, 3
errors / mac, §5); the reason 4 of droid's 5 `ui.Component`-worthy render bodies and 2 of mac's 3 never
produced a single `ui.Element` (§6); independently corroborated by M7-O's unrelated finding that
FutureBuilder's `builder:` callback body hits the identical extraction limit under a different label
(`"builder body with statements"`) — this is not a new discovery, it is the same general gap M7-O already
named as "a general, pre-existing limitation, not FutureBuilder-specific," now shown by a fresh,
independent, real-world corpus to be the dominant blocker overall, not a narrow edge case.

**Affected pipeline stage:** extraction (`dart/bridge_analyzer/lib/src/session/extract/`, most likely
`statement_extractor.dart`'s handling of a widget-returning method's statement list) — upstream of N2's
`ui.Cond` consumption, upstream of N3/N4, upstream of the generator.

**Expected coverage/build improvement:** both measured real applications currently fail to emit a single
file. Closing this gap for the `if`-chain/local-variable case alone would very likely take both apps past
generation into `files emitted`; the `switch`-statement case (§14's P2) may need separate design work and
should not block shipping the `if`/local-variable case first.

**Owning subsystem:** the Dart analyzer's extraction layer.

**Schema/ADR work required:** **partially, and this is the open question M8-B must resolve before
implementing, not before recommending.** `if`-chain-then-return and a local variable then a `return`
almost certainly fit the existing `ui.Cond`/binding-node vocabulary already proven for FutureBuilder's
body shape reasoning (M7-O's ui.Async finding cites N2 already guaranteeing a `ui.Cond` tree exists once
extraction produces one) — likely no new schema construct. An N-way `switch` on an enum, however, may
need either a new `ui.Switch`-shaped construct or a decomposition into nested `ui.Cond`s that loses the
"this is an exhaustive enum switch" fact — this is a genuine design decision, not yet resolved here, and
M8-B's own first phase should scope exactly which of the two (if-chain, or if-chain-plus-switch) it is
taking on before committing to an ADR.

**Why it outranks every alternative:** every other blocker found in this audit is either (a) a
non-fatal warning that does not block a build (§5's other root causes), (b) unreachable in either
app's own analyzed source today regardless of any UI-extraction fix (§8's platform/persistence/codegen
dependencies), or (c) not used at all in this corpus and already independently tracked as deferred by
M7-O (`ui.Async`, `themeMode`, multi-hop). This is the only blocker that is simultaneously P1-severity,
confirmed in 2 of 2 real applications, and structurally upstream of nearly everything else this audit
tried and failed to measure (§6's widget coverage, most of §7's semantic census) — fixing it does not
just unblock Continuum, it very likely unblocks *measuring* Continuum and any future real corpus
application correctly for the first time.

## 16. Change policy confirmation

This milestone changed **documentation only** — `docs/m8/m8a-real-application-baseline.md` (new). No
compiler, analyzer, generator, or runtime source file was modified. `git diff --check` reports no
whitespace errors (docs-only diff). `just ci`/`just determinism` were confirmed green earlier in this
same session at this exact, unchanged `HEAD` (M7-O's own Phase 10, `0d9dbea`) and are cited rather than
re-run redundantly against unchanged code, per the instruction not to claim post-change executable
validation for a docs-only change and not to re-run expensive gates without cause.
