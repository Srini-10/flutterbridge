# ADR-28 — Declaration-tier identity for local variables and parameters

- **Status:** Accepted for local variables (`logic.VarDecl`), implemented (M8-N). Accepted in principle
  for parameters (`ParamDecl`), **implementation deferred** pending a separate N5/N11 interaction
  investigation this ADR names but does not resolve. Amends ADR-17 ISSUE-6's two-tier identity table.
- **Date:** 2026-08-21.

## 1. Problem

ADR-17 ISSUE-6 gives every UIR node one of two identities: a **declaration** gets a symbol-derived id
(stable across content edits, resolvable by anything that knows the symbol); a **tree node** gets a
content-derived id (two identical subtrees are one node, by design). `ParamDecl` and `logic.VarDecl` are
real, referenced declarations that fall outside this table as it stands: `ParamDecl` has no `id` field at
all; `logic.VarDecl` receives a content-derived id, the tree-node tier's identity, not the declaration
tier's. Both are wrong for the same underlying reason, proven below: content addressing collapses
declarations and reads that are lexically distinct but textually identical, which is exactly the
"identical subtree" behaviour ADR-17 intends for a value — and exactly the wrong behaviour for a mutable,
lexically-scoped **binding**, where two occurrences that merely *look* alike must never be treated as one.

## 2. Evidence

**M8-G** (`docs/m8/m8g-multi-hop-provenance-decision.md`) found this first, for `ParamDecl`: *"`ParamDecl`
currently sits in neither tier — it is a plain value with no identity at all"* (§7), proved a real
collision at the content-hash level (its rung N), and ruled *"ADR REQUIRED: YES"* (§7) — the exact
category of decision this ADR now makes.

**M8-M** (`docs/m8/m8m-local-variable-reference-resolution.md`) found the same defect independently for
`logic.VarDecl`, and this milestone (M8-N) re-proved both, fresh, through the real pipeline, before
writing this document — not by trusting either prior report:

- A temporary probe (`fixtures/apps/m8n_probe/`, deleted after evidence extraction) declared
  `final int x = 1; _log = x;` identically in three unrelated methods (`_actionA`, `_actionB`,
  `_actionC`) of one class. All three `logic.VarDecl` declarations received the **identical** id
  (`c0726176f493551d`); all three reads received the **identical** id (`9295565a71aadd9d`), with no
  `target` on any of them. Three genuinely distinct bindings, collapsed to one node, by construction —
  not a corner case, a monotonic consequence of `stripIdentity` applied to `{name, type}`.
- The **real, committed** `fixtures/apps/hello_bridge` fixture reproduces the identical defect for
  **parameters**, unprompted: `LoginScreen`'s own `isDark` parameter, read inside its `_login` action
  while forwarding to `HomeScreen(isDark: widget.isDark)`, and `HomeScreen`'s own, entirely different
  `isDark` parameter, read inside its own `build()` (`widget.isDark ? ... : ...`) — two different
  parameters, on two different classes, with no relation to each other — share the exact node id
  `029334b99e65258e`. This is not synthetic; it is the walking-skeleton fixture every milestone gate
  already runs against.

Both findings independently converge on the same shape of defect and the same shape of fix (M8-G's own
§7 "Option A", re-derived here from first evidence rather than assumed).

## 3. Declaration-tier identity rule

A **local variable**, ordinarily declared (`final`/`var x = ...;`, a `VariableDeclarationStatement` — this
ADR does not extend to `for`-loop variables or `catch` clause bindings, a narrower, related, unmeasured
case left for a future milestone), receives a real, symbol-derived id:

```
Symbols.local(name, {required String owner, required int ordinal})
  → 'local:$path#$owner.$ordinal.$name'
```

