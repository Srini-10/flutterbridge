# ADR-0044 — Bounded Safe-Navigation (`?.`) Member Access

## 1. Problem

Dart's safe-navigation operator (`model?.count`, `model?.doubled`, `model?.multiply(3)`) short-circuits to
`null` when the receiver is `null`, evaluating neither the member access nor any arguments. Investigation
for this milestone found that the extractor currently DROPS this semantic entirely — a null-aware access
is extracted identically to an unconditional one, and the currently-shipped generator (through M10-E,
`861bdbf`) reaches real `tsc --strict` failures or, worse, an unconditional runtime property/function
access that Dart itself would never have permitted unguarded.

## 2. Current behavior — confirmed live, not assumed

A real probe (`Model? model` — a component's own constructor field, `model?.count`, `model?.doubled`,
`model?.multiply(3)`, run through the real analyzer → extraction → normalization → generation → `tsc
--strict` pipeline) confirms:

- The extracted UIR for `model?.count` is BYTE-IDENTICAL in shape to what unconditional `model.count`
  would produce — a plain `logic.PropertyAccess` with `receiver: {kind: 'logic.Ref', name: 'model', type:
  {name: 'Model?', nullable: true, target: ...}}` — no field, flag, or node anywhere records that the
  source used `?.` rather than `.`.
- The generated TypeScript is `props.model.count`, `Model_doubled(props.model)`, `Model_multiply(props.model,
  3)` — a plain, unconditional access and two helper calls receiving a `Model | null` value where the
  helper's own signature declares `self: Model` (non-nullable).
- Real `tsc --strict` fails with three real errors: `'props.model' is possibly 'null'` (TS18047) on the
  field read, and two `Argument of type 'Model | null' is not assignable to parameter of type 'Model'`
  (TS2345) on the two helper calls.
- This reaches `tsc` as a hard failure with **zero diagnostic from this compiler itself** — `reported`
  contains no error — the exact silent-wrong-code shape M9-R/ADR-0041/ADR-0042/ADR-0043 each already found
  and closed once for a different construct.

By contrast, the SAME reduction ladder confirms two adjacent, semantically related forms **already work
correctly, with zero gaps**:

- **Null-assertion** (`model!.count`, `model!.doubled`, `model!.multiply(3)`) — the analyzer's own type
  system promotes the asserted expression's static type to non-nullable `Model`, so `_dispatchSafeReceiverClass`
  and every downstream eligibility gate see an ordinary non-nullable receiver; the extractor's own
  pre-existing `logic.NullCheck` node (`operand`, optional `fallback`) already lowers `!` to a real
  TypeScript `!` assertion. Confirmed via the same live probe: real `tsc --strict` passes.
- **Flow-promoted access** (`final m = model; if (m != null) { m.count; ... }`) — Dart's own flow analysis
  promotes `m`'s static type to non-nullable inside the guarded branch; TypeScript's own control-flow
  narrowing independently reaches the identical conclusion for the SAME `!== null` ternary condition this
  compiler already lowers an `if`/`else` return to. Confirmed via the same live probe: real `tsc --strict`
  passes, with no change needed anywhere.

The gap is precisely, and only, the safe-navigation operator itself.

## 3. Fresh analyzer evidence

`PropertyAccess.isNullAware` and `MethodInvocation.isNullAware` (analyzer 14.0.0,
`package:analyzer/src/dart/ast/ast.dart`) are real, already-resolved boolean properties — the analyzer has
already parsed and resolved which operator (`.` or `?.`) the source used; nothing needs to be inferred.
`_dispatchSafeReceiverClass` (the shared eligibility gate under every field/getter/method resolution since
ADR-0038) does not inspect `nullabilitySuffix` — Dart's own `InterfaceType` encodes nullability as a suffix
on the same type, not a distinct type, so a nullable-typed receiver already, correctly, passes the
STRUCTURAL half of every existing eligibility check (owner class, generic-instantiation exclusion,
component/state/store exclusion) — declaration provenance and member eligibility are unaffected by
nullability, confirmed directly: `model?.count`'s own `PropertyAccess` node already carries a real `target`
today. The gap is entirely that nothing downstream ever asks whether the SOURCE guarded the access.

## 4. Reduction ladder

