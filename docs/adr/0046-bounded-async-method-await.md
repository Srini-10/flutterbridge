# ADR-0046 — Bounded Async Method Calls via Explicit `await`

## 1. Semantic problem

Dart's `async`/`await` is a real, common construct. FlutterBridge's extraction layer has never checked
`isAsync` when resolving a method call's own `target` (confirmed live, M9-era/ADR-0039 §5), so an async
method call already resolves a target regardless of whether the Dart source ever awaits it — but the
GENERATOR unconditionally excludes any `isAsync === true` method from ever being lowered to a callable
helper, so every async method call refuses honestly (`BRG3013`), whether awaited or not. This ADR admits
the bounded subset that is genuinely, explicitly awaited — never a bare, un-awaited call, and never an
inferred one.

## 2. Current limitation — confirmed live

A probe (`Future<int> load() async => count * 2;`, called both as `await model.load()` and as bare
`model.load()`) confirms: the extraction layer already resolves `target` for BOTH forms identically
(`isAsync` has never gated target resolution); the generator's member-helper loop
(`functions.ts`, both the instance/static loop and the separate top-level-function loop) unconditionally
excludes `isAsync === true` before any attempt at emission; the resulting diagnostic is the pre-existing
"target set but no helper" `BRG3013` (`fixtures/apps/method_call_refusal`'s own `AsyncModel`/
`AsyncMethodCallOnLocal`, unaffected by this milestone — its own call is un-awaited).

## 3. Semantic primitive: explicit await-required call context