`owner` is the enclosing declaration's own name (mirroring `Symbols.signal`/`.action`/`.derived`'s
existing `owner`-qualification convention exactly — a bare class-or-function-scoped string, not a nested
symbol). `ordinal` is a **monotonic count of every local declared so far within that one owning body**,
assigned once, during the same single, deterministic pre-order AST walk that already visits every
statement to build its `RawNode` — never independently re-derived, never inferred from a second pass,
never guessed by a consumer. This mirrors the one existing precedent for a non-globally-nameable,
per-occurrence symbol already in this codebase, `Symbols.navigation(int ordinal)` (*"This is not span
matching and not a heuristic... the ordinal exists to make the symbol unique, not to make it findable"*)
— construct-once, hand-back-immediately, never searched for.

## 4. Parameter identity (authorized in principle, not implemented this milestone)

The identical shape applies to a `ui.Component`'s own constructor parameters:

```
Symbols.param(name, {required String owner})
  → 'param:$path#$owner.$name'
```

No ordinal is needed — Dart forbids two parameters of the same constructor sharing a name, so
class-name qualification alone is collision-free, exactly like `Symbols.variable`'s existing
`owner`-qualification for a field. **This ADR authorizes the identity model for `ParamDecl` and accepts
it as architecturally sound (§9 below), but this milestone does not implement it** — §12 explains why,
precisely, rather than silently deferring it.

## 5. Local-variable identity — collision-freedom, proved

Owner-qualification defeats the cross-method collision (§2's `_actionA`/`_actionB`/`_actionC` proof):
different owners, different symbols, regardless of identical content. The ordinal defeats the
within-one-owner shadowing collision M8-M's own rung L/M found: two `x`s at different nesting depths in
the *same* method get different ordinals (assigned in AST-walk order, which visits the outer declaration
before ever descending into the block containing the inner one), and therefore different symbols,
regardless of identical initializer values.

## 6. Lexical-shadowing identity

The extractor's own `Scope`/`Binding` machinery (`dart/bridge_analyzer/lib/src/session/extract/scope.dart`)
already, correctly, implements Dart's own shadowing rule — `Scope.lookup` walks innermost-parent-first.
This ADR changes nothing about *that*: the ordinal is assigned once, at the point each `VariableDeclarationStatement`
is visited (which happens in the same order `Scope.child`/`withBinding` already nest), and the resulting
symbol is attached to the `Binding` the *existing* lookup already finds correctly. No new scope-resolution
logic is introduced; only the binding's own identity gains a symbol it did not have before.

## 7. NodeId derivation

`logic.VarDecl.id` moves from content-derived (`context.allocator.forContent`) to symbol-derived
(`context.resolver.declare(symbol, span)`) — the same branch (`node_factory.dart`'s `raw.symbol != null`
check) every other declaration-tier node already takes, by passing `symbol:` into the `RawNode(...)`
construction instead of omitting it. No new id-derivation mechanism; the existing one, applied to one
more node kind, driven by a `symbol` string extraction now computes and supplies.

## 8. Reference target semantics

`logic.Ref.target` already exists and already carries exactly this meaning for every other declaration
kind. `_reference`'s existing computation, `target = staticTarget ?? binding?.symbol`
(`expression_extractor.dart`), needs **zero changes** once a `Binds.local` binding is created *with* a
`symbol:` argument — the consuming side already does the right thing; only the binding-creation sites
were withholding the symbol. This is the concrete evidence for Gate B's "mechanical, no new semantic
inference" bar: the fix is additive at the four `Binds.local` creation sites in `statement_extractor.dart`
(this ADR's own scope covers the ordinary-declaration site only, §3), not a change to how references
resolve.

## 9. BRG1207 interaction

`BRG1207` (`orphanReference`) sweeps every symbol the resolver was asked to `declare` and checks the id it
produced is present in the final document (`dart/bridge_analyzer/lib/src/builder/validation.dart`'s
`_checkReferencesResolve`). A local's own `VariableDeclarationStatement` is unconditionally lowered to a
`logic.VarDecl` node today, regardless of whether the local is later read — nothing in the current pipeline
elides an unused local's own declaration statement. Minting a symbol for every declared local (used or
not) is therefore safe under BRG1207 by construction: the node the symbol names always exists in the
document, because the statement that produces it is never conditionally dropped. No normalization pass
(N1–N11) was found, by direct search, to remove a `logic.VarDecl` node under any circumstance (the only
`VarDecl`-aware pass, N5, *reads* it to determine closure capture — §10 — and does not delete it). An
unused local therefore behaves exactly like every other never-referenced declaration already in the
system (an unused `sig.Action`, for instance): a real symbol, a real surviving node, and BRG1207 has
nothing to report either way.

## 10. M8-B inline-local exception

`Binding.inlineValue` (M8-B) remains **untouched and out of scope** — a build-method local never reaches
a `Binds.local` binding with a real `symbol` under this ADR, because `component_extractor.dart` continues
to construct build-method locals as `Binding(binds: Binds.local, inlineValue: initializer)`, which
`_reference` checks and substitutes *before* ever consulting `binding.symbol` (`expression_extractor.dart`'s
existing branch order, unchanged). The two mechanisms are mutually exclusive by construction: a binding
either carries `inlineValue` (M8-B, `build()`-only, licensed by Flutter's own purity contract for that one
method) or a `symbol` (this ADR, ordinary imperative bodies), never both, and this ADR adds no code path
that could confuse the two.

## 11. Normalization requirement — N5 must be updated, and this is load-bearing

`packages/compiler/src/internal/passes/n5_lift_closures.ts` (lift-closures) has a **documented,
deliberate invariant**, quoted directly from its own header comment: *"A lifted action is closed over
nothing but named nodes... It may not reference a free local — a `logic.Ref` with no target, naming
something in an enclosing scope the UIR does not have an id for."* Its `freeLocals`/`collectBound`
functions currently treat **any** targeted `logic.Ref` as automatically safe to lift
(`if (typeof record['target'] === 'string') continue;`) — a local-variable read, once this ADR gives it a
real `target`, would satisfy that check and be silently treated as *not* free, when a closure capturing an
**enclosing** local is exactly the case N5's own comment says must never lift. **Shipping this ADR's local
identity without also fixing N5 would be a genuine, real regression — a closure that captures an outer
local would start being lifted into a standalone `sig.Action` with a dangling reference**, precisely the
"silent wrong code" this project's own discipline exists to prevent. This ADR therefore requires, as part
of the same change: `N5LiftClosures.run` computes one more precomputed id set,
`program.ofKind('logic.VarDecl')`, mirroring the existing `signals` set exactly; `freeLocals`/`collectBound`
are updated to collect **ids** declared within the lambda's own subtree (not names), and a targeted
`logic.Ref` is treated as bound only when its target is in that within-lambda id set, is treated as safe
(unchanged from today) when its target is not a `logic.VarDecl` id at all (a signal, action, top-level
thing), and is added to `free` — exactly as an untargeted local already is today — when its target is a
`logic.VarDecl` id declared **outside** the lambda. This is a strict generalisation of the existing check,
not a new one: every case N5 handles correctly today continues to be handled identically; the only
behaviour that changes is the one case that was, before this ADR, indistinguishable from "safe" purely
because it had no target to be indistinguishable *by*.

## 12. Generator resolution requirement

`EmitScope.localName` (`packages/generators/react/src/internal/emit/expression.ts`) already exists,
already documents itself as covering exactly this case (*"a param, a local, a lifted action"*), and is
already consulted before any fallback in the `logic.Ref` case. Nothing populates it for an ordinary
`logic.VarDecl` today. This ADR requires `statement.ts`'s `logic.VarDecl` case to register the emitted
identifier against the declaration's own (now-real) id in a scope-local map, and `EmitScope`'s local-body
scopes (action bodies, and — mechanically, for free — any nested closure body, since `EmitScope` objects
already thread through unchanged via object spread) to expose that map through `localName`. No new
resolution algorithm: the existing target-then-`localName` lookup order, already used for lifted actions,
extended to cover one more declaration-tier kind. Shadowing resolves correctly for free, because two
shadowed locals now have two *different* ids (§5) and therefore two different map entries — nothing about
JS's own block scoping needs to be reproduced by hand, since two `const x` declarations in two nested JS
blocks already shadow exactly the way the two Dart declarations did, and the generator only ever needs to
know *which* declaration's identifier to emit at a given read, which the map now answers unambiguously.

## 13. Rename/edit stability

**Not claimed, and not required.** A local variable's symbol is never referenced from outside the one
extraction pass that both mints it and consumes it (nothing outside a function can name a local — the
same fact `Binding.symbol`'s own, now-superseded doc comment already stated, correctly, about
*referenceability*, incorrectly, about *identity being unnecessary*). Renaming a local, or inserting an
unrelated local earlier in the same method, legitimately changes its ordinal and therefore its symbol —
exactly as Phase 5 of this milestone's own instructions anticipated ("do not claim rename stability unless
the architecture actually requires it... a declaration rename may legitimately produce a new declaration
identity"). What the architecture *does* require, and what this ADR proves (§5), is same-input
determinism: running the same, unedited source through the pipeline twice yields the same ordinals, because
the AST walk order is fixed.

## 14. Cross-file/package behaviour

None — by construction. A local variable's own `Element` never resolves outside the file, or even outside
the function, it is declared in (Dart's own scoping rules). Nothing about M8-F's cross-package assembly or
M8-J's cross-file symbol resolution is touched or relevant.

## 15. Rejected alternatives

- **Content-addressed identity** (M8-M's Candidate D, this milestone's own re-proof, §2): reproduced and
  rejected directly — the collision is not a corner case, it is the designed behaviour of content
  addressing applied to a value type that was never meant to be deduplicated across distinct bindings.
- **Source offset/span identity** (Candidate C): not adopted. ADR-17 nowhere defines span as identity, and
  this ADR does not invent that rule — spans already change on harmless, meaning-preserving edits
  (reformatting, an unrelated comment), which would make every local's identity gratuitously unstable for
  no benefit a symbol scheme does not already provide.
- **Reusing `Binding.inlineValue`** (M8-B's mechanism): investigated in depth by M8-M (§13 of that report)
  and re-confirmed unsound here — licensed narrowly by `build()`'s own framework-guaranteed purity and a
  restricted, side-effect-free grammar, neither of which holds for an ordinary action or function body;
  reusing it would duplicate side effects, break `var`/mutation entirely, and break object identity.
- **A file-global ordinal** (matching `Symbols.navigation`'s own file-wide scoping literally) was
  considered and rejected in favour of a per-*owner* ordinal: a file-wide counter would make every local
  in a file re-number whenever *any* local anywhere in that file changed, whereas owner-scoping confines
  an edit's identity churn to the one method actually edited — a strictly better fit for the same-input
  determinism this ADR needs, at no extra cost.

## 16. Migration / schema-version consequences

**No schema change for local variables.** `id` already exists on every `UirNodeBase`-derived node,
including `logic.VarDecl`; only its *derivation* changes (content-tier to declaration-tier), an
extraction-side and builder-side change, not a JSON schema amendment. Existing documents remain
structurally valid; only the specific id *values* for `logic.VarDecl` nodes change on the next extraction
of unchanged source (an ordinary, expected consequence of any id-derivation change, not a breaking schema
version bump — no `x-uir-breaking` marker is implicated, since no field's shape or requiredness changes).

For parameters (§4, not implemented this milestone): the eventual schema change is larger — `ParamDecl`
would need to become a genuine `x-uir-kind`-discriminated node (gaining `kind`, `id`, `anchor`, `span` via
`UirNodeBase`), because the builder's only id-minting mechanism (`node_factory.dart`'s `raw.symbol != null`
branch) operates exclusively on `RawNode`, and `ParamDecl` is constructed today as a plain `RawMap` with no
path to that mechanism without becoming a real node. This is additive (existing consumers reading
`param['name']`/`param['type']` are unaffected) but is real schema surface this ADR authorizes without
scheduling — see §12 for why.

## 17. What this ADR does NOT authorize

- It does not authorize `for`-loop-variable or `catch`-clause-parameter symbol minting — the same category
  of gap, measured only for ordinary `final`/`var` declarations here, left for separate evidence.
- It does not authorize any change to N11's promotion logic, BRG2305, or BRG2306 — `bind.Param`'s
  classification in `n11_promote_cross_route_state.ts` is untouched, and remains `forwarded` unconditionally
  regardless of any future `target` field, until a separately-scoped, separately-authorized milestone
  decides to consume it.
- It does not authorize multi-hop cross-route promotion in any form.
- It does not authorize implementing `ParamDecl`'s schema change, `Symbols.param`, or any Dart/generator
  parameter-identity code this milestone — only the architecture (§4, §9, §16) is accepted; see M8-N's own
  report for the precise, additional, unresolved question (component-parameter targets and N5's
  closure-lifting safety) that must be answered first.
- It does not authorize weakening BRG1207, BRG2301, BRG2303, BRG2305, BRG2306, BRG3006, or BRG3013 in any
  way, and none of this ADR's own changes touch any of their trigger conditions except by, for local
  variables only, making previously-`BRG3006`-misclassified references correctly resolvable — never by
  suppressing a diagnostic that would otherwise correctly fire.
