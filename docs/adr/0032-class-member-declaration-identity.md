# ADR-0032 — Class Member Declaration Identity

## 1. Class declaration identity

**Already solved, unchanged by this ADR.** `declaration_extractor.dart`'s `_class` already mints
`logic.ClassDecl`'s own `NodeId` from `out.symbols.type(className)` (`'type:$path#$name'`) — symbol-derived,
not content-derived. Confirmed directly: two classes with the same name in different files/libraries
(`lib/main.dart#Alpha`, `lib/sub/helper.dart#Alpha`) get distinct ids, deterministically, on every run. A
prior milestone's own investigation (M9-I) described `ClassDecl` as unsymboled; that was incorrect —
verified directly against the current, unchanged source. This ADR corrects the record and moves on: the
class itself was never the problem.

## 2. Member declaration identity

**The actual gap, and what this ADR fixes.** `_fields`/`_methods` (the same file) produce `logic.FieldDecl`/
`logic.FunctionDecl` records embedded in `ClassDecl.fields`/`.methods`, and neither ever passed a `symbol:`
argument to `RawNode`. Every other declaration-tier node in this compiler is symbol-addressed (ADR-17's own
two-tier rule: "Declarations... hash of a stable symbol"; "Tree nodes... hash of canonical content").
Without a symbol, the canonical builder's `IdAllocator` falls back to `forContent` — the tier meant for
expressions and statements, not declarations — and two structurally-identical members in unrelated classes
collide on one `NodeId`. Reproduced directly, fresh: `class Base { int get value => 1; }` and `class
PrivacyModel { ...; int get value => 1; }` (identical getter text) both minted `8b16269762a3b7ef` before this
fix.

**Fix**: give every field/method/getter/setter its own symbol, anchored to its declaring class.
`Symbols.variable(name, {owner})` already existed with exactly this shape (`'var:$path#$owner.$name'`) but
was never actually called with `owner` for a class field — only ever `owner: null` (top-level). Wiring
`owner: className` into `_fields`'s existing call closes the field case with zero new API surface.
`Symbols.function` had no `owner` parameter at all; it gained one, matching `variable`'s exact convention:
`'fn:$path#${owner == null ? '' : '$owner.'}$name'`. A setter's own symbol gets a `=` suffix
(`value=`) to avoid colliding with its own paired getter — Dart's single-namespace-per-class rule means a
getter and setter sharing a name are two distinct declarations that would otherwise mint the identical
symbol and trip `ReferenceResolver.declare`'s own `BRG1202` the moment a class declares both (a common,
ordinary shape).

## 3. Owner relationship

The `owner` parameter *is* the explicit ownership representation, at the identity layer — `$owner` is the
declaring class's own name, embedded directly in the member's symbol string, mirroring the identical
convention `Symbols.signal`/`.derived`/`.action` (ADR-27) already established for store members. No ordinal
is needed: Dart forbids two members of any kind (field, getter, setter, method) sharing one name within a
single class, so `owner + name` is collision-free by the language's own grammar — the same reasoning ADR-28
§4 already used to conclude a parameter's own symbol needs no ordinal either.

## 4. Field-backed synthetic accessor treatment

Unchanged and out of this ADR's scope. `_storeMemberTarget` (`expression_extractor.dart`) already
correctly distinguishes a field-backed synthetic `GetterElement` (`isOriginVariable`) from an explicit one
(`isOriginDeclaration`) for a *store*-typed receiver — that mechanism is untouched. This ADR's own fix
operates one layer earlier, at *declaration* time (`declaration_extractor.dart`'s `_fields`/`_methods`),
giving the `FieldDecl`/`FunctionDecl` records themselves stable identity regardless of what, if anything,
ever resolves a *reference* to them.

## 5. Explicit getter identity

A `logic.FunctionDecl` exactly like any ordinary method, symbol-addressed via `Symbols.function(name,
owner:)` — no separate getter-specific symbol scheme, matching the finding that Dart's AST does not itself
distinguish a getter-shaped `FunctionDeclaration`/`MethodDeclaration` from an ordinary one at the
declaration-extraction layer (the existing top-level `_function` code already emits a top-level getter as an
ordinary `logic.FunctionDecl` the identical way).

## 6. Method identity

Identical treatment to a getter (§5) — one symbol scheme, `Symbols.function(name, owner:)`, for every
`MethodDeclaration` a plain class declares (ordinary method, getter, setter, operator, static member — all
share Dart's one per-class namespace, so all are safely covered by the identical scheme, with the one
getter/setter disambiguation named in §2).

## 7. Constructor identity

**Not addressed.** No constructor is extracted as a declaration-tier node at all today —
`declaration_extractor.dart`'s `_class` reads no `ConstructorDeclaration`. Out of this ADR's scope: this
milestone (M9-K) selected Outcome A1 (identity + ownership only), and constructor semantics are explicitly
deferred to a future milestone per its own governing brief.

## 8. `this`

**Investigated, not solved, deliberately deferred.** A dedicated mechanism already exists —
`_instanceRef(node, 'this')` (`expression_extractor.dart`) — but it is a minimal shim: `logic.Ref{name:
'this', type: <static type>}`, carrying no `target` and no connection to any field/member declaration.
Confirmed directly, via a real probe: `this.count` (explicit) extracts as
`logic.PropertyAccess{receiver: Ref('this'), property:'count'}` — structurally different from bare `count`
(implicit), which extracts as a plain, **untargeted** `logic.Ref{name:'count'}` — the exact same shape an
unresolvable identifier would produce, because `_reference`'s own `staticTarget` computation
(`_topLevelTarget`) explicitly excludes any element whose `enclosingElement` is an `InstanceElement`.
**Implicit and explicit instance-member reads are not unified today, and neither carries a target to the
member's own (now-real) symbol.** Wiring either is real work — deciding whether the `target` should point at
the member declaration directly (sound only for a non-overridable, concrete receiver — see §15/dynamic
dispatch) or through some new instance-ownership node — and is explicitly out of this ADR's scope.

## 9. Instance ownership

**Not built.** No per-instance node exists for a plain class the way `app.StoreInstance` exists for a store
(ADR-27) — and ADR-27's own mechanism is explicitly not a template to copy verbatim: `app.StoreInstance` is
symbol-addressed per *field*, deliberately narrower than what a general instance-ownership model would need
(an arbitrary construction expression, a function parameter, a collection element). This ADR does not invent
one. §10 of the governing M9-K brief's own priority list places this correctly *after* member identity and
explicitly permits stopping here.

## 10. Type representation

**Not built; `declaresClass` remains `() => false`, unchanged.** Confirmed by direct inspection
(`pipeline.ts:581`) — this ADR touches no generator file. A project-defined class's type still lowers to
TypeScript `unknown` in a component prop; M9-J's own refusal (unaffected, still live, reconfirmed via a real
build against the M9-J fixture) still refuses member access on it honestly.

