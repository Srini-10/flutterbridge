# M8-P — Top-level `FieldDecl` generator lowering

**Date:** 2026-08-22. **Baseline:** `9d735a4` (== `origin/main`, clean tree, confirmed before any
change). **Type:** diagnostic correction, implemented. Gate A (structural diagnostic correctness)
passes and ships, mirroring M8-L's own `FunctionDecl` fix exactly. Gate B (full lowering) was measured
in full — a narrow, provably-sound subset exists — but **not implemented**, because real Continuum
evidence shows it would resolve zero real sites: both of the two motivating cases fail for reasons a
`FieldDecl` lowering fix would not touch.

## Headline finding

The mechanism M8-L already proved (a targeted reference to a real declaration must not be reported as
"not declared") applies to `logic.FieldDecl` exactly the way it applied to `logic.FunctionDecl` — same
structural check, same code shape, same diagnostic family. That much was expected and confirmed. What
was not expected, and only came from measuring the *real* corpus rather than assuming the fix's own
motivating examples would benefit: neither `protocolVersion` (M8-J's own case) nor `_log` (M8-O's own
case) is actually fixed by giving `logic.FieldDecl` a lowering. `_log`'s initializer constructs a
third-party class (`Logger(...)`) that `logic.New` already, correctly refuses on its own, unrelated
terms; `protocolVersion`'s one real reference is a route-boundary argument N11 classifies *before* the
code this milestone could change is ever reached. Both facts were found only by tracing each site to its
real source line, not by reading a diagnostic count. This is exactly the outcome the milestone's own
framing anticipated as valid — Gate A ships on its own merits; Gate B is investigated fully and declined
on real evidence, not implemented merely because a synthetic subset could theoretically be made to work.

## 1. Checkpoint

```
git fetch origin && git checkout main
git status --short        → (clean)
git rev-parse HEAD          → 9d735a44abb04ca85a4b434708bb37109416fcfe
git rev-parse origin/main   → 9d735a44abb04ca85a4b434708bb37109416fcfe
```
`pnpm --filter @bridge/gen-react test`: 247/247 (20 files), fresh baseline.

## 2. Real Continuum FieldDecl sites, traced to source

Fresh whatif measurement (mac; method unchanged from M8-N/M8-O — a disposable copy, `DiagnosticsInfo`
decomposed to primitive parameters to clear the unrelated, out-of-scope `BRG2301` blocker, deleted after
measurement) found exactly **two** distinct top-level declarations reaching the generator with a real
`logic.FieldDecl` target, both already named in M8-J/M8-O:

- **`_log`** (`apps/macos/mac/lib/pages/pairing_page.dart:20`, `final _log = Logger('Pairing');`) —
  reachable, post-M8-O, via `_announceRevocation`'s own now-discovered call chain. Traced directly: its
  `target` resolves to a real `logic.FieldDecl`, confirmed live in the normalized document
  (`0be07294759f2237` → `94e73b88d43c5b05`, `kind: logic.FieldDecl`).
- **`protocolVersion`** (`packages/protocol/lib/continuum_protocol.dart:22`,
  `const String protocolVersion = '0.1.0';`) — M8-J's own motivating case. Its **only** real reference in
  either app (`grep`-confirmed, both `pairing_page.dart`s) is `diagProtocolVersion: protocolVersion,`
  inside a `SettingsPage(...)` construction passed to `Navigator.push` — a **route-boundary argument**,
  not an ordinary expression position.

No other `logic.FieldDecl`-targeted `BRG3006` site was found in either app's current diagnostic
population (cross-checked against every listed `BRG3006` message and its resolved target kind, §4).

## 3. Minimal reproduction

Real fixture (temporary, deleted after evidence extraction):

```dart
const String greeting = 'Hello';
class Example extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Text(greeting);
}
```

