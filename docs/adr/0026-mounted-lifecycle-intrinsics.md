# ADR-0026 — Mounted lifecycle intrinsics

- **Status:** Accepted, implemented in M7-J.
- **Date:** 2026-08-20
- **Confirms and extends:** the recognition-by-resolved-element principle ADR-18/ISSUE-16 established
  for `setState`/navigation ("the extractor does not know what `setState` is; the adapter does, and
  that is the only place it may be known") — applied here to a value, not a call.
- **Amends:** UIR schema, `x-uir-version` 1.5.0 → 1.6.0.
- **Evidence:** `docs/m6/GAP-mounted.md` (348 measured real-corpus occurrences across `continuum` and
  `unichat`), `docs/m7/m7i-mounted-lifecycle-lowering.md` (fresh UIR/Flutter-SDK verification), this
  document's own §Evidence (the runtime-kit precedent).

## Context

`docs/m6/GAP-mounted.md` measured that `mounted`/`context.mounted` are common (348 real occurrences,
~6–17 per thousand lines), cannot be erased (`if (mounted) { … }`/compound conditions cannot be reduced
to a statement pattern — 58 of 348 measured uses are `mounted` as one boolean operand among several),
and cannot be represented by either of UIR's two existing reference shapes: `logic.Ref{target}` needs a
program declaration to point at, and there is none — `mounted` is Flutter's; `logic.Ref{name}` (§A18.3)
needs a lexically enclosing parameter, and it is not one. The document the generator receives today,
`{"kind":"logic.Ref","name":"mounted","type":{...}}`, is byte-identical in shape to what a genuinely
unresolved reference produces — which is precisely the shape `BRG3006` exists to catch. Lowering it
without a schema change would mean matching the string `"mounted"`, which C1/ISSUE-18 already
established is wrong (18 widgets were misclassified by name matching before recognition moved to
resolved elements), and which would silently mishandle an application's own field genuinely called
`mounted`.

M7-I reconfirmed this independently against the current, post-M7-H analyzer and the installed Flutter
SDK, and designed (without implementing) the runtime contract this ADR now also decides.

## The decision

One additive, optional amendment.

### `logic.Intrinsic` *(new L1 expression node kind)*

```json
"Intrinsic": {
  "description": "A value the host framework provides, which the program does not declare.",
  "x-uir-kind": "logic.Intrinsic",
  "properties": {
    "kind": "logic.Intrinsic",
    "intrinsic": "IntrinsicKind",
    "operand": "Expr, optional — the value the intrinsic is about, for a member that takes one",
    "type": "TypeRef"
  }
}
```

```json
"IntrinsicKind": {
  "enum": ["componentMounted", "contextMounted"]
}
```

(Prose in this document uses `component.mounted`/`context.mounted` for readability — the schema's own
enum values are camelCase, `componentMounted`/`contextMounted`, because the code generator requires
every enum value to be a valid identifier in both target languages and a dot is not one.)

Expression-level, not a statement or a special guard construct — `GAP-mounted.md`'s own corpus
measurement is why: 58 of 348 real occurrences are `mounted` as one operand inside a larger boolean
expression (`if (result == null || !mounted) return;`), which only an expression node can represent.
`logic.Intrinsic` joins `l1.json`'s `Expr` union exactly as `logic.NullCheck`/`logic.Unary` already do,
so it composes under `!`, inside `||`/`&&`, and can be read more than once — nothing new for any pass or
emitter that already walks `Expr` generically.

**Two vocabulary members, not one, and not a flag on one member.** `docs/m6/GAP-mounted.md`'s own
measurement of real `context.mounted` uses settles this: 9 of 11 occurred in a **top-level function**
taking a `BuildContext` parameter, with no enclosing `State` at all — *"there is no component for
`component.mounted` to be about."* The two differ in **arity** as a direct consequence: `component.
mounted` is nullary (it means "the component this expression is lexically inside"); `context.mounted`
needs an operand (the specific context value it was asked about), because in the common real-world case
that value did not come from an enclosing component's own lifecycle at all — it was passed in.
Collapsing them into one member with a flag would still need the arity difference expressed somehow, and
would suggest a false equivalence the corpus does not support.

**Target-neutral names, not Flutter's.** `component.mounted`/`context.mounted` describe what the fact
*means* — is this component (or this specific reference) still part of the live tree — not the Flutter
API that happens to answer it today, so a non-Flutter frontend could produce the same node for its own
equivalent concept. This is the same naming discipline `logic.Navigate`'s `NavigateAction` already
applies (`push`/`replace`/`pop`, not `Navigator.push`/`context.go`).

Additive and optional: every existing document still loads unchanged. The schema hash moves once,
invalidating the analyzer cache by design — the same, accepted cost every prior schema amendment in this
project's history has paid.

## Recognition ownership

The analyzer's expression extractor gains a small adapter-registry check —
`registry.mountedIntrinsicOf(expression)` — following exactly the shape `registry.navigationActionOf`/
`registry.unwrapStateBatch`/`registry.isChangeNotification` already establish: the extractor itself
learns nothing about Flutter; it asks the registry, which resolves the expression's `Element` (the
analyzer package's own resolved-AST information, already used elsewhere in this codebase for the same
reason — ISSUE-18/C1) and answers `component.mounted`, `context.mounted`, or "not this."

Recognition is **by resolved element only**:

- `mounted` is `component.mounted` exactly when the identifier's element is the `mounted` getter
  declared on `State` in `package:flutter/src/widgets/framework.dart` (or an override of it — the
  element's declaration, walked to its furthest override, must terminate there).
- `X.mounted` (a `PropertyAccess`) is `context.mounted` exactly when the property's element is the
  `mounted` getter declared on `BuildContext`/`Element` in the same library, and `X`'s static type is
  assignable to `BuildContext`.
- Anything else spelled `mounted` — a local variable, a field, a parameter, an unrelated class's own
  `mounted` getter, an unresolved/undeclared reference that merely happens to be spelled that way — is
  **not** recognized, and reaches the document exactly as it does today: a plain `logic.Ref`/
  `logic.PropertyAccess`, refused downstream by the existing `BRG3006` if nothing else resolves it. This
  is the negative case ADR-18/C1 exists to keep safe, and it is enforced by construction (element
  identity, never spelling) rather than by a name-based exclusion list.

## Runtime contract

`@bridge/runtime-react` gains one primitive, `useMounted()`, in `packages/runtimes/react/src/internal/
react/lifecycle.ts` — the same file, and the same idiom, as the existing `useMountEffect`/
`useUnmountEffect`/`useUpdateEffect`. A **stable ref**, not a boolean snapshot: M7-I proved a snapshot is
categorically wrong for the post-`await` case (a JS closure captures a primitive `boolean`'s value at
render time; it cannot reflect an unmount that happens during a later `await`), and `useUpdateEffect`'s
own internal `mounted` ref (tracking a different fact, "has the first render happened," with the exact
same mechanism) is direct, working precedent in this codebase already:

```ts
export function useMounted(): RefObject<boolean> {
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}
```

Set to `true` **inside** the effect body, not only at the `useRef(true)` initial value — the detail that
makes it correct under React Strict Mode's development-only mount→cleanup→remount replay: the second
effect invocation re-sets `true`, so the ref is correctly live after the replay settles. Per-instance by
construction (`useRef` is component-instance hook state), so two mounted instances of the same generated
component are isolated automatically, with no module-global mutable state — ADR-15/INV-19 hold without
anything extra.

Both `component.mounted` and `context.mounted` lower to the **same** runtime primitive. This is a target
decision, not a schema one — nothing in `logic.Intrinsic` requires it, and a future target free to answer
`context.mounted` differently (e.g. because its own component model actually distinguishes a passed
context from the enclosing one) may do so; the UIR keeps the two facts distinct precisely so that
freedom exists, per the task's own Phase 12 instruction to preserve it.

## Diagnostics affected

`BRG3006` ("not declared in this program") no longer fires for a resolved-element-verified
`component.mounted`/`context.mounted` read — it lowers instead. It is unchanged for every other
identifier, including one spelled `mounted` that resolved element-checking rules out.

## Compatibility, cost

Additive and optional, same as D1/D2 of ADR-0025: no node kind removed, no field changes type, no
existing document invalidated. `packages/uir/src/generated/uir.ts` and `dart/bridge_uir/lib/generated/
uir.dart` are regenerated from the schema by `pnpm run codegen`, never hand-edited. Implementation cost:
one adapter-registry method (analyzer), one branch in the expression extractor, one runtime primitive
(already designed by M7-I, ready to build), one generator lowering case, and the fixture/browser proof
this ADR's own motivating milestone (M7-J) exists to deliver.

## Consequences

- `hello_bridge`'s and `async_push_guard`'s `mounted` guards can lower to working code for the first
  time since the schema existed.
- The two-member vocabulary is deliberately not exhaustive of every framework intrinsic a future
  milestone might find (e.g. `debugDoingBuild`, `Element.owner`) — this ADR decides `mounted` only, on
  the evidence in hand; a future intrinsic is a future, separately-evidenced amendment to
  `IntrinsicKind`'s enum, additive in the same way.
- A target that cannot express "is this alive" (a hypothetical fully-synchronous, non-reactive target)
  would refuse `logic.Intrinsic` the same way it refuses anything else it cannot lower — this ADR does
  not obligate every target to implement it, only states what the fact means when a target does.
