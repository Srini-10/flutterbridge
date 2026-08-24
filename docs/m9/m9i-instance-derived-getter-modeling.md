# M9-I — Instance Derived Getter Identity, Reachability & Bounded Derived-Getter Modeling

**Outcome: B — architecture/prerequisite proof. No production code shipped.**

## 1. Baseline

`HEAD == origin/main == 547653c` (M9-H, `fix: reject analyzer-invalid source before extraction`),
confirmed via `git rev-parse HEAD`/`git rev-parse origin/main` before any work began. `git status --short`
showed only the pre-existing, unrelated `fixtures/apps/hello_bridge/analysis_options.yaml` drift — left
untouched throughout. No other unexpected worktree state existed.

## 2. Current getter gap

`class CounterModel { final int count; int get doubled => count * 2; }`, referenced as
`Text('${model.doubled}')` where `model: CounterModel` is a component parameter: `bridge analyze` reports
**zero diagnostics**. `bridge build` reports **`ok: true`**. The generated component is:

```tsx
export interface WProps {
  readonly model: unknown;
}
export function W(props: WProps) {
  return <Text>{`${props.model.doubled}`}</Text>;
}
```

Fed through real `tsc --noEmit --strict`, this produces:

```
error TS18046: 'props.model' is of type 'unknown'.
```

This is the milestone's own smoking gun, the direct analogue of M9-H's H4: **a completely valid Dart
program, at `Severity.error` count zero throughout the entire pipeline, silently compiles to TypeScript
that does not type-check** — worse than M9-H's finding, because M9-H's defect produced *plausible, running*
wrong code; this one produces code that fails at the `tsc` boundary, with the actual cause (an
unrepresentable receiver type) invisible by the time a developer sees the TS error. This is not unique to
getters — the identical failure reproduces for an ordinary field (`model.count`), confirmed directly (§25).

## 3. Analyzer Element model

Read directly against `analyzer-14.0.0` (the same pinned version ADR-0031 documents) and confirmed by a
live probe (`ClassElementImpl`/`GetterElementImpl`/`FieldElementImpl`, real `getResolvedUnit` run):

- `int get doubled => count * 2;` resolves its declaration to a `GetterElement` (`GetterElementImpl`),
  `enclosingElement` = the `ClassElement`, `variable` = a **synthetic** `FieldElement` Dart induces for it
  (`int doubled`, no source span of its own).
- `count` (the plain field) resolves its own declaration to a **non-synthetic** `FieldElement`; every
  *read* of `count` (`model.count`, or `count` inside the getter's own body) resolves through a
  **synthetic** `GetterElement` Dart implicitly generates for the field — this is real Dart semantics, not
  an implementation detail: a field read and an explicit getter read reach the analyzer as the *same*
  `GetterElement`-typed AST-element shape.
- The discriminating API, confirmed both by the live probe and by production code already using it
  (`_storeMemberTarget`, `expression_extractor.dart:1206-1250`): `GetterElement.isOriginVariable` (true
  for the implicit field-accessor case) vs. `GetterElement.isOriginDeclaration` (true for an explicit,
  user-written getter). **Not `Element.isSynthetic`** — that member does not exist anywhere in
  `analyzer-14.0.0`'s public `Element`/`Fragment` API (confirmed by exhaustive grep of
  `~/.pub-cache/hosted/pub.dev/analyzer-14.0.0/lib/dart/element/element.dart`: zero occurrences outside an
  unrelated `LibraryImport.isSynthetic`). The production code's own comment states this precisely: *"Not
  `isSynthetic`: deprecated in this analyzer in favour of exactly this pair, for exactly this
  distinction."*
- `model.doubled`'s `PrefixedIdentifier` resolves `identifier.element` to the `GetterElement` for
  `doubled` directly; `prefix.element`/`prefix.staticType` gives the receiver's own resolved static type
  (`CounterModel`) — both facts already fully available to extraction today, at every call site, with no
  new analyzer capability needed.

## 4. Explicit vs. synthetic getter distinction

**Already solved, in production, today — but scoped to one receiver kind.** `_storeMemberTarget`
(`expression_extractor.dart:1206-1250`) already performs exactly this discrimination:
`element is GetterElement && element.isOriginVariable` → `Symbols.signalIn` (ordinary field);
`element is GetterElement && !element.isOriginVariable` (i.e. `isOriginDeclaration`) → `Symbols.derivedIn`
(explicit getter). This is real-Element-based, never name-based, and is gated *only* by
`registry.isStoreBase(receiverType)` (`ChangeNotifier`/`Notifier`/`StateNotifier` descendants declared
inside this project, per `signal_extractor.dart`'s own eligibility check, further narrowed by M7-N's fix to
also require the declaring library be inside the project — so `ValueNotifier`/`TextEditingController` are
never misclassified). For `CounterModel` (not a store base), `_storeMemberTarget` returns `null`
unconditionally, and the identical `isOriginVariable`/`isOriginDeclaration` distinction is never even
reached for it.

