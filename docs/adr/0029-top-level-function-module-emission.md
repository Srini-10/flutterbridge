# ADR-29 — Top-level function module emission

- **Status:** Accepted, narrow scope (M8-U). Authorizes `logic.FunctionDecl` emission only, for the
  self-contained subset defined below. Does **not** authorize `logic.FieldDecl` emission — see §9.
- **Date:** 2026-08-22.

## 1. Problem

A targeted `logic.Ref` to a project-defined top-level `logic.FunctionDecl` already carries correct,
declaration-tier identity (M8-J) and is already correctly classified as `BRG3013` — an honest "not yet
implemented" refusal — rather than the misleading `BRG3006` "not declared" (M8-L). Nothing before this ADR
decides *where the function's own body is emitted*, because nothing before this ADR needed to: M8-L only
had to classify the reference correctly, not lower the declaration it points at. This ADR makes that
decision, for the narrowest real subset M8-T's own investigation found: a project-defined top-level
function with no cross-declaration dependency, not async, matching Continuum's own real `formatUptime`
(`package:continuum_ui_kit/src/settings_page.dart:26`).

## 2. Evidence

M8-T's own investigation (a dedicated read-only research pass) found, in real Continuum: 4 reachable
top-level declarations reported `BRG3013` (`_log`, `formatUptime`, `describeTransferFailure`,
`formatBytes`), of which **only `formatUptime` has no independent, unrelated blocker** — the other three
are each separately gated by a third-party-class refusal (`_log`'s `Logger(...)`), switch-expression
opacity (`describeTransferFailure`), and unresolved locals in a code path that never populates local
scope (`formatBytes`, itself informative — see §8). Zero cross-references were found among the four real
declarations — no real evidence supports topological ordering or cycle-handling architecture.

This milestone's own fresh reproduction of `formatUptime`'s raw UIR (`dart:core Duration` parameter `d`,
body `[logic.If, logic.If, logic.Return]`, no locals, no calls to other project declarations) confirms
M8-T's own classification and additionally found two independent, small SDK-surface gaps in the function's
own real body (`Duration.inMinutes`/`.inHours`/`.inSeconds` — the runtime `Duration` class exposes only
`inMilliseconds`; `int.remainder()` — no JS equivalent method mapping exists) — real, but **not**
architecture-level, and explicitly out of this ADR's own scope (see §11).

## 3. Decision — module ownership: one generated module per Dart source file

**Option A (per-Dart-source-file generated module) is adopted.** A project-defined top-level
`logic.FunctionDecl` is emitted into exactly one generated TypeScript module, owned by the Dart source
file it was declared in — never per-declaration, never per-package, never inline at each call site.

**Rejected alternatives:**

- **Option B (per-package aggregate module):** rejected. Dart forbids two top-level declarations of the
  same name *within one file*, but not within one *package* — two different files in the same package can
  each declare a function named, say, `format`. A per-package module would need its own name-disambiguation
  scheme; per-file ownership avoids the collision entirely, for free, by construction (Dart's own
  file-scoped uniqueness).
- **Option C (single application declarations module):** rejected for the same reason, amplified — bundles
  the whole program's top-level declarations into one file, guaranteed to eventually collide by name across
  enough source files, and defeats incremental/deterministic generation (any one function's edit would
  rewrite the same giant file).
- **Option D (inline into each consumer):** rejected. Breaks "emitted exactly once" the moment a function is
  called from more than one place (duplicates the body per call site, silently multiplying output size for
  no correctness reason), and cannot represent a recursive or mutually-recursive function at all — there is
  nothing to inline a function into when it calls itself.
- **Option E (inline into component scope):** rejected for the same reasons as D, plus it cannot represent a
  function shared across more than one component — a genuinely module-level declaration would need N
  copies, one per hosting component, defeating declaration identity.

## 4. Module path derivation — target-based, never by name

The generated module's own path is derived **deterministically from the declaration's own `span.file`**
(already present on every UIR node, already canonical: `package:<name>/<relative-path>.dart` for a
declaration in a dependency package, a plain relative path such as `lib/pages/pairing_page.dart` for one
declared in the application's own source) — **never from the function's own name**. Two functions with the
identical name in two different files therefore land in two different modules by construction; the same
file can never declare two same-named top-level functions (a Dart compile error), so within-module
collision cannot occur for this declaration kind. `ModuleBuilder.declare` (already existing, already used
for component names) remains the defensive backstop, exercised identically to how it already protects
component-name collisions.

Concretely: `package:continuum_ui_kit/src/settings_page.dart` → `src/generated/dart/continuum_ui_kit/
src/settings-page.ts` (package segment, then the relative path with `fileNameOf`'s existing kebab-casing
applied per path segment, `.dart` replaced with `.ts`); a plain `lib/pages/pairing_page.dart` → `src/
generated/dart/app/pages/pairing-page.ts` (the literal segment `app` standing in for "this application's
own source," parallel to how `package:<name>` names a dependency's own source).

## 5. Reachability — a generator-side, target-based, cycle-safe fixed-point walk

Owned by the **generator**, not a compiler normalize pass — matching where `referencedActions` (M8-O)
already lives, for the same reason: "what does this particular output target need to include" is a
target-specific, generation-time concern, not a meaning-preserving program transform. A future generator
for a different target may reach, bundle, or tree-shake differently; the compiler's own N1–N11 passes
correctly leave `logic.FunctionDecl` completely untouched (confirmed, byte-identical before/after normalize,
this milestone).

The walk generalizes `referencedActions`'s own fixed-point discipline — seed from every component's render
tree and every already-reachable action's own body, as today; **additionally**, when a discovered target
resolves to a `logic.FunctionDecl` (not only `sig.Action`), add its own body as a further expansion source,
and continue the fixed point until nothing new is found. A single `visited: Set<NodeId>` (declarations of
either kind) makes the walk cycle-safe by construction — re-visiting an id already in the set is a no-op,
so two mutually-recursive top-level functions terminate the walk exactly like any other cycle `Set`-based
dedup already handles. Not a blind copy of `referencedActions`: that function's own root set and its own
single-kind (`sig.Action`-only) target check are both generalized, not reused unmodified.

## 6. Import generation — target-based, reusing `ModuleBuilder.use`

A `logic.Ref` whose target resolves to a `logic.FunctionDecl` owned by a **different** generated module (by
path, §4) is lowered to a named import via the existing `ModuleBuilder.use(from, name)` — the identical
mechanism every other cross-module reference in this generator already uses. A reference to a function
owned by the **same** module needs no import — the call is already in scope textually. No new import
mechanism is introduced.

## 7. Cycle behaviour — a real, found limitation, not a deliberate design choice

**Corrected during implementation, not merely predicted.** A first draft of this section claimed a
same-file cycle would "require no special handling," reasoning from JavaScript's own hoisting semantics
alone. Building the reduction ladder's own cyclic rung (two mutually-recursive functions, same file)
disproved that: this pass's own emission strategy (§8) commits a function's text only once every reference
inside it is *already* known-successful, attempting each reachable function in turn and retrying whatever
failed, until a pass makes no further progress. Two functions that depend on **each other** can never be
"first" under that rule — on function A's own attempt, B is not yet known-successful (nothing is, yet), so
A's own reference to B fails exactly as an unsupported reference would; the symmetric argument holds for B.
Neither ever succeeds, and the retry loop correctly stops (no progress two passes running), but hoisting
was never reached, because neither function's *text* was ever committed to the module for JavaScript to
hoist.

**The result is still honest, not silently wrong**: both functions remain the same `BRG3013` refusal they
were before this milestone (a regression test — `function_module_emission_refusals.test.ts`'s own "two
mutually-recursive functions" case — pins this precisely, including the double-refusal, so a future change
to the retry strategy has something to prove itself against, not just this section's own prose). **Not
implemented this milestone**: recognizing a strongly-connected component in the call graph (by NodeId
target, never by name) and admitting every member of it as a unit once no member has any error *outside*
the cycle itself. This is a real, understood, bounded fix — but no real Continuum evidence requires it
(§2 — zero cross-references exist among the four real declarations, so no real cycle, same-file or
cross-file, has ever been observed) and building it against a hypothetical, not a corpus fact, is exactly
what this milestone's own scope discipline exists to avoid. A cycle **across** files/modules is expected to
raise the identical problem, for the identical reason, and is left equally unimplemented and equally
honestly refused. **No topological sort or cycle-detection algorithm is built.**

## 8. Function body lowering — reuse, not reinvention

The function's own body is lowered via the **existing** `emitStatements`/`emitExpression` machinery, under
a new, small scope constructor mirroring `store.ts`'s own `actionScope` (binds `params` by name — a
`ParamDecl` has no id, Spec v2.5 §A18.3's own established, sanctioned resolution — never target) **with one
necessary correction**: `actionScope` itself does **not** call `localBindingsIn`, which is exactly why a
store-declared action's own local variables are currently unresolved (an independent, pre-existing gap this
ADR's own investigation found and is not fixing, but must not repeat). The new function-scope constructor
**does** call `localBindingsIn(fn.body)`, mirroring `component.ts`'s own `declareLocalActions` — the
correct precedent for a scope that must resolve its own locals. No new local-resolution mechanism; M8-N's
own ADR-28 identity is used exactly as it already exists.

## 9. Relationship to `logic.FieldDecl`

**Not implemented this milestone**, and the architecture above does not foreclose it: a `logic.FieldDecl`
would use the identical module-ownership model (§3, §4) and the identical reachability generalization
shape (§5 — recognizing `logic.FieldDecl` as a further target kind), differing only in what gets emitted
inside the module (a `const`/`let` binding rather than a `function` declaration) and in one open question
this ADR does not resolve: whether a field's own initializer, if it references another module-level
declaration, needs eager (module-evaluation-time) ordering the way a function body's own deferred
(call-time) references do not. That ordering question is real and is exactly why this ADR does not extend
itself to `FieldDecl` — a function's body is call-time-evaluated, sidestepping the ordering question
entirely; a field's initializer is module-evaluation-time-evaluated, and does not.

## 10. Relationship to `componentModules` (M8-F)

Deliberately **not** the same map, and deliberately not reusing `componentModules`'s own file-naming
convention (which derives a component's file path from its own **name**, `fileNameOf(component.name)`,
with no per-source-file grouping and no disambiguation beyond `ModuleBuilder.declare`'s own within-module
backstop). That convention has shipped without incident because Flutter's own widget-class-naming
convention makes a same-name cross-package component collision rare in practice — but this ADR does not
inherit that assumption for arbitrary utility functions, whose names (`format`, `parse`, `describe...`) are
measurably more likely to repeat across unrelated files. Function modules are named by **source file**,
not by declaration name, precisely to make that class of collision structurally impossible rather than
merely unlikely.

## 11. What this ADR does NOT authorize

- `logic.FieldDecl` lowering (§9).
- Extending the runtime's `Duration` class, or mapping `int.remainder()`/other Dart-SDK-specific methods
  onto their JS equivalents. Real `formatUptime` needs both, independently of this ADR's own architecture —
  documented as a separate, small, currently-unauthorized gap (M8-U's own milestone doc, not this ADR).
- Any schema change — none is required; `logic.FunctionDecl`, `ParamDecl`, and every statement/expression
  kind `formatUptime`'s own admitted subset uses are already fully represented.
- Cross-file/cross-module cyclic dependency handling beyond what ES module semantics already provide
  unassisted (§7).
- Emitting a function whose own body references anything this generator does not already know how to
  lower (an unsupported SDK call, a top-level `FieldDecl`, component-local state, an opaque expression, a
  switch expression, async) — every such case remains an honest refusal, unchanged in kind, per the
  existing `BRG3013`/`BRG3006`/`BRG3004` diagnostic taxonomy.
