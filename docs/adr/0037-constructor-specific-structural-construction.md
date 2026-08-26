# ADR-0037 — Constructor-Specific Structural Construction

## 1. Why a class-global mapping became ambiguous

ADR-0036 (M9-O) proved one narrow shape: a class with exactly one applicable unnamed constructor lowers
to a plain object literal, and stored the result — an ordered field mapping — directly on the class's own
`ClassDecl` (`constructibleFieldOrder`). That representation assumed *one* constructor per class needs
representing. It breaks the moment a class declares two independently eligible constructors:

```dart
class Model {
  final int count;
  final String name;

  Model(this.count, this.name);
  Model.named(this.name, this.count);
}
```

Both `Model(1, 'A')` and `Model.named('A', 1)` are, independently, exactly the bounded shape ADR-0036
already proved safe — but they bind arguments to fields in *opposite* orders. A single class-level array
cannot represent both without one silently overwriting the other. Reproduced fresh, before any code
changed: extracting this class with M9-O's own implementation, unmodified, discards one constructor's own
mapping in favor of whichever the extractor's own internal search visits — an extraction defect masquerading
as a a valid shape, not a documented boundary.

## 2. Constructor identity is already unique — no new identity node needed

A constructor's identity is `(the ClassDecl that owns it, the constructor's own name)`. Dart itself forbids
two constructors sharing a name on one class, and two different classes are already two different
`ClassDecl` ids (M9-K's own owner-qualified identity). Composing these two already-unique facts gives a
complete, collision-free identity for every constructor in the program, without inventing a new
`ConstructorDecl` node, a new `Symbols.constructor(...)` scheme, or a new NodeId kind. Verified directly:
`Alpha.named`/`Beta.named` (different classes, same constructor name) and `Model()`/`Model.named()` (same
class, different constructor names) each resolve to distinct entries, by construction — there is no shared
registry for either case to collide in.

## 3. Selected architecture: a constructor-keyed array on `ClassDecl`

Of the candidates the governing brief named:

- **A — constructor-keyed mapping on `ClassDecl`** (selected): `ClassDecl.constructibleConstructors`, an
  array of `{ name?, kind, fields }` entries, one per eligible constructor.
- **B — a bounded `ConstructorDecl`-like record type owned by `ClassDecl`**: rejected as over-schema for
  what this milestone actually needs — a constructor here has no children beyond its own field mapping,
  so a `ConstructorDecl`-shaped node under `UirNodeBase` (its own id, its own span) would add machinery
  (an id, an anchor slot) nothing consumes. Option A's plain, non-`UirNodeBase` record type (the same
  shape `ParamDecl`/`SwitchCase` already use in this schema) is complete without it.
- **C — map constructor identity → field mapping, as a separate top-level structure**: rejected —
  redundant with A, which already places the mapping exactly where the one consumer (the generator,
  resolving a construction via the class's own `type.target`) already looks.
- **D — keep one class-global mapping, restrict each class to one constructible constructor**: rejected —
  this is the status quo ADR-0036 shipped, and §1 above is the proof it is not merely "narrower" but
  actively wrong (silently ambiguous) the moment a real class declares two eligible constructors, which
  the primary M9-P acceptance case does.
- **E — construction-site metadata**: not resurrected. ADR-0036 §6 already rejected this once, on the
  evidence that no Element→AST reverse-navigation API exists in this analyzer version for a cross-file
  constructor site, and `extractor.dart`'s own "one walk" invariant rules out a two-pass workaround. That
  evidence is unchanged; this ADR does not re-litigate it.

## 4. Declaration-time computation, preserved unmodified

Every constructor's own eligibility is still computed once, at class-declaration extraction time, in
`_class` (`declaration_extractor.dart`) — the identical timing ADR-0036 established, for the identical
reason: this is the one place same-file AST access to every one of the class's own constructors already
exists, with no second walk. The only change is that the loop that used to stop at the first eligible
unnamed constructor now evaluates **every** constructor independently and keeps every one that qualifies.

## 5. Per-constructor eligibility, unchanged from ADR-0036 §8/§18–§24

Each constructor is still, independently: non-`const`, non-factory, non-redirecting, an empty body
(`is EmptyFunctionBody`, the real AST type), an empty initializer list. What changed is *which* constructor
this applies to — every one the class declares, not only the unnamed one — and the field-formal shape it
must have (§7 below). The **whole-class** prerequisite (ADR-0036 §9/§10, unchanged) still gates the entire
class before any constructor is even considered: every instance field public/final/non-static/non-late, the
class itself public/non-generic/no superclass/`implements`/`with`.

## 6. Safe and unsafe siblings coexist, by construction

A constructor failing its own eligibility is simply omitted from `constructibleConstructors` — it neither
disqualifies a sibling constructor nor is disqualified by one succeeding. Proven directly:
`Model(this.count)` (safe) alongside `Model.bad(this.count) { sideEffect(); }` (unsafe: non-empty body) on
one class yields exactly one entry, for the unnamed constructor; `Model.bad` is absent, not merely marked
refused. The independence is structural, not merely tested: each constructor is evaluated by its own call
to `_constructibleConstructorEntry`, sharing nothing but the whole-class field-eligibility facts computed
once above it.

## 7. Required named field-formal parameters — the second axis this ADR adds

ADR-0036 admitted only required-positional field-formals. This ADR admits required-**named** field-formals
too — `Model({required this.count, required this.name})` — under the identical constructor-level
eligibility (§5), plus one additional constraint: a constructor's own field-formal parameters must be
**uniformly** required-positional or **uniformly** required-named. A constructor mixing the two
(`Model(this.count, {required this.name})`) is excluded entirely — narrower than Dart itself allows, kept
out of the first subset deliberately, per the governing brief's own "narrowest proven subset" instruction.
Each `constructibleConstructors` entry therefore carries its own `kind: "positional" | "named"` discriminant.

An optional (non-`required`) named field-formal, with or without a default, is excluded — defaults are
investigated and deferred in §16.

## 8. Named-argument resolution is semantic, not textual — and provably so

For a required named field-formal, Dart's own grammar fixes the parameter's external label to be exactly
its own declared name — `{required this.count}` can only ever be called as `count: ...`; there is no syntax
that lets a field-formal's own external label differ from the name that follows `this.`. Extraction already
resolves that parameter's own target field via `FieldFormalParameterElement.field` (ADR-0036 §7/§24,
unchanged) — never by reading the parameter's name as text. The chain `argument label → parameter identity
→ field-formal target → canonical field` is therefore fully proven **once**, at extraction time, for the
*declaration*. At the *call site*, matching a `namedArgs` key against that same field's own name is not a
fresh, unproven guess — it is the necessary closure of a chain Dart's own grammar already guarantees holds,
and the one place text comparison is safe precisely because nothing about it could be textually spoofed:
there is no way to write a call whose named-argument label differs from the field-formal's own name and
still mean the same parameter.

## 9. `namedArgOrder` — the one new field this ADR required, and why

Preserving Dart's own left-to-right argument evaluation order was the "NON-NEGOTIABLE" requirement of the
governing brief for named arguments. `logic.New.namedArgs` cannot carry it: it is an ordinary
`RawMap`, and `RawMap`'s own documented contract (`raw_node.dart`) canonicalizes every map to **sorted key
order** before it is ever serialized — a property every other `namedArgs`-carrying node in this schema
already relies on for determinism, and one that does not matter for a consumer that only reads *values*
(`EdgeInsets.symmetric(vertical: 8)`, unaffected). It does matter here: an object literal's own emitted
property order is that literal's own evaluation order (ECMAScript), and Dart's own evaluation order for
`Model.named(name: exprA(), count: exprB())` is source (left-to-right) order regardless of the
constructor's own parameter declaration order.

Rather than changing `namedArgs` itself — which would re-canonicalize (or need to stop canonicalizing)
every other consumer's own named arguments throughout the whole schema, a strictly larger and riskier
change — this ADR adds one new, narrowly-scoped field: `logic.New.namedArgOrder: string[]`, the call's own
named-argument labels in real source order, captured directly from `InstanceCreationExpression
.argumentList.arguments` (which the AST already walks in source order) at the one call site
(`_construction`) that needs it. `logic.Call`'s own two call sites of the shared `_arguments()` helper leave
it `false`; `namedArgOrder` is absent for them, unchanged. This is additive, optional, and touches no
existing consumer of `namedArgs`.

## 10. Property emission order

For a `"positional"` entry: unchanged from ADR-0036 — `fields[i]` pairs with `args[i]`, in that shared index
order, which is already the constructor's own parameter/call-argument order. For a `"named"` entry: the
generator iterates `namedArgOrder` (the call's own real source order), resolving each label directly against
`namedArgs[label]` and emitting properties in that exact order — never the entry's own `fields` array order
(which carries only determinism, not calling significance, per §7), and never sorted. Proven with two
dedicated cases: a call written in the opposite order from the constructor's own declaration, and a call
written in the *same* order as the declaration — both must, and do, preserve the call's own order.

## 11. Positional and named mapping stay two independent concepts

Both ultimately reduce to "argument expression, paired with a field target, in real evaluation order" — but
they are resolved by different keys (index for positional, label for named) and never conflated. No
temporaries are introduced for the named case: JavaScript's own written-order property evaluation is
sufficient once the properties themselves are emitted in `namedArgOrder`'s own order, so the "evaluate into
temporaries first" fallback the governing brief allowed for was not needed.

## 12. Defaults and optional parameters — investigated, deferred

Optional positional (`Model([this.count = 1])`) and optional named (`Model({this.count = 1})`)
field-formals were investigated only far enough to confirm the boundary: both are excluded from
`constructibleConstructors` entirely, at the same eligibility gate as any other disqualifying shape. Going
further — synthesizing an omitted argument's own default value — was not attempted. It would require
resolving the default expression as a genuine compile-time constant (or, worse, executing arbitrary Dart at
generation time for a non-constant default), a materially different capability from "map this argument to
this field," and the governing brief's own explicit stop rule (§17/§41 of the brief) calls for exactly this
outcome: land the smaller, fully mechanical subset, and defer defaults rather than delay this milestone
chasing them. Deferred to M10+.

## 13. Factory, redirect, body, and initializer-list exclusions — unchanged, and isolated

§5 above states these are unchanged in *substance* from ADR-0036. They were re-verified, per constructor,
with dedicated tests — including one deliberately designed to isolate the `factoryKeyword`/
`redirectedConstructor` checks from the body/field-formal checks that redundantly protect most real-world
examples: `factory Model() = Model.raw;` has an `EmptyFunctionBody` (no `{}`/`=>` of its own) and, on a
fieldless class, trivially satisfies the field-formal bijection at zero parameters — only the
`factoryKeyword`/`redirectedConstructor` checks themselves stand between this shape and being wrongly
accepted. An adversarial mutation removing both checks was caught by exactly this test and no other in
this suite, confirming it is not redundantly protected the way the ordinary factory/redirect examples are.

## 14. Const, generics, inheritance, and privacy — unchanged

`node.isConst`/`ctor.constKeyword` are both still checked (ADR-0036 §22, unchanged): a `const` invocation of
an otherwise-eligible constructor is still refused, canonicalization semantics remain out of scope. Generic
classes, classes with an explicit superclass/`implements`/`with`, and private classes remain excluded at the
whole-class gate (§5), unaffected by which or how many constructors a class declares. This ADR does not
introduce, and does not need, any new exclusion for a private constructor **name** on an otherwise-public
class (`Model._raw(...)`) beyond what already follows from Dart's own cross-library privacy rules — no
project-class construction reaches this generator from outside the declaring library in the first place for
such a name to matter, and this ADR's own real fixture and tests never exercise cross-library private
construction.

## 15. M9-N field-read capability and M9-J refusal boundary — unaffected

Neither this ADR's own architecture change nor its two new capabilities (named constructors, required named
field-formals) touch `expression.ts`'s receiver classification (`isParameterReceiver`,
`isUnmodelledMemberReceiver`) or M9-N's own field-target mechanism at all — confirmed by inspection, not
merely by absence of a failing test. A field read on a value produced by *any* of this ADR's own
constructions remains governed entirely by the pre-existing M9-N boundary, exactly as ADR-0036 §14
established for M9-O's own constructions: explicit getters and methods remain unconditionally refused
regardless of which constructor produced the receiver.

## 16. Cross-file named construction

Reuses M9-M's own type-reachability/import machinery unmodified, identically to ADR-0036 §16/§17: resolving
the constructed class's own `constructibleConstructors` through its `TypeRef.target` works the same whether
the class and its construction site share a file or not, and — per the identical reasoning ADR-0036 §17
already gave for the unnamed case — no import of the constructed class as a *value* is ever required, since
this generator never annotates a local's own declared type and an emitted object literal's own inferred
shape already satisfies the class structurally.

## 17. Schema summary

- `ClassDecl.constructibleFieldOrder` (ADR-0036) — **removed**, superseded by `constructibleConstructors`.
  No consumer of the old field survived this ADR's own implementation; nothing was left dual-tracked.
- `ClassDecl.constructibleConstructors: ConstructibleConstructor[]` (new) — one entry per eligible
  constructor, `{ name?: string, kind: "positional" | "named", fields: NodeId[] }`.
- `logic.New.namedArgOrder: string[]` (new) — the call's own named-argument labels, in real source order;
  present only alongside `namedArgs`, and only ever populated for `logic.New` (§9).
- `logic.New.fieldTargets` — the abandoned ADR-0036 construction-site design, already fully removed before
  this ADR (dead schema surface cleaned up as part of M9-O's own closure); this ADR does not reintroduce it.

`shared.json`'s `x-uir-version`: `1.12.0` → `1.13.0` (`constructibleConstructors`) → `1.14.0`
(`namedArgOrder`).

## 18. Determinism

`constructibleConstructors` is a pure function of each constructor's own resolved AST/element facts,
computed once per class, in source declaration order — no unordered map is ever iterated to produce it.
`namedArgOrder` is captured directly from the AST's own argument list, itself deterministic. The generated
object literal's own property order is a pure function of `namedArgOrder`/`args` and the matched entry's
own `fields`, never of iteration order over any unordered collection. Reconfirmed via a dedicated
same-source, two-run extraction test asserting the entire `constructibleConstructors` array is identical
across runs, and via `just determinism` over the existing corpus.
