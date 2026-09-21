# ADR-62 — Widget-returning helpers, statement-bodied builds, and widgets as values

- **Status:** Accepted (M12, production-compatibility phase 2). Found in two real applications: `_buildHeader(...)`/`_bodyFor(...)` helpers
  (17 opaque in a 240-file app), builds with loops and mutated locals (`final rows = <Widget>[]; … rows.add(…)`: `BRG1313`), spreads of
  widget lists, C-style collection-for in children, `Widget` parameters used as children.
- **Date:** 2026-09-21

## Decisions

**D1 — A widget-returning helper declared in the same file is inlined at the call.** `_header(title, bold: true)` extracts the helper's
returned tree with each parameter bound to the argument *as written at the call, evaluated in the caller's scope* (hygiene: an argument
named like the parameter still resolves in the caller). Supported: a method of the same class or a top-level function; expression body, or
`final` locals and one `return`; positional, named and defaulted parameters; helpers that call helpers; a helper used in a collection-for.
Refused (opaque, as before): another class or file, `async`, generic, recursive (the inner call), a helper whose free name a build local
would capture, a body with other statements.

**D2 — A `build` with statements has a `prelude`.** `ui.Component.prelude` holds the statements before the final `return`; the tree is
extracted in the scope they leave. Locals are real variables: one object however often the tree reads it, so a list built in a loop and
mutated in place is right (ADR-0048's per-read substitution — and its `BRG1313` refusal — no longer applies to it). The generator runs the
prelude in the render scope, before the tree, so state reads use the same snapshots. A build with an early `return` keeps the structured
path.

**D3 — Widgets are values in logic code.** While a statement-bodied `build` is extracted, a widget in an expression position
(`rows.add(Text('x'))`, `final Widget footer = c ? A() : B()`) is `logic.WidgetExpr`: its `ui.*` tree, emitted as JSX where the expression is.
`Widget` is `ReactNode`, `List<Widget>` is `ReactNode[]`.

**D4 — `ui.Nodes` renders a value as children:** a spread of a widget list (`...rows`), a `List<Widget>` prop (`actions: actions`), a
`Widget` parameter used as a child, and a collection element the tree has no node for (a C-style `for`).

## Evidence

`fixtures/apps/widget_helpers` and `fixtures/apps/build_statements` compared with `flutter test` (helpers with named/defaulted arguments,
locals, helper-in-helper, helper in a for-element with a same-named argument, a State helper with a callback; a loop-built widget list, an
`if` adding to it, a computed local, `...rows`, a C-style for, a widget-valued local, a State whose statements read state and change on a
tap). Analyzer tests pin the refusals and the prelude shape; 8 mutants killed.
