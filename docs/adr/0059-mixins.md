# ADR-59 — Mixins, and classes that other classes inherit from

- **Status:** Accepted (M12, production-compatibility phase 2). Found in a real 240-file application: 59 `mixin` declarations
  (freezed's `_$Dto`) preserved as opaque declarations, and 34 classes refused because they apply one.
- **Date:** 2026-09-21

## Decisions

**D1 — A mixin is a `logic.ClassDecl` with `isMixin`.** Fields, methods, getters and abstract members are extracted like a general class's
(`this.x` explicit); `on Base` becomes its `superclass`, so a `super.m()` in it type-checks and reaches `Base`.

**D2 — Applying a mixin adds its members to the class** (`class C extends B with M1, M2`): the class's own members win, then the last
mixin, then earlier ones, then the superclass; abstract mixin members are skipped (a superclass's concrete member satisfies them and must
not be replaced); a field the class redeclares wins. `$isA` includes the mixins, so `x is M` works. A mixin's `super` calls reach the
class's superclass — exact when the mixin is applied directly above it.

**D3 — A class that another class extends or mixes in is emitted as a class.** Whether `Base` is inherited from is written in the
subclass's file, so `inheritedClasses` reads every unit's `extends`/`with`/`on` before any is extracted, and `Base` is then a general
class even if its constructors would have made it a plain record. (The incremental analyzer computes the same set; a cached module is not
re-extracted when only a subclass elsewhere changed — a clean run is always exact.)

**D4 — A redirecting factory returns its target as the declared class** (`as unknown as`) unless the target extends it: freezed's
`factory Dto(...) = _Dto` has a target that only *implements* `Dto`, and the emitted classes carry per-class `$init_*` members that make
them structurally unrelated.

**D5 — A `final` field holding a mutable object is state, also when the mutable fields are inherited** (from a superclass or a mixin).

## Evidence

`fixtures/apps/mixins` compared with `flutter test`: fields, methods and getters from two mixins with order of application, a class
overriding a mixin method and redeclaring a mixin field, an abstract mixin member satisfied by the superclass, `on Base` with
`super.say()`, `abstract mixin class`, `is` against a mixin, and a `State` holding a mixin-derived object mutated from a button. Six
mutants (application order, `$isA`, abstract skipping, override precedence, member lookup through mixins, field redeclaration) are
killed.
