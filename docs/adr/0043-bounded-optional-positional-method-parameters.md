# ADR-0043 — Bounded Optional Positional Method Parameters (Default Values)

## 1. Problem statement

ADR-0039 (M10-A) required every bounded instance-method parameter to be uniformly required-positional,
explicitly citing the reason inline: an optional or named parameter was excluded "kept narrow deliberately
rather than re-derived." Every subsequent M10 milestone doc (M10-A §19, M10-B §18, M10-C §21, M10-D §19)
independently named the same backlog item as the recurring, un-implemented next step — ADR-0039 §14 is the
only one of the five ADRs to name a concrete prerequisite: "would need the callee's own signature threaded
to the call site." This ADR investigates whether that prerequisite already exists, and ships the bounded
subset it turns out to unlock.

## 2. Current behavior (before this ADR)

`_externalMethodTarget` (`expression_extractor.dart`) requires `param.isRequiredPositional` for every one of
a method's own parameters; a method with any optional (positional or named) parameter never resolves a
`target`, and the call reaches the pre-existing M9-J unmodelled-member refusal (`BRG3013`) — proven by the
existing fixture `fixtures/apps/method_call_refusal` (`Model.multiply(int factor, [int bonus = 0])`, called
`model.multiply(3, 2)`, always supplying both arguments) and the existing Dart test "a method with an
optional positional parameter is never targeted by external call resolution."

## 3. A real, pre-existing, unrelated bug found while investigating the stated prerequisite

