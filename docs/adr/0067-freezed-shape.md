# ADR-67 — The code shape freezed generates: callable copy objects, generics, type guards, `runtimeType`

- **Status:** Accepted (M12, production-compatibility phase 2). A 240-file app's freezed part files (`*.freezed.dart`) reached 145 named-argument
  refusals and hundreds of type errors once mixins and statics worked.
- **Date:** 2026-09-21

## Decisions

**D1 — `x.copyWith(a: 1)`** where `copyWith` is a getter returning an object with a `call` method is a method call of `call` on that object,
ordered by `call`'s signature (positional, then named in declaration order, `undefined` for omitted).
**D2 — Generics.** A generic project class keeps its type arguments (`TypeRef.typeArguments`, so `$DtoCopyWith<Dto>` is emitted as such) and its
parameters default to `unknown` (a bare use is valid); a class's, method's and function's own type parameters are TypeScript type parameters
(`FunctionDecl.typeParameters`) — inside them a type naming one is that parameter, not `unknown`. A construction names its type arguments.
**D3 — Constructor hooks are static, typed by `this`.** `$init_X`/`$fields_X` were instance methods; being members of the type they made an
implementing class structurally unrelated to its interface (`_$DtoCopyWithImpl implements $DtoCopyWith`). They are `static $init_X(this: X, …)` called
with `.call(this, …)` — statics are not part of the instance type.
**D4 — `dartIs` is a type predicate** (`value is T`), so `other is Dto && other.name == name` narrows as it does in Dart.
**D5 — `x.runtimeType`** is `dartRuntimeType(x)` (the value's class), so it works on an `Object`-typed value.
**D6 — Abstract mixin members nothing provides are `declare`d**, so the class's type has `name`/`age` (`String get name;`) without a runtime member that could
shadow a superclass's.
**D7 — Function-type parameters this generator cannot name are `any`** (`(p0: any) => R`), because a typed callback is assignable to that and not to
`(p0: unknown) => R`. A module constant that constructs a project class follows the classes in its module (a class declaration is not hoisted).

## Evidence

`fixtures/apps/freezed_shape` — freezed's own shape written by hand, without the package (a mixin with abstract getters and a `copyWith` getter, a
callable copy object with sentinel defaults and `as` casts, `==`/`hashCode`/`toString` through `identical`/`Object.hash`/`runtimeType`, a redirecting
`const factory` to a private implementation, sealed unions with pattern switches, a `State` that copies on taps) — compared with `flutter test`;
three mutants killed.