## 11. Module reachability

**Not built.** `logic.ClassDecl` still participates in no reachability walk — `functions.ts`'s
`reachableFunctions` still keys on `kindOf(declaration) === 'logic.FunctionDecl'` alone, with no class-aware
branch. A class (and its now-correctly-identified members) remains structurally inert from the generator's
point of view: extracted, symbol-stable, never referenced by anything outside its own class body.

## 12. Cross-file imports

Not applicable — no emission exists to import into.

## 13. Privacy/library ownership

**Already correctly satisfied, by construction, with no special-casing needed.** `owner`-qualified member
symbols are prefixed by `$path` (the declaring file, hence library) exactly like every other symbol this
compiler mints. A private member (`_value`) in one library and a same-named private member in another
library get different symbols purely because their `$path` differs — the identical mechanism that already
makes every other privacy-adjacent symbol in this compiler correct (M7-N's own `Symbols.pathOf`-based
scoping). No underscore-based heuristic was written or needed.

## 14. Inheritance boundary

**Not touched — no member is ever targeted from outside its own declaring class, so there is nothing to
dispatch.** This ADR only gives a member a stable *symbol*; it wires no `target` field onto any read/call
expression anywhere. The dynamic-dispatch hazard M9-I identified (`Base model = Child(); model.value`
statically bound to `Base.value` would be wrong) cannot manifest from this change, because no code path this
ADR touches ever resolves an external reference to a class member's symbol.

## 15. Dynamic dispatch boundary

Deferred with §14, for the identical reason — moot until a future milestone wires member-read targeting,
at which point that milestone must define this boundary before doing so (per M9-I's own finding, reused
here as a standing prerequisite, not re-litigated).

## 16. Constructor boundary

Deferred with §7.

## 17. Exact initial supported subset

Every field, getter, setter, method, and static member declared directly on **any** class (plain, component,
or store) gets a real, class-owner-qualified, deterministic, collision-free symbol. This is unconditional —
it required no eligibility gate (unlike ADR-27's `isStoreBase`), because it is purely an identity fix with no
behavioral/semantic claim attached.

## 18. Exact refused subset

Nothing new is refused by this ADR. M9-J's existing member-access refusal (`BRG3013`) is untouched and
reconfirmed live. No new diagnostic is introduced.

## 19. M9-J refusal interaction

Structurally independent and unaffected: M9-J's `isUnmodelledMemberReceiver`/`isParameterReceiver` operate
on the *access site*'s own `target` field (still always absent for a non-store receiver, since this ADR
wires no reference targeting) — never on whether the *declaration* being read has a symbol. Reconfirmed with
a real build of the M9-J fixture after this ADR's change: identical 8-diagnostic refusal, byte-for-byte.

## 20. Migration path for getters

None needed yet. M9-I's own getter investigation remains valid and unblocked-but-not-advanced: this ADR
gives a getter's own declaration a real, stable identity (closing one of M9-I's named prerequisites), but
the receiver-type and `this` prerequisites M9-I also named (§9 of this ADR) remain open.

## 21. Determinism

Confirmed directly: the same source, analyzed twice independently via the real CLI, produces byte-identical
raw UIR (every id, including every member's own new symbol-derived id). `IdAllocator.forDeclaration` is a
pure hash of the symbol string — deterministic by construction, the same guarantee every other
symbol-derived id in this compiler already relies on.

## 22. Diagnostics

None added. A genuine symbol collision (if this ADR's own scheme were ever wrong for some undiscovered
Dart shape) would surface as the pre-existing `BRG1202` (`duplicateSymbol`) — confirmed directly, by
deliberately breaking the file-scoping half of the scheme and observing a real `BRG1202` fire immediately,
naming both declaration sites.

## 23. Future extension boundary

The next milestone this unblocks (recommended M9-L in the governing milestone doc) is member-read
*targeting* — wiring a `target` field onto `this.field`/implicit-field/external `instance.field` reads,
which requires first resolving §8 (`this`) and §15 (dynamic-dispatch boundary) properly, generalizing
`_storeMemberTarget`'s own resolved-Element dispatch beyond `isStoreBase` while bounding out any receiver
whose static type has (or could have) an override. This ADR's own member symbols are the one piece that
future work can now build on rather than invent from scratch.
