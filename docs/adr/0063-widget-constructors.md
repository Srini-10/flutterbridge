# ADR-63 — Widget constructors: initializer-list constants, named constructors, factories

- **Status:** Accepted (M12, production-compatibility phase 2). Found in a real 21-package monorepo: five `BRG1309` refusals in a design system
  (`const AppListRow(...) : destructive = false`, `AppListRow.destructive(...)`, `factory AppEmptyState.error(...) => AppEmptyState(...)`), which
  cascaded into dangling component references (`BRG1201`).
- **Date:** 2026-09-21

## Decisions

**D1 — An initializer-list constant is the field's default.** `const W({...}) : danger = false` — no caller can pass `danger`, so its value is
its default. A value computed from a constructor parameter is still refused (`BRG1309`).

**D2 — A named or factory constructor of a project widget is its own component**, `Class_ctor` (`AppListRow.destructive` →
`AppListRow_destructive`), with the constructor's own parameters. A factory's render is the widget it returns; a generative named
constructor's is the class's `build` with each field bound to a parameter, to the initializer-list value, or to its own default. A use site
constructs the variant, and positional arguments are named by the variant's parameters.

**D3 — Still refused (`BRG1309`):** a redirecting constructor, and a named generative constructor of a *stateful* widget (it would need the `State`
duplicated).

**D4 — A widget class with no `build`** (a custom `RenderObjectWidget`, an `InheritedWidget`) is declared as a component with an opaque render and a
warning, so references to it resolve and the generator refuses each use by name; an abstract base is still not declared.

## Evidence

`fixtures/apps/widget_constructors` compared with `flutter test`; analyzer tests pin the variant shape, the default, and the refusals.