1. UIR node: `logic.FieldDecl`.
2. Id: yes, real.
3. Symbol-derived: yes — `Symbols.variable('greeting')`, unconditional, since M1 (confirmed unchanged in
   `declaration_extractor.dart`'s `TopLevelVariableDeclaration` case — this predates M8-J; M8-J only
   fixed the *reference* side).
4. `logic.Ref.target == greeting`'s own id: yes.
5. Normalization preserves it: yes, byte-identical (no pass touches a `logic.FieldDecl` or an already-
   targeted reference to one).
6. Generator, before this milestone: falls through every existing check (`logic.EnumDecl`,
   `logic.FunctionDecl`) to the generic `missingCapabilityOf`/`UnresolvedReference` fallback.
7. Diagnostic: `BRG3006`, `` `greeting` is not declared in this program ``.
8. Purely missing generator consumption — confirmed, identity was never the question.

Then `final String greeting = 'Hello';` — **identical raw shape**: same `logic.FieldDecl`, same
`isFinal: true`. This is the first concrete evidence for §9: **the extractor does not distinguish
`const` from `final`** (§8).

## 4. Reduction ladder (real Dart, one comprehensive fixture)

Built `fixtures/apps/m8p_probe/` + `fixtures/packages/m8p_probe_dep/` (temporary, deleted after
evidence extraction) — every rung run through the real analyzer.

| Rung | Shape | `isFinal` | Initializer kind | Target result | Notes |
|---|---|---|---|---|---|
| A–D | `const` String/int/double/bool | `true` | `logic.Lit` | sound | — |
| E | `const` null | not separately tested | — | — | subsumed by nullable-field reasoning (§ below) |
| F | `final` primitive literal | `true` | `logic.Lit` | sound | **byte-identical shape to `const`** — confirms the conflation (§8) |
| G | `const` derived from another `const` (`constPrimitive + '!'`) | `true` | `logic.Binary` | sound, **and the nested `Ref` inside the initializer is itself targeted** | dependency edge is the *same* mechanism, no separate graph (§12) |
| H | `final` derived from a `const` | `true` | `logic.Binary` | sound | same shape as G |
| I | same-file reference | — | — | sound | — |
| J | cross-file, same-package | — | — | sound | — |
| K | cross-package (local dependency) | — | — | sound | M8-F/M8-J's own mechanism, unchanged, reused as-is |
| L | import-prefix reference (`dep.depConst`) | — | — | sound | — |
| M | two same-name fields, different libraries (`sameName` in the app and in the dependency) | — | — | **two distinct ids, two distinct targets** | no collision, confirmed live |
| N | top-level **mutable** variable (`var mutableVar = 'mutable';`) | **absent** | `logic.Lit` | sound (reads still resolve) | **structurally distinguishable from const/final by the absence of `isFinal`** — this is the one place the schema *does* draw a line (§8, §13) |
| O | `late` variable, no initializer | absent | none | n/a (never referenced in the fixture; excluded by the same mutability check as N regardless) | — |
| P | nullable field, no initializer | absent | none | n/a, same as O | — |
| Q | object-valued `const` (`const List<String> constList = ['a', 'b'];`) | `true` | `logic.ListLit` | sound | elements are literals, structurally pure |
| R | object-valued `final`, constructor call | not fixtured directly — `_log`'s own real shape (§2) covers this exactly: `final _log = Logger(...)`, a third-party constructor call | `true` | `logic.New`/`logic.MethodCall`-shaped | sound identity, **initializer not purely representable** (§9) | — |
| S | field initialized by a function call (`final finalFromCall = computeGreeting();`) | `true` | `logic.Call` | sound, **and the call's own callee is itself a targeted `logic.Ref` to a `logic.FunctionDecl`** | inherits M8-L's own still-unimplemented `FunctionDecl` lowering gap — correctly, not a new problem |
| T | field with an unsupported initializer (a cascade, `(StringBuffer()..write('a')..write('b')).toString()`) | `true` | `logic.MethodCall` wrapping a `logic.OpaqueExpr` (`BRG1302`, "cascade") | sound identity; **initializer genuinely opaque** | proves the existing opaque-expression refusal composes correctly if reached (§9) |
| U | field referenced from render | — | — | sound | — |
| V | field referenced from an action body | — | — | sound | — |
| W | field referenced from within another top-level declaration's own initializer | — | — | sound | = rung G/H |
| X | unused top-level field | — | — | n/a — correctly never reached by anything | not emitted, not diagnosed — matches every other unused declaration already in the system |