Built and run through the real pipeline (a scratch probe, formalized into the fixture, §17):

1. Baseline — unconditional access on a non-nullable receiver. Already correct (unaffected).
2. Null-assertion (`!`) on a nullable receiver. Already correct (§2).
3. Flow-promoted access after an explicit null check. Already correct (§2).
4. **Safe navigation on a bare parameter/component-prop reference** (`model?.count`,
   `model?.doubled`, `model?.multiply(3)`) — currently broken (§2). **Selected positive subset.**
5. **Safe navigation on a bare local-variable reference** (`final local = model; local?.count`) — currently
   broken, identically. **Selected positive subset.**
6. Safe navigation combined with `??` (`model?.count ?? -1`) — currently broken (the inner access still
   drops `?.`); the OUTER `??` itself is unaffected once the inner access is fixed, since `logic.NullCheck`
   already lowers `??` correctly and simply wraps whatever expression it is given.
7. Chained safe navigation (`model?.next()?.count`, where `next()` also returns a nullable type) — currently
   broken at BOTH links. Out of this ADR's own selected subset (§6) — the inner receiver of the second `?.`
   is a METHOD CALL, not a bare reference (§7's own restriction), so this refuses honestly rather than
   silently duplicating a call.
8. Safe navigation on a constructed/called receiver (`maybeModel()?.count`) — the receiver is not a bare
   reference. Explicitly refused (§7), never attempted — duplicating a constructor call or a function call
   would violate the exactly-once evaluation-order guarantee ADR-0041 established and every subsequent
   milestone has preserved.

## 5. Supported subset

A `PropertyAccess`/`MethodInvocation` with `isNullAware == true` lowers to a bounded conditional
(`logic.Conditional`, an existing node kind — see §7) when its own receiver is a **bare reference safe to
evaluate twice**: a `SimpleIdentifier` whose resolved element is a `FormalParameterElement`/
`LocalVariableElement` (a true parameter or local variable), or a field-backed `GetterElement`
(`isOriginVariable == true` — a component's own constructor field, or, internally, `self`'s own field) —
never a genuine, computed getter, a method call, or a constructed value. This mirrors
`_instanceMemberTarget`'s own established `isOriginVariable` field/getter distinction (ADR-0033) exactly,
reused here as the "safe to duplicate" boundary rather than invented fresh: a field read is a bounded,
provably pure structural lookup (ADR-0035's own "bounded immutable field shape"); a genuine getter is not
provably pure by construction the same way, and this project's own consistent discipline — receiver
evaluation exactly once, no exceptions, even where duplication happens to be harmless in a side-effect-free
system — is honored rather than carved around for convenience.

The underlying field read, getter read, or method call is otherwise governed by every existing eligibility
fact unchanged (ADR-0035/0038/0039/0040/0041/0042/0043) — a null-aware access to an otherwise-ineligible
member still refuses exactly as an unconditional one would.

## 6. Explicit refusal subset

- A null-aware receiver that is a method call, a constructed value, or any other non-reference expression
  (`maybeModel()?.count`, `Model(7)?.count`) — refused honestly (never silently duplicated).
- A null-aware receiver that is a genuine (non-field-backed) getter reference (`someGetter?.count`, where
  `someGetter` is itself computed) — refused honestly, for the discipline reason in §5, not a soundness
  necessity.
- A chained null-aware access whose own inner receiver is not itself a bare reference
  (`model?.next()?.count` — the second `?.`'s own receiver is a method call) — refused honestly.
- Everything M10-A through M10-E already refuse (generic methods/classes, async, recursion, named/
  optional-without-default parameters, inheritance, statics, setters) remains refused, unchanged.

Refusal mechanism (§8): the extractor withholds `target` for the underlying access instead of synthesizing
the guard, which routes the call through the pre-existing M9-J unmodelled-member `BRG3013` refusal — no
new diagnostic code.

## 7. Architecture — extraction-only, zero schema change, zero generator change

`logic.Conditional` (`test`/`then`/`otherwise`/`type`), `logic.Binary` (`!=`, already lowered via `EQUALITY`
in `expression.ts`), and `logic.Lit` (a `null` literal, already lowered as the bare token `null`) are all
pre-existing, already-fully-implemented node kinds — confirmed directly: `case 'logic.Conditional':` in
`expression.ts` is unchanged since M8-era ternary support, and the flow-promoted case (§2/§4 rung 3) already
proves it correct for exactly this shape (a nullable value narrowed by a `!== null` test).

The fix is entirely in `expression_extractor.dart`: when extracting a `PropertyAccess`/`MethodInvocation`
whose `isNullAware` is true and whose receiver qualifies (§5), synthesize

```
logic.Conditional {
  test: logic.Binary { operator: '!=', left: <target, extracted>, right: logic.Lit { /* null */ } },
  then: <the IDENTICAL logic.PropertyAccess/logic.MethodCall the ordinary, non-null-aware path already
         builds — same target resolution, same field/getter/method eligibility, unchanged>,
  otherwise: logic.Lit { /* null */ },
  type: out.typeRef(node.staticType, at: node),  // already nullable — node.staticType for `model?.count`
                                                   // is `int?`, exactly as the source demands
}
```

when the receiver does not qualify, the underlying access is still extracted (so the METHOD/FIELD name and
argument shapes remain visible for downstream tooling), but `target` is withheld — routing it through the
pre-existing M9-J refusal.

No UIR schema field, node kind, or generator code changes. This mirrors ADR-0039 §12/ADR-0041 §6/ADR-0042
§7/ADR-0043 §5's own repeated "no eligibility flag, extend discovery/emission instead" pattern — the
narrowest possible instance of it, since even the "emission" side needs no extension at all here, only the
extraction-side node shape.

## 8. Why this architecture is semantically truthful

The receiver is evaluated up to twice in the SYNTHESIZED UIR text (once in `test`, once inside `then`) —
this is the SAME, already-established, already-shipped pattern the M8-B render-tree-local mechanism uses
for re-extracting a local's own initializer at each reference site (`_reference`'s own `binding?.inlineValue`
path) — safe there for pure/literal initializers, and safe here for the identical reason: the receiver is
restricted (§5) to a bare reference or a bounded field read, both provably free of observable side effects
in this architecture (no mutation is representable anywhere in the bounded structural model). No
intervening statement or call can execute between the `test` and the `then` branch of a single ternary
expression, so no value could change between the two reads even in principle. TypeScript's own ternary
narrows `then`'s own type from the ELSE-branch's `null` alternative exactly as it already does for the
flow-promoted case (§2/§4 rung 3) — confirmed, not assumed, by the fixture's own real `tsc --strict` run.

## 9. Identity/provenance implications

None — `target` resolution for the underlying field/getter/method access is completely unchanged; only the
node WRAPPING it is new (a `logic.Conditional` the schema already had). Two separate `RawNode`s are built
for the twice-extracted receiver (mirroring the M8-B precedent, §8) — each gets its own real, deterministic
NodeId from the canonicalization pass (confirmed by the existing "ids are deterministic" and the M8-B
mechanism's own established, shipped behavior); no shared-node/DAG identity question arises.

## 10. Evaluation-order implications

The receiver is evaluated (in the generated ternary's own condition) before the underlying member access or
any of its arguments — consistent with ADR-0041's own contract. Arguments to a null-aware method call are
extracted INSIDE the `then` branch (the same, unchanged, ordinary extraction), so they are correctly never
evaluated when the receiver is null — Dart's own short-circuit semantic, achieved for free by nesting, with
no special-casing needed.

## 11. Reachability implications

None — the underlying member access participates in the identical reachability/emission fixed point
(ADR-0038 §9, ADR-0040 §10, ADR-0042 §6) exactly as an unconditional one would; wrapping it in a
`logic.Conditional` changes nothing about which helper it references or when that helper becomes reachable.

## 12. Cross-file implications

None beyond what already exists — the underlying member's own class/type resolution is unaffected by this
ADR; ADR-0041 §3's transitive class-type-reachability fixed point already covers a nullable field/return
type exactly as it covers a non-nullable one (confirmed: `Model?`'s own `TypeRef.target` is populated
identically to `Model`'s, per ADR-0034 §11/ADR-0042's own unrelated confirmation).

## 13. Generator implications

None — `logic.Conditional`/`logic.Binary`/`logic.Lit` are unmodified.

## 14. Runtime implications

None — no runtime class, prototype, or new abstraction. The lowered form is a plain TypeScript ternary
over already-existing helper calls or structural field reads.

## 15. Schema implications

None — every node kind and field this ADR uses already exists, already populated for other purposes.

## 16. Dynamic-dispatch implications

None beyond what ADR-0038 §10 already established — `_dispatchSafeReceiverClass`'s own subclass exclusion
is completely unaffected by nullability (a nullable subclass-typed receiver is excluded for the identical,
unchanged reason a non-nullable one already is).

## 17. Recursion implications

None — a null-aware access participates in the same fixed-point member-helper retry loop (ADR-0040 §10,
ADR-0042 §6) as any other; a self- or mutually-recursive chain reached through a null-aware link still
refuses via the identical, unmodified "target set but no helper" path.

## 18. Error/diagnostic behavior

`BRG1310` precedence is unaffected — this gate runs only after the pre-existing resolved-analyzer-errors
check, exactly as every ADR-0039-family gate already does (a null-aware access is checked purely
syntactically/structurally on an already-valid AST). An unsupported null-aware receiver shape reaches the
pre-existing M9-J `BRG3013` refusal (§6) — no new diagnostic code.

## 19. Alternatives rejected

- **A new UIR field (`nullAware: true`) on `PropertyAccess`/`MethodCall`, handled generator-side.** Rejected:
  would require new generator code to synthesize the SAME conditional logic this ADR gets for free by
  reusing `logic.Conditional`, and would need its own new "receiver safe to duplicate" check duplicated on
  the GENERATOR side (which has less direct access to the analyzer's own resolved-element distinctions
  `_instanceMemberTarget` already made available on the extraction side) — no benefit over synthesizing the
  conditional once, at extraction time, in the one place the analyzer's own resolved facts are cheapest to
  consult.
- **Support an arbitrary (non-reference) receiver via a synthesized temporary/IIFE.** Rejected: would
  introduce a new lowering shape (an immediately-invoked arrow function or a hoisted temporary variable)
  this codebase has no precedent for, purely to support a receiver shape (a call or construction) real Dart
  source rarely places directly before `?.` — deferred, not ruled out, as a genuinely separate, larger
  capability.
- **Support a bare-getter-reference receiver too (accepting duplicated computation as harmless).**
  Rejected: technically sound (every getter in this bounded model is provably pure), but breaks this
  project's own consistent "exactly once, no exceptions" discipline for no real capability gain; the
  field-backed (`isOriginVariable`) case already covers the overwhelmingly common shape (component props,
  local bindings of a field read).
- **Also fix the pre-existing bug for an UNGUARDED nullable receiver.** Investigated and found not to be a
  real, reachable gap: Dart's own sound null safety already makes `model.count` a compile error when
  `model: Model?` (caught by the pre-existing `BRG1310` analyzer-error gate before extraction ever runs) —
  there is no valid Dart program this ADR would need to additionally guard against.

## 20. Non-goals

Nullable METHOD PARAMETERS and RETURN TYPES as plain values (never dispatched on) — a real, separate,
currently-open gap ADR-0042 §11 already named — are explicitly out of this ADR's own scope; this ADR
addresses only the RECEIVER-dispatch-safety question for `?.` specifically. A chained null-aware access
whose own inner link is not a bare reference; a null-aware receiver that is a call or construction; a
bare-getter-reference receiver; collection-typed fields; function-valued fields; setters; named parameters;
generic methods/classes; async/recursion — none of these is implemented, and no existing refusal boundary
for any of them is weakened.

## 21. Implementation gate

Implementation proceeds only after this ADR; the fixture and tests (§4/§17) are built through the real
pipeline, never hand-authored UIR.

## 22. Mutation-testing plan

At minimum: remove the "safe to duplicate" eligibility check (admit a call/construction receiver); replace
the `isOriginVariable`-based field/getter distinction with a name-based one; remove the `isNullAware`
detection entirely (regressing to the pre-ADR bug); duplicate the receiver a third time in the synthesized
node; swap `test`/`then` order; bypass the M9-J refusal path for the unsupported-receiver case. `dart test`,
`pnpm exec vitest run`, `just ci`, `just determinism`, and `bridge validate` all gate the final commit.
