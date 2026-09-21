# ADR-64 — go_router shapes found in a real monorepo, and other analyzer fixes it exposed

- **Status:** Accepted (M12, production-compatibility phase 2). A 21-package monorepo (816 components) produced **0 routes** and dozens of
  dangling navigations.
- **Date:** 2026-09-21

## Decisions

**D1 — A route's page may be wrapped.** `pageBuilder: (_, state) => _fadePage(state, const Page())` and
`CustomTransitionPage(child: Page())` name their page as the one widget-typed argument of the call that builds the transition page.
**D2 — `StatefulShellRoute` and `StatefulShellBranch`** are shells: their `branches: [StatefulShellBranch(routes: [...])]` are the
route tree (`routes:` for `ShellRoute` as before).
**D3 — The same path declared twice in one file** is two routes; the first keeps the path's symbol (navigations resolve to it), later ones are
numbered in source order. It was `BRG1202` (duplicate declaration symbol).
Result on the monorepo: 0 → 127 routes, 0 unresolved pages, 0 dangling navigations.

## Also fixed here (each found by the same run)

- Named arguments called `id` and `kind` made `namedArgs` look like a UIR node to the builder's validators (`BRG1204`): nodes are recognised by
  a string `kind` **and** string `id`.
- A `static` method / `values` / a bare constant inside an enhanced enum, and store members extraction does not declare, no longer dangle
  (`BRG1201`) — ADR-0060.

## Not done

Route *names* (`goNamed`) are still unresolved edges (a warning); a route held in a variable is still not followed.