Real `bridge build` on the full fixture, **after** this milestone's own fix: **every one of the 16
distinct reference sites above reclassifies from `BRG3006` to `BRG3013`, uniformly** — zero `BRG3006`
remain in the fixture (§16).

## 5. FieldDecl schema semantics — read directly, not assumed

`packages/uir/schema/l1.json`'s `FieldDecl`: `{name, type, initializer?, isFinal?, isStatic?}`,
`additionalProperties: false`. Answering §8 explicitly:

- **Does FieldDecl distinguish `const` from `final`? NO — confirmed at the extraction source, not
  merely absent from the schema.** `declaration_extractor.dart`'s `TopLevelVariableDeclaration` case:
  `` if (node.variables.isFinal || node.variables.isConst) 'isFinal': const RawLiteral(true); ``. Both
  Dart keywords collapse to the identical `isFinal: true` field. This is the single most consequential
  finding for Gate B (§9).
- Is the initializer represented? Yes, structurally, as an ordinary `Expr` — reusing the whole existing
  expression grammar, nothing new.
- Is type represented? Yes, `TypeRef`, unconditional.
- Is `late` represented? **No separate flag** — a `late` variable simply has no `initializer` at
  extraction time and no `isFinal`, indistinguishable at the schema level from an ordinary uninitialized
  `var`. Immaterial to this milestone: both are already excluded by the mutability gate (§9).