Not `method.isAsync == true` alone — the primitive is **an async method call reached as the direct
operand of Dart's own `AwaitExpression`**. This is never inferred from the callee's own return type (a
`Future`-returning method may legitimately be referenced without awaiting it, e.g. to pass the `Future`
onward — this ADR does not support that shape, but it is a DIFFERENT, unsupported shape, not "the same
call, awaited implicitly"). `AwaitExpression.expression` is a plain `Expression` (analyzer 14.0.0,
`src/dart/ast/ast.dart` — no narrower static type); the extractor pattern-matches its runtime shape
(`is MethodInvocation`, after unwrapping any parentheses — grouping, not semantics, the identical
discipline `ParenthesizedExpression`'s own case already applies) rather than trusting a type.

## 4. Fresh analyzer evidence

- An async method's own `MethodElement.firstFragment.isAsynchronous` is real, already-resolved, and was
  already being read (to EXEMPT the return-type check, ADR-0039 §5) — never newly discovered by this ADR.
- An async method's own `element.returnType` is `Future<T>` — confirmed live: `Future<int>`'s own
  `TypeRef.name` (the analyzer's `getDisplayString()`) is literally the string `"Future<int>"`. `TypeRef`
  (`shared.json`) has no `typeArguments` field — a generic instantiation is opaque, by design (ADR-0034
  §12) — so `T` is recovered from the REAL analyzer `InterfaceType.typeArguments` at extraction time,
  never by parsing the display string.
- `DartType.isDartAsyncFuture` (analyzer 14.0.0, `dart/element/type.dart`) is a real, already-shipped
  semantic predicate, the identical shape as `isDartCoreInt`/`isDartCoreBool` etc. this codebase already
  uses throughout `_isEligibleMethodReturnType`.
- `typeTextOf` (the generator, `types.ts`) has zero generic-instantiation parsing — confirmed by reading
  its full body: a name like `"Future<int>"` reaches `PRIMITIVES["Future<int>"]`, which is `undefined`,
  falling through to the literal string `'unknown'`. Passing an unwrapped `Future<T>` return type through
  unchanged would have silently reproduced this exact shape.
- Async store actions (`sig.Action`) and component event handlers already emit real `async (...) => {...}`
  with real, working `await` — confirmed live (`store.ts`, `component.ts`) — but neither ever annotates an
  explicit return type on the emitted arrow function (TypeScript infers it); the method-helper path
  (`functions.ts`), by contrast, ALWAYS writes an explicit `: ${returnType}` — the one asymmetry this ADR
  must resolve by computing a real `Promise<T>` annotation, not by omitting one.

## 5. Supported subset

A call to an already-M10/M11-eligible instance or static method (ADR-0039/ADR-0045's own full shape gate
— public, non-abstract, non-external, non-generic, non-`@override`, uniformly-positional parameters) whose
own declared return type is `Future<T>` for a `T` that independently passes the identical
`_isEligibleMethodReturnType` gate a synchronous method's own return type already must (a `dart:core`
value type, or a dispatch-safe project class) — AND whose call site is the direct operand of an
`AwaitExpression`. Composes with: M10-B internal composition (an async method awaiting a sibling), M10-D
return-value chaining (an awaited `Future<ProjectClass>`, its own further member read), M10-E optional
defaults, M11-A static method access, cross-file declarations.

## 6. Refused subset

- A bare, un-awaited call to an async method (`model.load()`, no `await`) — the pre-existing `BRG3013`
  refusal, completely unchanged; `AsyncModel`/`AsyncMethodCallOnLocal` in `method_call_refusal` stays a
  valid, permanent negative control.
- `Future<dynamic>`, `Future<List<int>>`, `Future<SubclassType>`, or any other `T` the synchronous
  return-type gate would already reject — refused via the identical, shared eligibility check
  (`_isEligibleMethodShape`), never a second, async-specific type table.
- A private, abstract, external, generic, `@override`, or named-parameter-bearing async method — refused
  via the identical, unmodified gates every synchronous method already goes through.
- Async recursion, an inherited/overridden async method reached through a subclass-typed receiver, an
  async getter/setter/field, an async constructor — none of these is implemented; each hits an existing,
  unmodified refusal boundary.

## 7. UIR/schema impact

None. `logic.Await` (`operand`, `type`, both already required) is unchanged. No new node kind, no new
schema field. `TypeRef` gains no structured generic-argument representation — the Future's own `T` is
recovered from the real analyzer `DartType` at extraction time, and the extracted `returnType` TypeRef
describes `T` directly (never `Future<T>`), exactly as a synchronous method's own returnType already does.

## 8. Extraction changes

- `_invocation` gains an `awaited` parameter (default `false`), threaded through the bare-instance-call
  path, the bare/static-qualified path, and `_methodCallOn` (the explicit-receiver path, including its
  safe-navigation (ADR-0044) sibling branches).
- `_externalMethodTarget`/`_staticMemberTarget` each gain the identical `awaited` parameter: when the
  resolved element is `async` and `awaited` is false, the target does not resolve — a non-async method's
  eligibility is completely unaffected either way.
- The `AwaitExpression()` extraction case unwraps parentheses, and — only when the (unwrapped) operand is
  directly a `MethodInvocation` — routes it through `_invocation(..., awaited: true)` instead of the
  generic `extract(...)` dispatcher. Every other awaited expression shape (a `Future`-typed variable, a
  getter) is unaffected, extracted exactly as before.
- `_isEligibleMethodShape` (shared by both `_externalMethodTarget` and `_staticMemberTarget`, M11-A) no
  longer exempts an async method's return type from checking — it unwraps `Future<T>` via
  `DartType.isDartAsyncFuture`/`typeArguments`, and checks `T` against the identical
  `_isEligibleMethodReturnType` gate a synchronous return type already must pass.
- `declaration_extractor.dart`'s `_methods` (class methods only — top-level async functions remain
  entirely untouched, per this ADR's own non-goal, §11) computes its own `returnType` field from the
  Future's own unwrapped type argument for an `async` method, via a new `_valueReturnTypeOf` helper — the
  `isAsync` flag (already captured, unconditionally) is what tells the generator to re-wrap the result.

## 9. Generator changes

- The instance/static member-helper loop (`functions.ts`) no longer excludes `isAsync === true` — an
  async method's own eligibility for REACHING this loop at all was already decided upstream, at
  extraction (§8); this loop's own job is now only to adapt its emitted shape.
- The emitted signature gains the `async` keyword when `isAsync`; the return-type annotation is wrapped
  `Promise<${valueReturnType}>`.
- `logic.Await`'s own lowering (`await ${operand}`) is completely unchanged — once the callee resolves to
  a real, callable, `Promise`-returning helper, the pre-existing unconditional lowering composes correctly
  for free, exactly as M10-F's safe-navigation `logic.Conditional` reuse already demonstrated the same
  "reuse an existing node verbatim" principle.
- Reachability (`directMemberRefs`) needed NO change: it already recurses generically through every child
  field of every node (`Object.values(node)`), so a `logic.MethodCall`/`logic.Call` nested inside a
  `logic.Await.operand` is already discovered by the identical walk M11-A's own static-method extension
  already added — confirmed live, not assumed.
- The TOP-LEVEL function loop's own `isAsync === true` exclusion is deliberately left UNCHANGED — a
  top-level async function is not part of this ADR's own selected subset (§11).

## 10. Runtime impact

None. The lowered form is a plain, standalone, `async`-keyword, `Promise`-returning module-level function
— no runtime class, no Promise-manipulation helper, no new abstraction.

## 11. Non-goals

Un-awaited async calls (stay refused, unchanged); arbitrary `Future`/`Promise` manipulation; async
constructors, getters, setters, fields; generic async methods; async recursion; implicit await insertion;
stream/async-generator support; top-level async functions (the existing, separate exclusion site is
deliberately untouched — no evidence in this milestone's own investigation shows it "falls out naturally,"
since a reachable top-level function still resolves through `scope.node()`'s own top-level index, a
structurally different reachability path this ADR did not need to touch).

## 12. A real, pre-existing, unrelated bug found — documented, not fixed

While building this milestone's own fixture, a genuine, pre-existing, UNRELATED bug was found: a local
variable declared inside a `sig.Action` (store action) body and read by a LATER statement in the same body
fails with `BRG3006` ("not declared in this program") — reproduced with ZERO async/await involvement
(`final r = 5; result = r;`). Root-caused directly: `store.ts`'s own `actionScope` helper only overrides
`paramInScope`, never `localName` — unlike `functions.ts`'s member-helper loop (which explicitly computes
`localBindingsIn(body)` and wires it into `localName`) and `expression.ts`'s own inline-`logic.Lambda`
case (which does the identical thing, confirmed correct by direct code reading). A structurally similar
symptom was also reproduced for a `StatefulWidget`'s own inline `onPressed: () async {...}` handler with a
nested `setState(() {...})` closure; its own root cause was not further isolated within this milestone's
own scope (extraction/normalization were directly confirmed innocent — the affected reference's own
`target` field matches its declaration's id both before and after normalization). Not fixed here: it
affects synchronous local variables identically, is unrelated to `async`/`await` specifically, and this
milestone's own fixture was designed around it (direct assignment from an awaited call — `result = await
model.load();` — rather than an intermediate local) rather than needing to solve it. Recorded as a real
candidate for a future, dedicated investigation (§ milestone doc's own "remaining frontier" section).

## 13. Alternatives rejected

- **Inferring `await` from the callee's own `Future`-returning type.** Rejected outright — the governing
  brief's own explicit, non-negotiable requirement (§9): a bare, un-awaited call must never be silently
  promoted. Doing so would also be semantically wrong: Dart itself permits obtaining a `Future` without
  immediately awaiting it, and this compiler must never assume the two are interchangeable.
- **A new UIR node for "awaited call," instead of reusing `logic.Await`.** Rejected: `logic.Await` already
  exists, already carries exactly the two fields needed (`operand`, `type`), and its own lowering already
  composes correctly with a `Promise`-returning helper the moment one exists — inventing a second
  representation would duplicate machinery for no capability gain, the identical reasoning ADR-0044 §19
  already applied when it rejected a second null-aware representation.
- **String-parsing `TypeRef.name` to recover `Future<T>`'s own `T`.** Rejected: fragile, and unnecessary —
  the real analyzer `DartType`/`InterfaceType.typeArguments` is available at the one place (extraction)
  that has it, and using it keeps the schema and the generator completely untouched by any Future-specific
  parsing logic.
- **Also admitting top-level async functions in this same milestone.** Rejected: no evidence gathered
  during this investigation showed the existing top-level-function reachability path (`scope.node()`'s own
  top-level index, structurally different from the member-helper path this ADR extends) would admit an
  async function safely without its own, separate investigation — deferred rather than assumed safe.
- **Fixing the `store.ts`/local-variable bug found in §12 as part of this milestone.** Rejected: it is not
  async-specific (reproduced with zero `await` involvement), and fixing it is not necessary for this
  milestone's own correctness — the positive fixture was built around it instead, honestly, rather than
  silently expanding this milestone's own scope to include an unrelated fix.

## 14. Mutation-testing plan

At minimum: remove the extraction-side `awaited` gate (would admit a bare, un-awaited async call); remove
the generator-side `Promise<...>` wrapping (would silently under-type an async helper's own return);
bypass the return-type re-validation in `_isEligibleMethodShape` (would reproduce the `unknown`-return
shape for `Future<dynamic>`); remove the static-async eligibility gate specifically (a static async method
must be independently protected, not merely inherit the instance gate); corrupt the reachability discovery
for an awaited static call; remove the `async` keyword from the emitted signature while keeping the
`Promise<...>` return type (a real `tsc --strict` failure — `await` used, or a bare value returned, inside
a non-`async` function).
