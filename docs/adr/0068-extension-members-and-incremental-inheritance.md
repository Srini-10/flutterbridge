# ADR-68 — Extension members; incremental invalidation of inherited-from classes

- **Status:** Accepted (M13). Found in two real apps: 61 opaque `extension` declarations (`RoundResultResponseDtoPatterns`, `AppColorsContext`,
  `context.palette`) and the known incremental-analyzer defect from ADR-0059.
- **Date:** 2026-09-21

## Extension members

**D1 — An extension's instance members are `logic.FunctionDecl`s** with `extensionOn` (the extended type), named `<Extension>_<member>` (`_set_` for a
setter; an anonymous `extension on T` is keyed by its own offset, which the declaration and every reference compute from the same fragment).
Their `this` is the receiver: implicit member access inside the body (`length` in `extension on String`) is `this.length`, and a bare use of another
member of the same extension resolves through the extension. Static members and operators are refused by name (`logic.OpaqueDecl`).
**D2 — A use names the member.** `MethodCall`/`PropertyAccess` gain `extensionTarget`, set from the *resolved element* — the analyzer's own
extension applicability, receiver type, generics and nullability decide which extension member a call means; nothing matches by name. A write to
`x.prop = v` resolves to the setter. `?.` composes with it (the receiver is bound once).
**D3 — Lowering.** A member is a module-level function `Ext_member($this, params…)` (a real parameter, not a JavaScript `this`, so a `null` or
primitive receiver is not coerced by sloppy-mode rules); a call is `Ext_member(recv, args…)` with arguments ordered by the member's own signature; a
getter is `Ext_prop(recv)`; a setter `Ext_set_prop(recv, v)`. Generic extensions carry their type parameters. Reaching a member reaches its function.
**Refused:** an extension member whose body the generator refuses is refused at each use, by name (e.g. `Theme.of(this).extension<T>()` has no model).

## Incremental analyzer

Whether a class is extended or mixed in by another file changes how the class itself is extracted (ADR-0059), and that fact is written in the
*inheriting* file — it flows against the import direction, so an unchanged base file was served from cache with its old extraction. `FileDigest`
now records the classes a file declares and the names its classes extend, mix in or constrain, and each file's cache key carries which of its own
classes another file inherits from (by simple name: an over-approximation costs a miss, never a stale hit). A digest cached before this is recomputed.
Regression: `incremental_pipeline_test.dart` ("a class newly inherited from in ANOTHER file") fails without the key part and passes with it; the
incremental output equals a clean build's.

## Evidence

`fixtures/apps/extensions` compared with `flutter test`: `String`/`List<T>`/`int` (anonymous)/`String?`/project-class extensions — getters, methods
with named and defaulted parameters, a setter, calls between members of one extension, a `null` receiver; three mutants killed; analyzer test on the
UIR shape.