- Is static/top-level distinction represented? Yes — `isStatic: true`, set unconditionally for every
  top-level variable (a static CLASS field, `Constants.value`, is a structurally *different*,
  content-hashed node per M8-J §9 — out of this milestone's scope, unaffected).
- Is declaration ownership represented? Yes, via the symbol's own path component (`var:<path>#<name>`),
  unchanged since before M8-J.
- Can references point to it? Yes — `logic.Ref.target`, already sound (M8-J).
- Can initializer dependencies be represented? Yes — as an ordinary nested `logic.Ref` inside the
  initializer tree, already targeted, no separate mechanism (§4 rung G, §12).
- Can initializer side effects be represented? The initializer expression tree can contain a
  `logic.Call`/`logic.New`/`logic.MethodCall`, which *could* have side effects in principle — but nothing
  in the UIR states whether a given initializer *actually* does. This is exactly why Gate B's own safe
  subset (§9) is restricted to expression *kinds* that are structurally incapable of one (literals and
  compositions of them), not to a semantic "no side effects" flag that does not exist.
- Does the generator have an appropriate module scope for declaration emission? **Not yet built** — see
  §11; this is real, if bounded, missing scaffolding, not merely an oversight.

## 6. Identity gate

`targeted Ref.target == FieldDecl.id`, proven for **every** rung in §4 that reaches a real declaration —
same-file, cross-file, cross-package, same-name-different-owner, referenced-from-render,
referenced-from-action-body, referenced-from-another-declaration's-own-initializer. All via the existing
`Symbols.variable`/`variableIn` + `_topLevelTarget` machinery M8-J already built and this milestone did
not need to touch. **PASS**, unconditionally — this was never in doubt after M8-J, and this milestone's
own fresh measurement (§2, §4) confirms it holds for every shape actually reachable in real Continuum
source too, not merely in a synthetic ladder.

## 7. Gate A result

**PASS.** Target resolves to a real `logic.FieldDecl` (§6); the generator, before this change, reported
it as `BRG3006` unconditionally (§3, §16's "before" column). Implemented: `expression.ts`'s `logic.Ref`
case gains a structural check, `declaration['kind'] === 'logic.FieldDecl'`, immediately after the
existing `logic.FunctionDecl` check it mirrors exactly — same `UnsupportedCapability` diagnostic
(`BRG3013`), same "the declaration is real; the lowering is missing" framing, same refusal to key on
`name`. Nothing about mutability, initializer shape, or module ownership is inspected by this check —
every `logic.FieldDecl` target, regardless of what it is, reclassifies uniformly. This is deliberate:
Gate A is a claim about *diagnostic honesty* ("this is not an unresolved reference"), not a claim about
*supportedness of any particular shape* — narrowing it by initializer kind would require exactly the
Gate B analysis this milestone declines to build infrastructure for (§9–§11), and would produce an
inconsistent, partially-honest diagnostic depending on shape for no real benefit.

## 8. Object-identity / module-ownership analysis (for Gate B)

Traced `pipeline.ts`'s `generate()` and `component.ts`'s own module-assembly code, mirroring M8-F's
established `componentModules` pattern (a `ReadonlyMap<anchor, {module, name}>`, built once before any
component is emitted, giving a cross-file component reference somewhere real to import from). Answering
§11 directly:

- **Which module should own a top-level `FieldDecl`?** By source-file anchor, the same way a component
  already is (`componentModules`'s own keying) — one generated "declarations" module per Dart file that
  declares one or more lowerable fields, mirroring the Dart file's own boundary.
- **If two components use the same declaration, emitted once?** Yes, necessarily — both would `import`
  from the same generated declarations module; nothing here would duplicate it.
- **Cross-file/cross-package imports?** The same relative-vs-package-URI distinction
  `componentModules`/`Symbols.pathOf` already resolve — no new resolution rule needed, only a new
  *consumer* of the existing one.
- **Does current generator preserve source-module boundaries?** Yes, exactly this way, for components —
  the precedent exists and is directly reusable in shape.
- **Is there already a declaration-emission mechanism to reuse?** Not for a bare value at module scope —
  every existing "hoisted declaration" (`useSignal`, `useRouter`, a lifted action) is emitted *inside* a
  component function, not at the top of a standalone module. A module-level, file-scoped, non-component
  export is a genuinely new emission shape, even though the *lookup* mechanism (`componentModules`'s own
  pattern) is not.
- **Small bounded extension, or new architecture?** **Bounded, but real** — a new
  `EmitScope.fieldModules`-shaped map (mirroring `componentModules`'s own construction exactly), a new
  per-source-file "declarations" module writer, and — because a field's initializer can reference another
  field (§4 rung G) — a deterministic emission order across possibly-many such declarations within one
  generated module. None of this requires a schema change, an ADR, or new runtime semantics; all of it is
  genuinely unbuilt scaffolding, not a a two-line diff.

Not built. Explicitly not required for Gate A (§7), and — per §14 — not justified by any real corpus
evidence for Gate B either.

## 9. Mutability boundary and the safe-subset proof

**The critical distinction this milestone's own instructions anticipated (§9) is real and confirmed at
the extraction source (§5), not merely a documentation gap.** `const` and `final` are indistinguishable
in the UIR; only "immutable" (`isFinal: true`) vs. "mutable" (`isFinal` absent) is representable, and the
absence case is unambiguous and already, correctly excluded by construction — a mutable top-level
variable's own read still carries a sound `target` (§4 rung N), but this milestone's own Gate A change
does not special-case it any differently, and Gate B (not implemented) would need to refuse it
explicitly, by the identical `isFinal !== true` check, before ever considering lowering — **no fixture
found any risk of `mutableVar` being silently treated as immutable**, since Gate B was never implemented.

Because `const`/`final` cannot be distinguished, the only lowering that is safe *regardless* of which one
a given declaration actually is, is one whose safety does not depend on the distinction at all: an
initializer that is **structurally incapable of a side effect or an exception**, checked recursively —
`logic.Lit`, `logic.ListLit`/`logic.MapLit` (if present) composed of the same, `logic.Binary`/
`logic.StringInterp` composed of the same, and `logic.Ref` to another declaration that is *itself* in
this same category (§4 rung G/H, proven live). Evaluating such an expression eagerly (JS module-load
time) or lazily (Dart's own `final` semantics) is observably identical: no side effect exists to reorder,
and no exception the initializer alone could throw. This is a real, provable, narrow subset — but see
§14: it does not cover either real Continuum site.

## 10. Evaluation-count / object-identity analysis

For the narrow safe subset (§9), proven by construction rather than by a fixture, since the subset is
defined precisely to make this trivial: a module-level `export const x = <pure literal expression>;` is
evaluated exactly once, at module load, and every importer reads the *same* binding — the identical
guarantee Dart's own `const` (compile-time-canonicalized) and `final` (evaluate-once, memoize) both
already provide for this class of initializer. Two components importing the same declaration observe the
same value and, for an object-valued case (`constList`), the same object reference — proven for
`logic.ListLit` by the ECMAScript module specification's own single-evaluation guarantee for a `const`
binding, not by anything this milestone had to build. Not implemented, so not additionally proven by a
running fixture — this is the theoretical soundness argument the "if Gate B passes" phases would need,
recorded honestly as unexercised.

## 11. Dependency ordering

Proven, not assumed: §4 rung G/H shows a `const`/`final` initializer that references another such
declaration embeds that reference as an ordinary nested `logic.Ref`, already targeted, inside the
initializer tree — the identical mechanism, with zero new UIR needed, that already lets `_reference`'s
existing `_topLevelTarget` machinery resolve it. A deterministic emission order is a small, well-
understood, mechanical topological sort over this existing edge set (the same *shape* of algorithm M8-O's
own fixed-point action discovery already implements in this generator, not a new architectural concept).
Dart itself rejects a genuine `const`-initializer cycle at compile time (a real fixture cannot reach this
code with one); a `final`-to-`final` runtime cycle is a pathological, unmeasured case this investigation
did not find any real or plausible evidence for, and — had Gate B proceeded — the correct, safe response
would be to refuse the whole strongly-connected group with a diagnostic rather than guess an order, not
to build cycle-breaking heuristics. Not implemented, so this remains a proof of feasibility, not a
running mechanism.

## 12. Gate B result

**FAIL — not on any of conditions 1–11 individually (each was measured and found true or boundable for
the narrow safe subset, §6–§11), but on the milestone's own overriding instruction: "Never force
implementation merely to reduce diagnostic counts."** Real Continuum evidence (§2, §14) shows the two
sites this milestone exists to address are each blocked by a cause a `FieldDecl` lowering fix does not
touch — `_log` by `logic.New`'s own pre-existing third-party-class refusal, `protocolVersion` by N11's
own route-boundary classification, reached before `expression.ts`'s ordinary `logic.Ref` handling ever
runs. Building the real infrastructure condition 6 (§8) requires — a new per-file declarations module,
new `EmitScope` wiring, a new topological-sort emission order — against **zero** real, currently-
measurable payoff is exactly the "broad incorrect implementation" this milestone's own instructions
warn against in spirit, even though the *narrow* subset itself would be correct. Declined.

## 13. Implementation

**Gate A only.** `packages/generators/react/src/internal/emit/expression.ts`: one new structural check
in the `logic.Ref` case, immediately after the existing `logic.FunctionDecl` one, identical shape:
`declaration['kind'] === 'logic.FieldDecl'` → `GeneratorDiagnosticCode.UnsupportedCapability` (`BRG3013`)
naming the field and stating plainly that top-level variable lowering "is not yet supported by the
React generator" — never claiming the declaration is missing. No entry added to `MISSING_CAPABILITIES`
(name-keyed, forbidden for this exact reason per M8-L's own precedent). No schema change. No analyzer
change. No compiler/N-pass change. No ADR.

## 14. Diagnostics before/after

Before this milestone (M8-O's own checkpoint): any `logic.Ref` targeting a `logic.FieldDecl` fell
through to the generic `missingCapabilityOf`/`UnresolvedReference` fallback → `BRG3006`,
`` `<name>` is not declared in this program ``, regardless of shape. After: the identical target
uniformly reclassifies to `BRG3013`, naming the field and the real reason ("this generator does not yet
lower a `logic.FieldDecl`"), **for every rung in §4's own ladder** (const, final, derived, cross-file,
cross-package, same-name, mutable, object-valued, opaque-initializer — 16 distinct sites, all
reclassified, zero remaining `BRG3006` in the probe fixture, §16).

## 15. Regression tests

`packages/generators/react/tests/toplevel_field_reference.test.ts` (new, 7 tests): targeted classification
(never `BRG3006`, capability message names the field); no file emitted for a refused program; a
genuinely missing target still `BRG3006`, unweakened; a mutable top-level variable (no `isFinal`) refused
identically — proving this is a lowering gap, not a mutability distinction, by construction; two
same-named fields under different owners classify independently, never conflated; a targeted
`FunctionDecl` (M8-L) is unaffected, with its own distinct message, never confused with a field; an enum
constant (M8-D) is unaffected. `toplevel_function_reference.test.ts`'s own M8-J regression test — which
had asserted the *old*, M8-L-era behaviour ("still `BRG3006`, not reclassified") — updated to assert the
new, correct one, with an explicit note pointing at this milestone.

## 16. Real fixture confirmation

Real `bridge build` on the comprehensive `m8p_probe` fixture (temporary, deleted after evidence
extraction): before this milestone's fix, 16 `BRG3006` errors (one per reference site); after, **zero**
`BRG3006`, 16 `BRG3013` (one per site, each correctly naming the field), plus the one pre-existing,
unrelated `BRG3002` (no design tokens) warning. Total error count identical (16 → 16) — a pure
reclassification, exactly matching M8-L's own precedent for functions.

## 17. Real Continuum results

Disposable whatif copies (mac + droid, same established method, deleted after measurement; Continuum's
own tree confirmed clean before and after both runs):

| | mac before | mac after | droid before | droid after |
|---|---:|---:|---:|---:|
| `BRG3006` | 18 | **17** | 19 | **18** |
| `BRG3013` | 8 | **9** | 8 | **9** |
| total errors | 42 | 42 | 47 | 47 |
| total warnings | 17 | 17 | 19 | 19 |
| files emitted | 0 | 0 | 0 | 0 |

Exactly one site reclassifies in each app — `_log`, confirmed live (`BRG3013` message now reads
`` `_log` is a project-defined top-level variable... ``, no longer `BRG3006`). `protocolVersion`'s own
reference (deliberately preserved, not literal-substituted, in this measurement's own whatif patch —
unlike M8-O's, which had bypassed it) is confirmed **unaffected**: it still reports the *other*,
pre-existing `BRG3013` (N11's own "promoting this boundary's arguments into a store" message, a
completely different diagnostic, owned by route-argument classification, never reached by this
milestone's own change) — proving directly, not by inference, that Gate B would not have helped this
site even if implemented. Total diagnostic counts unchanged in both apps — a pure reclassification,
nothing suppressed, nothing newly invented. `files emitted` remains `0/0` — `BRG2301`/`BRG2303`/
`BRG3001`/`BRG3002`/`BRG3004`/`BRG3008` remain independent, untouched blockers.

## 18. Regression evidence

`pnpm --filter @bridge/gen-react test`: 254/254 (247 + 7 new). Explicitly re-verified via `bridge
validate`: `fixtures/apps/local_variables` (M8-N) — clean, deterministic + fixed point;
`fixtures/apps/transitive_actions` (M8-O) — clean, deterministic + fixed point;
`fixtures/apps/hello_bridge` — still correctly refuses at `BRG2305`, byte-for-byte the same message as
before, confirming the unrelated parameter-forwarding blocker is untouched. `M8-L`'s own
`toplevel_function_reference.test.ts`: `logic.FunctionDecl` targets remain `BRG3013` with their own,
distinct message — never confused with a field, confirmed by a dedicated new test (§15). `just ci`:
exit 0.

## 19. CI / determinism / fixed point

`just ci`: exit 0 (build, typecheck, full TS test suite, `codegen-check` — no-op, no schema changed —
`lint`, `lint-negative`, `uir-lint`, `uir-test`, `analyzer-lint`, `analyzer-test` 312/312 unchanged,
`dart-analyze`). `just determinism`: **completed in full** — every one of the five e2e apps (`counter`,
`promoted-counter`, `inline-push-props`, `async-push-guard`, `local-store`), 3 pipeline runs each,
byte-identical uir/normalized/emitted-files hashes across all three runs of each, `exit 0`,
"byte-identical across every run." (A first attempt, run immediately after the fix landed, was killed by
signal 15 after the `counter` app's first of three runs — the same documented environmental/resource
limitation seen in every prior session; re-run alone shortly after, it completed cleanly, and this is the
result reported.) Also run to completion: `bridge validate` on `fixtures/apps/local_variables` and
`fixtures/apps/transitive_actions` — both `ok: true`, both checks passing on each.

## 20. Silent wrong-code findings

None. No lowering was implemented, so no evaluation-count, object-identity, or timing risk was shipped.
The one thing this investigation actively checked for and confirmed absent: Gate A's own check does not
inspect mutability, initializer shape, or anything else beyond the target's node kind — it cannot
accidentally treat a mutable variable as safe, because it makes no claim about safety at all, only about
which diagnostic is honest.

## 21. Remaining blocker graph

1. **Module-emission architecture for a top-level declaration** (§8) — the real, if bounded, missing
   scaffolding Gate B would need; not built, not currently justified by real evidence.
2. `_log`'s own actual blocker: third-party class construction (`logic.New` refusing a non-project,
   non-widget class) — pre-existing, unrelated, untouched.
3. `protocolVersion`'s own actual blocker: N11's route-boundary argument classification (`BRG2301`/
   ADR-11's own multi-hop question) — explicitly out of scope, untouched.
4. Parameter/N5/N11 interaction (M8-N §10) — untouched.
5. Catch-clause parameter identity (M8-O §22) — untouched.
6. `BRG1302` adjacent-string-literals / switch-expression extraction / `logic.FunctionDecl` full lowering
   — all untouched, all explicitly excluded.

## 22. Exact recommendation for M8-Q

No new, cleanly-bounded, real-evidence-backed candidate was found *by this milestone's own measurement*
that is smaller than the two already-standing candidates from M8-N and M8-O:

1. **Catch-clause parameter identity** (M8-O's own recommendation, still standing) — a narrower extension
   of ADR-28, with a concrete Continuum site (`e`) already confirmed.
2. **The action-to-action-via-effect gap** — a new, adjacent finding surfaced incidentally by this
   milestone's own Continuum trace (§2): `_announceRevocation` and `_env` both resolve to real, targeted
   declarations (`sig.Action`, `sig.Signal` respectively) yet still report `BRG3006` — suggesting a
   *third* reachability gap, structurally similar to M8-O's own finding but reached from a lifecycle
   method (`sig.Effect`, e.g. `initState`) rather than another action's body, which M8-O's own fixed-point
   walk does not cover (`referencedActions` seeds only from `component['render']`, never from an
   effect's own body). Not measured further here — out of this milestone's own scope — but recorded as a
   real, concrete lead with two confirmed real sites.

Recommend #2 as the more directly evidenced candidate: it was found, not guessed, in this milestone's own
real-corpus trace, and it is the same *shape* of fix M8-O already proved out (extend a discovery seed set,
no schema/ADR/runtime change expected) rather than a new kind of investigation.
