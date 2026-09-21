# ADR-56 — Enhanced enums are emitted as classes

- **Status:** Accepted (M12, production-compatibility phase 2). Found by a real 240-file application: 18 `BRG1312` errors, all
  `enum MatchKind { words(floor: 0.45, …); const MatchKind({required this.floor, …}); final double floor; … }` read as `kind.floor`.
- **Date:** 2026-09-21

## Context

A plain enum is its value names (a string); that stays. An *enhanced* enum — fields, methods, getters, or constants with
constructor arguments — has state and behaviour that a bare name cannot carry. Until now the analyzer refused any read of such a
member (`BRG1312`), because lowering it would have been silently `undefined`.

## Decision

- **Detection is structural** (`isEnhancedEnum`): the enum declares a field, method, getter or constructor, or a constant passes
  arguments. No name or package is consulted.
- **UIR:** `EnumDecl` gains `library`, `fields`, `methods`, `constructors` and `constants` (`EnumConstant`: name, constructor name,
  positional and named arguments). A plain enum carries none of them and is unchanged.
- **Emission:** an enhanced enum is a TypeScript class with one `static readonly` instance per constant, built in declaration
  order through the constructor's `$init_<Enum>`; `name`, `index`, `toString()` (`Enum.constant`, unless overridden) and
  `static values`. Identity is the instance, so `==`, `switch` and map keys behave as in Dart. Constructor arguments use the
  ADR-0055 calling convention (declaration order, `undefined` for omitted, callee defaults).
- **References:** a constant reference lowers to `Enum.constant`, `Enum.values` to the static list. An enum is emitted only when
  reachable, like any general class.
- **Refused explicitly:** a constant whose name collides with a member every class carries (`name`, `length`, `prototype`,
  `values`, `caller`, `arguments`) — reported, not renamed.
- `BRG1312` remains for any enum member read the model still cannot lower; it is no longer raised for enhanced enums.

## Evidence

Flutter oracle `fixtures/apps/enhanced_enums` (named and positional constructor arguments, getters, methods, `switch`
expression over the enum, `values`, `index`, `name`, interpolation, a `State` field holding an enum cycled with `values[i]`),
`expected.json` recorded from `flutter test`, compared with the generated component in jsdom. Five mutants (index off by one,
`toString` without the prefix, reversed `values`, wrong `name`, dropped first constructor argument) are each killed.
