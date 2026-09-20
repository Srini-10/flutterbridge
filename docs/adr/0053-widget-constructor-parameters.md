# ADR-53 — Widget constructor parameters: defaults, optional parameters and positional arguments

- **Status:** Accepted (M11). Found by executing real programs against Flutter; each item below was a widget idiom the
  compiler accepted and got wrong.
- **Date:** 2026-09-20

## Context

`const Tag(this.id, {this.label = 'none', this.count = 3, this.note})` is the ordinary way to write a small widget. Three
defects, each observed by running the program in Flutter and as generated code:

| Dart | Before | Consequence |
|---|---|---|
| `this.count = 3` | `required: true`, default dropped — the field had no *initializer*, and that was the test | every call site that omitted `count` was a `tsc` error; had it compiled, `props.count` would be `undefined`, not 3 |
| `this.note` (nullable, optional) | required | same; and an omitted JSX prop is `undefined` where Dart's absent value is `null` (`note == null`, `note ?? 'x'`) |
| `const Tag(1)` | prop named `_positional0` | a prop no component declares; the call site never typechecked |

## Decision

- **Analyzer.** A component's parameters are read from its **constructor** (`FieldFormalParameter`): `required` is the
  parameter's own `isRequired`, and `defaultValue` is its default expression (`ParamDecl.defaultValue` already existed). A
  positional argument to a widget the catalog does not name is labelled with its **constructor parameter's name**.
- **Generator.** A component with any non-required parameter takes `rawProps` and resolves omissions once —
  `const props = useDefaults(rawProps, { count: 3, note: null })` — so every read stays `props.x`. An omitted parameter with
  no default resolves to `null`.
- **Runtime.** `useDefaults` memoises on the props object, so the resolved `props` is a new object exactly when React handed
  the component a new one. That preserves ADR-0052's `didUpdateWidget` trigger (identity of `props`), which a fresh object per
  render would have broken. An explicit `undefined` counts as omitted.

## Evidence

`fixtures/apps/widget_param_defaults`, run by Flutter and as the generated component, compared (mount and after a toggle that
changes which arguments are supplied): 7 call shapes over defaults, an optional nullable, a positional required and a mix. Four
mutations killed: defaults never applied, defaults overriding supplied values, an omitted nullable resolving to `undefined`,
positional parameters named `_positionalN`.

## Not covered

Optional *positional* parameters (`[this.x = 1]`) on a widget; a constructor initializer list (`: _x = x * 2`), factory and
named constructors; a parameter that is not an initializing formal (`Tag(int n) : count = n * 2`) — those still take the old
path (required iff the field has no initializer).