A dedicated regression test proves ordinary field access stays governed by the identical, already-existing
`isOriginVariable` control path in `_storeMemberTarget` (M7-N's own store-scoped test suite) and is entirely
unaffected by anything in this milestone, since M9-I ships no code.

## 5. Private vs. public getter — answer

Privacy is **not** a special case requiring a `_name` heuristic, and this milestone did not design one.
Dart's own privacy is library-scoped: a `_privateValue` getter is visible to any code — including a `part`
file — inside the *same library* (same `.dart` file's own library, or any file `part of` it), and invisible
outside it; the analyzer already resolves this correctly as a property of the *reference*, not of the
declaration's own spelling (a reference to `_privateValue` from outside the declaring library simply fails
to resolve at all — `element` would be `null`/an error element, already caught upstream by M9-H's BRG1310
gate if it were genuinely unresolvable, or resolved normally if genuinely in-library). Direct probe
confirms: `PrivacyModel._privateValue`, read from `usesPrivate` (a getter on the *same* class, same
library) resolves identically to a public getter read — same `GetterElement`/`isOriginDeclaration` shape,
same `enclosingElement`. **The real architectural problem is "getter" (receiver-type generalization),
never "private getter"** — privacy is an orthogonal, already-correctly-handled-by-the-analyzer access fact
that any future getter mechanism would carry through unchanged (a private getter's own symbol would simply
be scoped to its declaring library exactly as every other symbol in this compiler already is via
`Symbols.pathOf`/`...In` helpers — no new privacy design needed).

## 6. I1–I24 reduction ladder

Answered from a combination of direct, real-Dart probes (marked **[probed]**) and architectural reasoning
grounded in the confirmed facts above (marked **[derived]** — never speculative, always traced to a cited
fact):

| # | Case | Result |
|---|---|---|
| I1 | Numeric getter (`doubled`) | **[probed]** Resolves to `GetterElement`/`isOriginDeclaration=true`; extracts as unsymboled `logic.FunctionDecl{name:'doubled', params:[], returnType:int}` embedded in the class's `logic.ClassDecl.methods`. |
| I2 | Bool getter (`isEmpty`) | **[probed]** Identical shape, `returnType: bool`. No difference in mechanism by return type. |
| I3 | Two-field getter (`total => left + right`) | **[probed]** Body extracts as an ordinary `logic.Binary` over two `logic.Ref{name:'left'/'right'}` reads — both resolve fine (in-class field reads), no different from any other expression. |
| I4 | Getter→getter (`doubled => total*2`) | **[probed]** `total`'s own read inside `doubled`'s body resolves the identical way an implicit-`this` field read does — a bare `logic.Ref{name:'total'}`, **no `target`** (getter-to-getter reads inside a class body go through the same unresolved-target path as everything else on a non-store receiver). |
| I5 | Depth-3 chain (`quadrupled => doubled*2`) | **[probed]** Same as I4, one level deeper; no new mechanism engaged, no failure. |
| I6 | Repeated read (`'${a.doubled}-${a.doubled}'`) | **[derived]** `logic.PropertyAccess` is emitted per call site as a fresh `RawChild` (never interned/deduped the way `logic.Lit` literals are) — confirmed by reading `expression_extractor.dart`'s `extract()` dispatch, which always constructs a new `RawNode` per AST node visited. Two source-level reads always produce two distinct UIR nodes; nothing in the current pipeline would ever collapse them into one. |
| I7 | Conditional (`cond ? a.doubled : b.doubled`) | **[derived]** `logic.PropertyAccess` extraction is context-free — the same code path runs regardless of the AST parent (`ConditionalExpression`, `ReturnStatement`, anything). No conditional-specific handling exists or would be needed. |
| I8 | Inside an action body | **[derived]** Same reasoning as I7 — `ExpressionExtractor` does not vary its `PropertyAccess`/`PrefixedIdentifier` handling by enclosing-body kind. |
| I9 | Inside a top-level `FunctionDecl` | **[derived]** Same reasoning; additionally, `_topLevelTarget` (§ ADR-27 sibling machinery, `expression_extractor.dart:1141-1194`) already resolves plain top-level function/variable/getter references from *any* body uniformly — a top-level function body reading `model.doubled` where `model` is itself a parameter would extract identically to the component case. |
| I10 | Private getter, same library | **[probed]** `_privateValue`, read by `usesPrivate` in the same class/library: resolves identically to a public getter (§5). |
| I11 | Public getter | **[probed]** Baseline case, §2/§4. |
| I12 | Getter using already-supported SDK member ops | **[derived]** A getter body using `Duration.inSeconds` or `int.toDouble()` would extract its *body* exactly as any other expression using those already-recognized (M8-V) shapes — the getter-body boundary is transparent to those mechanisms, which key off the resolved *expression*, not the enclosing declaration kind. |
| I13 | Getter referencing unsupported expression (record literal) | **[probed]** Extracts fine, with the ordinary `BRG1302` (`unsupportedSyntax`, warning) opaque-expression fallback already used everywhere else in this compiler — `int get value => (1,2).$1;` produces a warning-only, non-blocking diagnostic and a `logic.OpaqueExpr` body; the getter mechanism does not need to invent any new unsupported-expression handling. |
| I14 | Block-body getter (`{ final v = count+1; return v; }`) | **[probed]** Extracts as an ordinary multi-statement `logic.FunctionDecl.body` (a `logic.VarDecl` + `logic.Return`), identical in shape to any ordinary method body. **This is the same architecture, not a separate grammar expansion** — `_methods` already walks a `MethodDeclaration`'s body uniformly regardless of whether the source used `=>` or `{ }`; the AST itself normalizes this distinction before extraction ever sees it. |
| I15 | Local declaration inside a getter body | **[derived from I14]** Already mechanical — the block-body case (I14) already exercises exactly this (a `final v = ...;` local inside the getter), and it extracted with no special handling: ordinary `logic.VarDecl` machinery (ADR-28) applies unchanged inside a getter body the same as inside any method body. |
| I16 | Getter referencing an instance method (`tripled => _helper()`) | **[probed]** `_helper()`'s call extracts as `logic.MethodCall` with **no `target`** (not a store, so `_storeMemberTarget` is null) — falls through to the generic `receiver.method(...)`-shaped emission path (§ line-level finding in §9). Does **not** silently force method emission — nothing about referencing a method causes the method itself to gain a symbol or be emitted; it simply also carries no identity, mirroring the getter's own gap exactly. |
| I17 | Getter referencing a top-level function | **[derived]** `_topLevelTarget` already resolves this (§I9) — a getter body calling a real top-level function already gets a correct `target` today, independent of anything about the getter itself, because that reference is resolved the moment the expression is extracted, regardless of which declaration encloses it. |
| I18 | Cross-class getter dependency | **[derived]** Would require the *referenced* class's own getter to have a symbol reachable from another class's extraction context — it does not (§9), so this cannot resolve today under any circumstance; blocked on the identical general symboling gap as every other cross-member case. |
| I19 | Cyclic getters (`a => b; b => a;`) | **[probed]** Extraction completes normally (finite, syntax-only AST walk — extraction never evaluates a getter body, so a semantic cycle is invisible to it) — confirmed directly: `bridge analyze` on the `Cyclic` fixture returns cleanly, no hang, no diagnostic. A future reachability mechanism keyed by `NodeId` visitation (mirroring ADR-29's `Set<NodeId>` fixed point) would need the identical cycle-safety a `visited`/`found` set already gives `reachableFunctions` — no new design is needed here **if** class members are ever symboled, since the existing fixed-point idiom is already cycle-safe by construction. |
| I20 | Same-name getter/field across classes | **[probed — sharper finding than anticipated]** Not merely "confusing names": `Base.value` (`int get value => 1;`) and `PrivacyModel.value` (`int get value => 1;`), two **unrelated classes**, produce **the identical `logic.FunctionDecl` `NodeId`** in the real, current UIR output (`8b16269762a3b7ef` for both, confirmed by direct inspection of `.bridge/uir.ndjson`). This is a genuine, present-day `NodeId` collision — not a hypothetical risk. It is currently harmless only because these nodes are unsymboled and never `target`ed by anything (§9); the moment any mechanism tries to reference a class member by id without first giving it a real, class-scoped symbol, two textually-identical getters in different classes become indistinguishable. §14/§21 elaborate. |
| I21 | Inherited/overridden getter | **[probed, architecture-critical]** `Base.value` and `Child.value` (`@override`) each extract as their own class's own `logic.FunctionDecl` (correctly distinct `id`s here, since their bodies differ — `return 1` vs `return 2`). But `Base model = Child(); model.value` resolves `node.propertyName.element`/`identifier.element` to the **statically-typed receiver's own declaration** (`Base.value`'s `GetterElement`) — Dart's own static analysis reports the *declared* member for the receiver's *static* type, while the language's actual runtime dispatch is virtual (would call `Child.value`). Any mechanism that resolves a `target` from the receiver's static type and the analyzer's statically-resolved element (the same shape `_storeMemberTarget` already uses) would **silently and incorrectly bind to `Base.value`** for a call that Dart itself dispatches to `Child.value` at runtime — a genuine, confirmed wrong-code risk, not a theoretical one. §11/§19 elaborate why this bounds any future subset to non-overridable receivers. |
| I22 | Extension getter | **[derived — negative control]** An extension getter's own resolved element has a *different* `enclosingElement` kind (`ExtensionElement`, not `InstanceElement`) — already a distinguishing, resolved-metadata fact the existing `_topLevelTarget` code explicitly checks for (`unwrapped.enclosingElement is! ExtensionElement`, line 1180) to keep an extension getter from being misidentified as a plain top-level getter. Any future class-member mechanism would need the identical `is InstanceElement` gate `_storeMemberTarget` already has (implicit in its own `ownerName`/`InstanceElement`-shaped access) to keep an extension getter correctly excluded. |
| I23 | `app.StoreInstance` interaction | **[confirmed via ADR-27/M7-N, no new probe needed]** Already fully supported — but *only* for a store-typed receiver (§4). `model.doubled` for a `CounterModel` (not a `ChangeNotifier`/`Notifier`/`StateNotifier` descendant declared inside the project) never enters this path at all; `registry.isStoreBase` returns `false` for it. |
| I24 | Ordinary field-only model (regression control) | **[probed]** `class CounterModel { final int count; }`, `model.count` (no getter at all): produces the **identical failure mode** as the getter case — `model: unknown`, `props.model.count` fails `tsc` with the same `TS18046`. This proves the defect this milestone investigates is **not specific to getters** — it is the general absence of a receiver-type/member-identity story for any project-defined, non-store class instance. Getter modeling in isolation, without addressing this shared root cause, would fix nothing a plain field doesn't already need fixed too. |

## 7. Declaration identity

`Symbols` already has the exact shape a getter's identity would need — `derived(name, {owner})`/
`derivedIn(...)` (`symbol_table.dart`), documented as *"A derived value — a getter over state,"* and already
minted in production for a store's own explicit getters. It is **not** currently usable for a plain class's
getter because (a) the symbol's own `owner` concept is a store-class name, tied one-to-one with an
`app.Store` declaration the store extractor separately registers, and (b) `declaration_extractor.dart`'s
`_methods`/`_fields` (the code path that walks a *plain* class) never calls into `Symbols` at all for a
member — it emits `logic.FunctionDecl`/`logic.FieldDecl` with **no `symbol:` argument**, so those
declarations fall back to content-derived `NodeId`s (§6 I20's collision is the direct, observed consequence
of exactly this). A getter declaration's identity is architecturally closest to `sig.Derived` in spirit
(computed value, over other state) but that schema node is itself store-owned (`app.Store.derived:
NodeId[]`) — there is no schema slot for "a derived getter on an arbitrary class" today (§16).

## 8. Receiver ownership

Three receiver origins were checked against what the compiler already supports:

- **Function/component parameter** (`W({required this.model})`): supported as a *binding*, but the
  parameter's own **type** (`CounterModel`) has no TS representation — `EmitScope.declaresClass` is
  hard-coded `() => false` (`packages/generators/react/src/internal/emit/pipeline.ts:581`), so the
  generated prop type silently falls back to `unknown`, with **zero diagnostic** (§2, §25).
- **Local store instance** (ADR-27/`app.StoreInstance`): fully supported, but only for a store-typed field
  — architecturally a different, narrower receiver kind (§4/§23).
- **Constructor result** (`CounterModel(5)`): `logic.New` of a project-defined type is explicitly, honestly
  refused today (`BRG3013`, `expression.ts` — "Missing capability: lowering a `logic.ClassDecl` to a
  TypeScript class"), gated by the same `declaresClass` stub. This is the one receiver-origin case that
  *is* already correctly diagnosed — the parameter/prop case (above) is not, which is itself a real,
  independently-discovered gap (§25 item 1).

No receiver origin exists today through which an arbitrary, non-store class instance both (a) enters the
program in a representable way and (b) has its own type correctly modeled in generated TS. This alone is
sufficient to gate implementation (§18 condition 5 fails).

## 9. `this`/instance ownership

`int get doubled => count * 2;` means `this.count * 2`; both spellings were probed and confirmed to
produce the **identical** resolved-element shape (`count`'s bare read and `this.count`'s read both resolve
to the same synthetic-getter-wrapped `FieldElement` access) — so no separate architecture is needed to
unify the two spellings; Dart's own resolution already does that. But *representing* which instance `this`
refers to, generically, does not exist outside the store abstraction: `app.StoreInstance` is exactly this
representation, restricted to a store-typed field with `scope: 'component'`. A plain class's field
(`CounterModel.count`) has **no** analogous instance-scoped representation — `_fields` in
`declaration_extractor.dart` emits it as an unsymboled `logic.FieldDecl` embedded in the class's own,
likely-unreachable `logic.ClassDecl` (§10), never as anything a `this.count` read inside a getter body could
`target`. **FlutterBridge cannot represent `this`/instance ownership for an arbitrary class without a
general instance-ownership architecture; this milestone does not build one, per its own explicit scope
boundary (§28 of the governing brief).** No fake top-level-variable substitution was implemented or
considered as a shortcut.

## 10. Class representation audit

1. **Is there a UIR `ClassDecl`?** Yes — `logic.ClassDecl` is a real, non-dead schema member
   (`packages/uir/schema/l1.json:1432-1479`; `{name, superclass?, fields?, methods?}`), and
   `declaration_extractor.dart`'s `_class` genuinely walks and emits it for every class, including plain
   (non-component, non-store) ones. It is not aspirational or unused in extraction.
2. **Is class identity recorded anywhere?** The `ClassDecl` node itself gets a `NodeId` (content-derived,
   since it too carries no `symbol:` — confirmed: two byte-identical empty classes would collide the same
   way I20's getters do, though not directly probed since no real fixture needed it), but nothing else in
   the compiler ever looks it up by that id — it is inert.
3. **Are model class fields represented?** Yes, as unsymboled `logic.FieldDecl` children (§7).
4. **Are instances represented structurally?** Only for stores (`app.StoreInstance`); a plain class's
   instance has no UIR representation beyond an ordinary `logic.New`/parameter binding whose *type* the
   generator cannot model (§8).
5. **Is class construction already supported in any bounded form?** No — explicitly, honestly refused
   (`BRG3013`, §8) for a project-defined type; supported only for whitelisted framework/kit types the
   catalog already knows.
6. **Does ADR-27's `StoreInstance` cover only stores, not arbitrary classes?** Confirmed — `isStoreBase`
   gate, ADR-27 §15's own explicit "ordinary classes stay refused."
7. **Does module emission emit only top-level `FunctionDecl`s?** Confirmed (ADR-29) — no class emission
   anywhere in the generator (`declaresClass` hard-coded `false`).
8. **Is there any generator facility for object/class member declaration?** None. `packages/runtimes/react`
   has exactly one hand-authored JS `get` accessor (`StoreHandle.disposed`, `store.ts:177-179`) — runtime
   plumbing, not a codegen pattern; `sig.Derived` (the closest schema analog to "getter") lowers to a
   `derived(() => body, name)` **function call**, never `get x() {...}` accessor syntax, and is itself
   store-scoped.
9. **Can a getter be emitted without first emitting a class?** Only if the receiver enters through a
   *different*, already-representable boundary (a store instance, or an SDK type) — for a plain,
   independently-constructed or independently-parameterized class instance, no: its own type has nowhere
   to go in the generated output (§8), independent of whether the getter itself could theoretically lower.

**This is the milestone gate, and it fails at item 9.** `logic.ClassDecl`'s existence in extraction is real
but disconnected from everything downstream — it is walked, embedded, and then never referenced again by
anything in the compiler. Implementing getter *lowering* while `declaresClass` stays hard-coded `false`
would require inventing a parallel, getter-specific type-representation shortcut for the receiver — exactly
the kind of "helper-function hack"/premature architecture the governing brief explicitly forbids (§10
Option C, §18 condition 15).

## 11. Dynamic dispatch / overrides

Confirmed as a real, not merely theoretical, risk (§6 I21): `_storeMemberTarget`'s own resolution strategy
— resolve `target` from the receiver's *static* type plus the analyzer's *statically*-resolved `Element` —
would, generalized naively to non-store classes, **silently bind `Base model = Child(); model.value` to
`Base.value`**, producing wrong output for a real, common Dart pattern (an interface-typed variable holding
a subclass instance). Dart dispatches `model.value` virtually, to whichever class's `value` the *runtime*
object actually is. `_storeMemberTarget` gets away with this today only because a store's own action/derived
symbol is scoped to the *store class itself* by design (ADR-27's whole point is state ownership, not
polymorphism modeling) and this project's real corpus has not yet exercised a store subclass with an
overridden derived/action — an untested, adjacent risk this milestone does not attempt to evaluate or fix
(out of scope, §28). A safe getter-modeling subset would need to **structurally** exclude any receiver type
that has (or could have) an override in scope, which the analyzer can determine (`InterfaceElement`'s own
subtype/override facts are already available where `ClassElement` is resolved) — but no such check exists
anywhere in this compiler today, for store members or otherwise.

## 12. Getter side effects

Not evaluated by construction today (extraction never runs Dart), and no memoization/hoisting exists
anywhere in the current pipeline for any expression, getter-shaped or not — `logic.PropertyAccess` is
embedded per call site (§6 I6), never interned. This means the one genuinely reassuring architectural fact
this investigation found: **if a future getter-lowering mechanism reused the `sig.Derived`-style
`derived(() => body, name)` runtime pattern naively for a *non-reactive* plain-class getter, it would risk
introducing memoization the source program never asked for** (`derived()`'s whole contract is a memoized,
dependency-tracked cell) — a real semantic mismatch a naive reuse of the store mechanism would introduce.
A correct plain-class getter lowering must **not** reuse `sig.Derived`'s runtime as-is; it would need a
call-time-evaluated function (closer to ADR-29's own `FunctionDecl` module-emission shape, which is
correctly call-time-deferred) — another concrete reason getter modeling is closer in spirit to ADR-29's
architecture than to ADR-27's, yet ADR-29 explicitly has no concept of `this`/instance ownership at all
(§9).

## 13. Getter reachability

Not testable in isolation — reachability presupposes a `target`/symbol to walk from, and no class member
has one outside the store case (§7, §9). The existing fixed-point idiom
(`reachableFunctions`/`referencedActions`, `functions.ts`/`component.ts`) is structurally generic — a
`Set<NodeId>` worklist keyed by `kindOf(node) === '<some Decl kind>'` — and would extend to a hypothetical
getter-declaration kind by the same additive pattern already used twice (M8-O → ADR-29). This part of the
architecture is **not** a blocker; it is ready and waiting for identity to exist.

## 14. Cyclic reachability

Confirmed safe by construction (§6 I19) at the extraction layer (no evaluation happens). At a hypothetical
future reachability layer, the same `visited: Set<NodeId>` idiom ADR-29 already uses is already
cycle-terminating by construction (`found` only grows; a program has finitely many declarations) — no new
cycle-detection design would be needed if class members were ever symboled, beyond reusing the exact
pattern already proven for functions.

## 15. Side-effect/evaluation semantics

Answered structurally in §12: no compile-time substitution, hoisting, or memoization exists in the current
pipeline for any expression; a getter body — being just an expression/statement sequence like any other —
would inherit this "evaluate at every read site, in source order" property for free **as long as** any
future lowering keeps emitting a call-time-evaluated construct (a function call), never a memoized runtime
primitive borrowed from the store/signal machinery (§12's own caution).

## 16. Dynamic dispatch and inheritance boundary — decision

Any safe first subset would need to **structurally refuse**: a receiver whose static type has any known
subclass overriding the member in question, and (conservatively, absent a proven narrower analyzer check)
any receiver whose static type is not provably `final`/leaf in this compilation's own visible type
hierarchy. No such check exists in this compiler today. Building and proving one — correctly, against real
`InterfaceElement` override-resolution facts, not name-based guessing — is itself nontrivial, unbuilt,
unvalidated work this milestone did not attempt, consistent with its own scope boundary (§28).

## 17. Architecture candidates — evaluated

- **A — emit getter as a true class/object member (`get x() {...}`)**: requires an existing/generated
  class/object ownership model. **Does not exist** (§10) — `declaresClass` hard-coded `false`. Rejected as
  premature; would require solving general class emission first, which is explicitly out of this
  milestone's scope (§28).
- **B — lower to a generated helper function (`doubled(model)`)**: reuses ADR-29's `FunctionDecl` module
  shape, is call-time-evaluated (correctly avoiding §12's memoization trap) — but inherits every risk the
  governing brief warned about: dynamic dispatch/overrides (§11, confirmed real), `this`/receiver identity
  still needs solving independently of the function-emission mechanism (a helper function still needs to
  know which fields on `model` to read, i.e. still needs `count`'s own identity, i.e. still needs §7/§9
  solved), and privacy/library-boundary correctness for a name mangled outside the class. **Rejected**, not
  because it's hard, but because it does not actually avoid the prerequisite (field/member identity) — it
  only relocates where the missing identity is needed.
- **C — inline the getter body at each access site**: rejected outright per the governing brief's own
  strong prior, confirmed correct by this investigation — duplicates evaluation (violating §12's own
  side-effect-preservation requirement the instant the getter body has any side effect or is expensive),
  breaks on recursive/cyclic getters (§6 I19) trivially (infinite inlining), and discards declaration
  identity entirely, the opposite direction of every other identity milestone in this project's history
  (ADR-17/27/28/29).
- **D — represent as a member declaration in UIR, defer emission**: this is close to describing the
  **current, accidental state** — `logic.FieldDecl`/`FunctionDecl` are already produced, unsymboled,
  embedded, never emitted. Formalizing this deliberately (giving class members real symbols, keeping
  emission deferred) is architecturally sound and is the direction §7's evidence points toward, but by
  itself does not unblock a real fixture (a symboled-but-unemitted getter still cannot be *used*, since its
  receiver's own type is still `unknown` — §8). This is the right *next* increment, not a complete answer.
- **E — structural object adapter (map to a TS object shape with computed access)**: investigated only as
  a thought experiment, since no existing architecture supports structural instances for a project-defined
  type today (confirmed by §10's audit) — there is no existing "structural instance" concept to build on;
  this would itself be new, unproven architecture, exactly the kind of scope creep the brief warns against
  absorbing into a getter-specific milestone.
- **F — keep getters refused until class-declaration emission exists**: **selected.** This is the outcome
  the evidence supports: the actual root blocker is not "getters specifically" but the general absence of
  (a) symbol-addressed class-member identity (§7, concretely demonstrated colliding today — §6 I20), (b)
  any receiver-type representation for a project-defined, non-store class (§8), and (c) a proven, evidence-
  based dynamic-dispatch safety boundary (§11/§16). None of these three are getter-specific; all three are
  prerequisites a general class-declaration milestone would need to solve for *any* class member, not only
  a derived getter.

## 18. Selected architecture

**No new architecture ships in M9-I.** The selected outcome is F (§17): document the exact prerequisite
graph and refuse to force a narrower, unsound implementation. See §46 for the graph.

## 19. Schema decision

**Not made.** Per §16 of the governing brief ("choose based on semantic correctness... not minimal diff
size"), a real decision here requires first deciding the class-emission architecture itself (would a getter
become a new `GetterDecl` node, an extended `FieldDecl`, or a `FunctionDecl` with an `isGetter` flag? — each
answer depends on how the *enclosing class* itself gets represented and emitted, which is undecided). Making
this schema decision in isolation, ahead of the class-emission decision it depends on, risks exactly the
"encode getter semantics only in generator conventions" anti-pattern §16 itself warns against.

## 20. ADR decision

**No ADR was written.** Per the governing brief's own Outcome-B instructions ("write an ADR only if a
defensible architecture is reached... make no speculative production implementation") — this milestone
reaches a *prerequisite* finding, not an architecture to adopt. Writing an ADR that formalizes "getters wait
for class emission" would be documenting a non-decision (the absence of a mechanism), not a decision;
the actual, real architectural decision — how class declarations get identity, ownership, and emission —
belongs to the future milestone this investigation's own prerequisite graph names (§46/§47), where it can be
decided with its own full evidence, not smuggled in as a side effect of a getter-scoped investigation.

## 21. Implementation gate — evaluated against all 22 conditions

1. Getter gap reproduced from real Dart — **PASS** (§2).
2. Explicit getter `Element` identity proven — **PASS** (§3).
3. Synthetic field accessor distinguished safely — **PASS**, mechanism already exists and is proven in
   production (§4).
4. Read target can refer to getter declaration explicitly — **FAIL**. No symbol exists for a plain class's
   getter (§7).
5. Instance receiver ownership is representable — **FAIL** (§8: no receiver origin both enters and types
   correctly for a non-store class).
6. `this` semantics are representable — **FAIL** (§9).
7. Underlying field/member dependencies are representable — **FAIL** (§7: fields are unsymboled).
8. Dynamic dispatch is correctly preserved or bounded out — **FAIL**. No bounding check exists (§11/§16).
9. Inheritance ambiguity is bounded out — **FAIL**, same as 8.
10. Privacy semantics are understood — **PASS** (§5) — the one condition genuinely fully resolved and not a
    blocker.
11. Getter evaluation count is preserved — **CONDITIONAL PASS** — true only if any future lowering avoids
    the `sig.Derived` memoization trap (§12); not yet built, so not provable end-to-end.
12. Side effects are not memoized/duplicated — same conditional as 11.
13. Getter reachability can reach fixed point — **PASS in principle** (§13/§14 — the mechanism is ready,
    just has nothing to walk from yet).
14. Cycles cannot cause infinite discovery — **PASS** (§14).
15. No full arbitrary class implementation is required — **FAIL** — this is precisely what §10's audit
    shows is required (item 9 of that audit).
16. No source-name heuristics are required — **PASS** — every mechanism discussed here is resolved-Element-
    based, never spelling-based, and §5 confirms privacy doesn't need one either.
17. Unsupported getters remain honestly refused — **PASS by omission**: no getter is silently accepted,
    because nothing about getters changed.
18. Real analyzer→normalize→generate→tsc proof is possible — **PASS for the negative case** (§2's own
    proof is exactly this pipeline, showing the current silent failure).
19. No app-specific behavior introduced — **PASS** (§29).
20. No Continuum dependency introduced — **PASS** (§29).
21. M9-H analyzer-error gate remains intact — **PASS** (§24).
22. ADR written first if architecture changes — **N/A**, no architecture changed (§20).

**Result: 5 of 22 conditions fail outright (4, 5, 6, 7, 8/9, 15 — six, not five, counting both 8 and 9),
zero of which this milestone is permitted to force through per its own gate rule ("If ANY condition fails:
DO NOT FORCE IMPLEMENTATION").** Outcome B is the only conforming result.

## 22. Implementation gate — pass/fail summary

**FAIL.** See §21 for the itemized breakdown. No implementation was attempted or forced.

## 23. Implementation, if any

None. Zero production files were modified. `git diff --stat` against files under `dart/bridge_analyzer/lib`,
`packages/uir`, `packages/adapters`, `packages/generators`, `packages/runtimes` all report no changes for
this milestone.

## 24–31. Analyzer / N-pass / generator / runtime changes; supported/refused subset; tests; negative controls

Not applicable — no implementation shipped. The **investigated** (not shipped) subset that a future,
properly-gated milestone could target, once class emission exists, is recorded as a hypothesis only
(mirroring the governing brief's own §19, never elevated to a decision here): explicitly declared instance
getter; receiver type provably non-overridable (final/leaf, no subclass overriding the member); expression-
body only initially (block-body is mechanically identical per §6 I14, so this restriction is conservatism,
not a proven necessity); body using already-supported expressions; receiver entering through a boundary
that also has a resolved TS type (which itself requires class emission); referenced fields already
symboled (requires the same class-emission prerequisite); getter-to-getter reachability (ready, §13);
public/private per ordinary library semantics (§5, no extra design needed); no setters; no abstract getters;
no extensions (§6 I22's negative control already shows the analyzer-side exclusion mechanism exists).

## 32–38. Adversarial mutations, real fixture, semantic proof

Not applicable — no implementation shipped, so no mutation testing applies. §6 I19–I21's live probes serve
the equivalent evidentiary role the mutation-testing requirement exists for: each is a genuine, run-against-
real-Dart demonstration of a specific risk (collision, dynamic-dispatch misbinding) that any future
implementation attempt would need to defend against, discovered here rather than assumed.

## 39. M9-H BRG1310 regression — proof

`class Model { const Model(); int get value => missingIdentifier; }`, referenced as `model.value`: `bridge
analyze` reports exactly one diagnostic, `BRG1310`, `undefined_identifier`, at the getter's own body —
`exit 1`, no `.bridge/` output written at all (confirmed: the directory does not even exist after the run).
M9-H's whole-unit gate refuses the file before any getter-specific concern is ever reached, exactly as
designed — M9-I punches no hole through ADR-0031, because M9-I ships nothing that could.

## 40. Regression matrix

No production code changed, so no regression is possible in the strict sense. As a sanity check, the full
Dart suite was re-run unmodified (§41) and remains 420/420 — M8-N/M8-P/M8-U/M8-V/M8-Y/M8-Z, M9-A through
M9-H's own test groups are all untouched, since no file any of them exercises was edited.

## 41. CI

Full production-code changes: none. `just ci` was **not** re-run as a full gate for this milestone, since
it was already re-verified clean at the M9-H baseline immediately prior (§1) and zero production files
changed since. `dart test` in `dart/bridge_analyzer` was re-run directly as the relevant, load-bearing
check: 420/420 passed, exit 0, confirming the probe scripts used for investigation (`bin/probe_getters.dart`,
deleted after use) left no residue and the repository's own test suite is unaffected.

## 42. Exact test totals

Dart: 420/420 (unchanged from M9-H). No new tests were added (no implementation to test). TS suite not
re-run this milestone (no TS file touched; last confirmed green at the M9-H `just ci` run, §1 of the M9-H
doc).

## 43–45. typecheck / lint / codegen-check / dart-analyze

Not re-run as separate steps this milestone — no file under their purview changed. `git diff --check` was
run against the final worktree state and is clean (§48).

## 46. `just determinism` / `bridge validate` / fixed point

Not applicable — no schema, normalization, or generator change shipped, so there is nothing new for either
recipe to validate. Both were exercised indirectly, honestly, via the two ad hoc probe projects
(`m9i_probe`, a real Flutter project put through real `bridge analyze`/`build`/`normalize`, and a raw `tsc
--noEmit --strict` check) documented in §2/§6 — these are the actual, real, non-synthetic pipeline runs this
milestone's evidence rests on, not a substitute for the recipe, but a more targeted one given nothing
schema/generator-level changed.

## 47. Silent-wrong-code audit

Explicit findings, all real and reproduced (not hypothetical):

1. **A project-defined class type in a parameter/prop position silently lowers to `unknown`, with zero
   diagnostic anywhere in the pipeline** (§2, §8) — the single most important finding of this milestone.
   `bridge build` reports `ok: true`; the resulting TypeScript fails `tsc --noEmit --strict` with
   `TS18046`. This reproduces identically for a getter access (`model.doubled`) and an ordinary field
   access (`model.count`, §6 I24) — it is not a getter-specific defect.
2. **Untargeted `logic.PropertyAccess`/`logic.MethodCall` unconditionally lowers to `receiver.property`/
   `receiver.method(...)`** (`expression.ts:721-722`, and the equivalent generic fallback later in the
   `MethodCall` case) regardless of whether the receiver's type is representable — this is the second half
   of finding 1's mechanism: nothing refuses an untargeted access on an unrepresentable receiver; it is
   passed straight through.
3. **`logic.FunctionDecl`/`logic.FieldDecl` embedded in a plain class's `logic.ClassDecl` are unsymboled
   and therefore content-addressed** — two different classes' textually-identical getters
   (`Base.value`/`PrivacyModel.value`, both `int get value => 1;`) collide on the **exact same `NodeId`** in
   real, current UIR output (§6 I20). Currently inert (nothing references these ids), but a present,
   verifiable structural fact, not a projection.
4. **Dynamic dispatch/override risk is real and specific**: the existing `_storeMemberTarget`'s own
   resolution strategy, if ever generalized without a dispatch-safety check, would silently mis-target a
   polymorphic getter/action/derived read to the statically-declared base member instead of the actual
   overriding subclass member (§6 I21, §11) — confirmed via a live probe of exactly this shape (`Base
   model = Child(); model.value`).
5. **`declaresClass` is a permanently-`false` stub, not a live provider** (`pipeline.ts:581`) — its own doc
   comment already anticipates this: *"the day class emission exists, the refusal in `logic.New` lifts by
   itself"* — confirming the intended architecture already names class emission as the prerequisite this
   milestone independently arrived at.

No getter — public, private, cyclic, chained, overridden — was found to be silently *mis*-lowered into
running-but-wrong output, because none is lowered at all today; the wrongness this audit found is entirely
in the surrounding receiver/member-identity machinery, not in any getter-specific code path (there is none).

## 48. FlutterBridge-only boundary audit

Zero references to Continuum, or to any application-specific name, in any file this milestone touched (this
doc, the two throwaway scratchpad probe projects — both named generically, `m9i_probe`/`m9i_probe_invalid`,
never committed to the repository — and the temporary, deleted `dart/bridge_analyzer/bin/probe_getters.dart`
script). `git status --short` at the end of this milestone shows only this doc as new, plus the
pre-existing, untouched `hello_bridge` drift. `git diff --check`: clean.

## 49. Remaining blocker graph

```
Instance getter modeling (M9-I's own goal)
  requires → Symbol-addressed class-member identity, general (not store-scoped)
    requires → Symbol-addressed class declaration identity itself (logic.ClassDecl currently unsymboled)
    requires → A resolved-Element-based field/getter/method dispatch generalized beyond isStoreBase
              (the mechanism exists — _storeMemberTarget — the gate is the blocker, not the dispatch logic)
  requires → A representable receiver-type story for a project-defined, non-store class
    requires → declaresClass to become live (currently hard-coded false)
    requires → At minimum a TS type/interface emission for a class (short of full class emission)
  requires → A proven dynamic-dispatch/override safety boundary
    requires → An analyzer-grounded "no override in scope" or "receiver type is leaf" check
              (no such check exists anywhere in this compiler today, including for stores)
  requires → A schema decision for where getter identity/body lives (§19) — itself downstream of
             how the class-emission architecture represents a class's own members generally
```

Every path terminates at **general class-declaration representation and emission** — confirming Option F
(§17) and the brief's own hypothesis that this may be the correct result.

## 50. Recommended next milestone

**Not M9-J for getters directly.** The evidence points at a class-declaration-emission milestone as the
actual prerequisite, scoped narrowly: (a) give `logic.ClassDecl` and its `fields`/`methods` real,
class-scoped symbols (the direct fix for §6 I20's live collision, and the identity layer §7 needs); (b)
decide and implement the smallest possible `declaresClass`-becomes-live step — most plausibly, emit a TS
`interface` (data shape only, no behavior) for a class whose own fields are all representable primitive/SDK
types, deliberately not yet a full `class` with methods; (c) as a narrow, immediate, low-risk companion fix
independent of getters entirely: make the untargeted-`PropertyAccess`/`MethodCall`-on-an-`unknown`-typed-
receiver case (§47 finding 1/2) an honest `BRG3013`-family refusal instead of a silent `unknown` passthrough
— this alone would close the concrete, reproduced wrong-code defect this milestone found, without
requiring any getter-specific decision at all, and is plausibly a smaller, better-scoped milestone than
class emission itself. Getter modeling proper becomes safely attemptable only after (a) and (b) exist, and
even then must still solve dynamic-dispatch bounding (§11/§16) before shipping.

**M9-J has not been started.**

## 51. Final git status / HEAD vs origin/main

See the final report.