`paramListOf` (`types.ts`) — the ONE shared parameter-list renderer used by store actions, top-level
functions, and (after ADR-0039) method helpers — already inspects a `defaultValue` UIR field:
`param['required'] === false && param['defaultValue'] === undefined ? '?' : ''`. When a `defaultValue` IS
present, this expression evaluates to `''` — no `?` marker — but the function **never emits the default
value's own text anywhere**, and no caller has ever populated `defaultValue` for anything `paramListOf`
renders. A real, live probe reproduced the exact failure this leaves latent: a `ChangeNotifier`-based store
action with an optional positional default (`void add([int n = 5])`), invoked with the argument omitted
(`store.add()`, a real, valid, already-supported call shape per ADR-27), generates
`const add = action((n: number) => {...`, '`add`');` — a REQUIRED parameter, no default clause — and the
call site `_store.add()` fails real `tsc --strict` with "Expected 1 arguments, but got 0." This predates
this milestone, is unrelated to project-class instance methods, and was never previously exercised by any
existing fixture or test (`signal_extractor.dart`'s own `_params`, unlike `declaration_extractor.dart`'s,
already extracts `defaultValue` for actions — the UIR carries the fact; only the generator's own
`paramListOf` never consumed it). Fixing `paramListOf` correctly — the one change this ADR's own bounded
capability requires regardless — repairs this pre-existing gap as a direct, unavoidable consequence of using
the shared, correct machinery rather than a second, method-specific copy of it (recorded here for honesty,
not claimed as this milestone's own goal).

## 4. Analyzer evidence — the stated prerequisite already exists

`FormalParameterElement` (analyzer 14.0.0, `package:analyzer/dart/element/element.dart`) exposes
`isPositional`, `isOptionalPositional`, `hasDefaultValue`, and `defaultValueCode` — the callee's own
signature, including which parameters are optional and whether each carries a default, is already fully
available at the point `_externalMethodTarget` resolves a `target`. Dart's own language rules further
narrow what a default value CAN be: a compile-time constant expression (a literal, a `const` reference, a
`const` constructor call) — never an arbitrary runtime expression, and never one that can reference the
method's own parameters (a default is evaluated in the ENCLOSING scope, before any parameter is bound).
This means the "callee signature threaded to the call site" ADR-0039 §14 flagged as missing is not, in
fact, missing — it was simply never READ for methods, and never fully RENDERED for the one place (store
actions) that already read part of it.

## 5. UIR representation — no schema change

`ParamDecl`'s existing `required`/`defaultValue` fields (already present in the schema, already populated
by `signal_extractor.dart` for `sig.Action` parameters) already represent everything this capability needs.
This ADR extends WHERE they are populated (`declaration_extractor.dart`'s own `_params`, shared by class
methods and top-level functions, mirroring `signal_extractor.dart`'s identical pattern exactly — including
its own documented scoping rule: a default value is extracted against the ENCLOSING scope, `scope`, never
the parameter-bound `inner` scope `_methods`/`_function` build for the body itself, since Dart's own
default-value evaluation cannot see the parameters it sits among) and WHERE they are consumed (`paramListOf`
gains one new optional callback, `defaultValueOf`, mirroring its existing `use`/`classOf` callback pattern
exactly — each caller supplies its own `emitExpression`/scope, exactly as it already does for a parameter's
own TYPE). No new node kind, no new `logic.*` shape, no new provenance concept.

## 6. Target identity / provenance — unchanged

A method with an eligible optional parameter resolves `target` through the IDENTICAL
`_externalMethodTarget` → `_instanceMemberTarget` path every required-positional method already uses —
declaration provenance (ADR-0033) is completely unaffected by a parameter's own optionality. No new
identity concept is introduced or required.

## 7. Eligibility boundary

A method's own parameter list is eligible when EVERY parameter is:

- **Positional** (`param.isPositional`) — a NAMED parameter (required or optional) remains categorically
  out of scope. Named arguments have no positional call-site equivalent in the generated TypeScript without
  either an options-object rewrite (a wrong-value-at-the-wrong-position risk `refuseNamedArgs`'s own doc
  comment already names) or threading the parameter's own declared NAME to every call site (a materially
  larger capability than this ADR's own bounded scope) — genuinely deferred, not merely unexplored.
- **Either required, or optional with an explicit default value** (`param.isRequiredPositional ||
  param.hasDefaultValue`) — an optional positional parameter WITHOUT a default (`[int? bonus]`, implicitly
  `null` when omitted) remains out of scope: representing an omitted argument as JavaScript's `undefined`
  would be a representational choice this codebase has not made anywhere else (`types.ts`'s own comment:
  "Dart has one absent value and it is `null`... a Dart `null` crossing into JavaScript is still `null`");
  resolving it correctly (`| null` in the signature, `null` — not omission — as the effective value) is a
  distinct question this ADR does not answer.
- Still non-function-typed (M10-C's own exclusion, unchanged and orthogonal to this ADR).

Every other ADR-0039/0040/0041/0042 eligibility fact (public, instance, concrete, non-static, non-abstract,
non-`@override`, non-generic method, owner-consistent, dispatch-safe receiver, eligible return type)
continues to apply unchanged.

## 8. Generated TypeScript shape

A method helper's own signature now renders an eligible optional parameter with a genuine TypeScript
default clause — `function Model_multiply(self: Model, factor: number, bonus: number = 0): number` — using
TypeScript's own native default-parameter mechanism, the truthful representation of Dart's own semantics
(both languages: omit the trailing argument at the call site, the parameter takes its declared default;
supply it, the supplied value wins). The call site itself needs no new logic: `emitArguments` already emits
however many argument expressions the source actually wrote, in order — a call that omits a trailing
optional argument already produces a shorter argument list than the full parameter count, which is
exactly what a TypeScript default parameter already expects. This mirrors ADR-0039 §12/ADR-0042 §7's own
"no eligibility flag, extend discovery and emission instead" pattern precisely.

## 9. Evaluation-order semantics

Unaffected. ADR-0041 §5's own contract (receiver before arguments, left-to-right, exactly once) governs
the arguments the SOURCE actually supplies; an omitted trailing optional argument is not evaluated at all
in Dart (the default value expression is evaluated once, by the CALLEE, not the caller — identical to
TypeScript's own default-parameter semantics) — the two languages agree exactly, with no approximation.

## 10. Cross-file implications

None beyond what ADR-0041/0042 already established: a default value that references a cross-file `const`
resolves through the identical `target`-based cross-module import machinery any other expression already
uses; no new cross-file mechanism is introduced.

## 11. Recursion / reachability implications

None. A default value cannot reference the method's own parameters (§4) and, being a compile-time
constant, cannot itself contain a method or getter call that would introduce a new reachability edge in
practice (a `const` expression cannot invoke an instance method) — this capability adds no new path into
the fixed-point reachability/emission machinery ADR-0038/0040/0042 already built.

## 12. Diagnostic behavior

A default value expression `emitExpression` cannot render (an unsupported construct) surfaces exactly as an
ordinary method-body emission failure already does: the attempt's own `hadError` flag is set, the attempt
is discarded for this pass and retried the next one (mirroring ADR-0040 §10's own retry discipline), and a
default that can never succeed converges to the pre-existing "target set but no helper" `BRG3013` refusal —
no new diagnostic code or message is needed. A named parameter, or an optional-without-default parameter,
continues to refuse via the unchanged `_externalMethodTarget` → M9-J path, with `BRG1310` precedence
unaffected (this gate runs only after the pre-existing resolved-analyzer-errors check, exactly as every
other ADR-0039-family gate already does).

## 13. Why this architecture is safe

Every fact this ADR relies on was independently confirmed by live evidence before implementation: the
analyzer already exposes the callee's own full optionality/default-value information (§4); the UIR schema
already has a field for it, already populated correctly for one existing consumer (§5); the generator's own
shared parameter-list renderer already has the SHAPE of the fix half-built, just never finished (§3); Dart's
own language rules (constant-only defaults, no parameter cross-reference) bound the new surface area
tightly, with no case requiring whole-program inference or a new identity concept.

## 14. Rejected alternatives

- **Support named optional parameters too, in the same milestone.** Rejected: named arguments have no
  positional call-site equivalent without either an options-object rewrite or call-site-name-threading —
  materially larger scope, deferred to a future milestone (§7).
- **Support optional-without-default positional parameters, mapping omission to `undefined`.** Rejected:
  would introduce the first `undefined`-as-absent-value representation in a codebase that has consistently
  chosen `null` for Dart's own single absent value everywhere else; deferred pending its own dedicated
  investigation (§7).
- **A method-specific copy of the default-value-rendering fix, leaving `paramListOf` (and the pre-existing
  store/action bug, §3) untouched.** Rejected: would duplicate logic three call sites already share
  correctly for every OTHER concern (`use`, `classOf`), reintroducing exactly the kind of independently-
  drifting duplicate ADR-0040 §3's own `isEligibleStructuralField`-sharing fix already corrected once.
- **Leave the boundary as-is (Outcome B).** Rejected: the investigation found no genuine obstacle — the
  analyzer, the schema, and the generator's own existing conventions all already support the bounded
  subset; only a narrow, well-precedented extension was missing.

## 15. Explicit non-goals

Named parameters (required or optional); optional-without-default positional parameters; generic methods;
generic classes; async methods; recursive methods; inherited/overridden members; static members;
constructors beyond the ADR-0037 bounded subset; setters/mutable fields; dynamic dispatch. None of these
is newly implemented, and no existing refusal boundary for any of them is weakened.

## 16. Implementation gate

Implementation proceeds only after this ADR; the fixture and tests (§17) are built through the real
pipeline, never hand-authored UIR.

## 17. Validation strategy

A dedicated fixture (`fixtures/apps/optional_method_parameters/`) proving: a trailing optional parameter
with a literal default, omitted and supplied; multiple trailing optional parameters; an optional parameter
consumed inside helper composition (M10-B/D chaining, unaffected by this ADR); a named-parameter method
still refusing; an optional-without-default parameter still refusing — run through the real analyzer →
extraction → normalization → generation → `tsc --strict` pipeline. The pre-existing `method_call_refusal`
fixture's own `Model.multiply` is updated (its own optional-positional-with-default parameter is no longer
a valid negative control under this ADR — replaced with a named-parameter form, preserving the ORIGINAL
test's own purpose under the new, correct boundary) rather than left silently stale. `dart test`,
`pnpm exec vitest run`, `just ci`, `just determinism`, and `bridge validate` all gate the final commit.
