# ADR-72 — Navigation by route name (`goNamed`, `pushNamed`, `pushReplacementNamed`), and departures that name their route

- **Status:** Accepted (M13). Route *names* were unresolved edges (ADR-0064: "Not done"); a real 127-route app navigates by name throughout.
- **Date:** 2026-09-21

## Decisions

**D1 — `app.Route.name`.** A route's `name:` (a compile-time constant string) is recorded on the `app.Route`, read through the same argument mapping
as `path:` (so wrapper route classes work).
**D2 — A navigation by name is a `RawRouteRef.named(name)`.** The builder resolves it against the route table's names — the only place that sees every
route — the way a path is resolved against paths. A name carried by no route, or by two, resolves to nothing (`BRG1308`, a warning).
**D3 — The departure names the route (`logic.Navigate.route`).** A route destination's edge has no symbol (M7-C §8), so `logic.Navigate` had no destination for
`context.go('/x')`/`Navigator.pushNamed('/x')` at all: **no navigation to a route was ever lowered**. It now carries `route`, the `app.Route` id, for a path
*or* a name; the generator emits `router.push({ kind: 'route', route })`. Unresolved → the field is left out (the builder returns "absent" for a `Navigate`
owner instead of dropping it, which would take its component with it) and the generator refuses that one navigation by name.
**D4 — What travels with a by-name navigation is not modelled.** `pathParameters`, `queryParameters`, `extra` → the edge is left out with a warning
(`BRG1304`); a destination that needs them is never reached without them. A non-constant name is refused the same way.
**D5 — Roots are not walked for reachability.** An app root emits no file, so `routerConfig: router` no longer pulls the `GoRouter` initializer into
the module emitter (it was `BRG3013`, "GoRouter is one of this application's own classes").

## Documented differences

- `go` is lowered as a push (ADR-0025): go_router's `go` replaces the whole stack. `pop` after `goNamed` returns to the previous screen here; it would not in Flutter.
- The router is a client-side stack: the URL is not updated on navigation and a URL does not select a route on a hard load beyond the initial one.
- A route held in a variable (`routes: [_settingsRoute]`) is still not followed.

## Evidence

`fixtures/apps/named_routes` (go_router 14, four routes including a nested one) through `next build`, then a Chromium suite in production and development:
`goNamed` and back, by-name equals by-path, nested route, `pushNamed` + `pop`, `pushReplacementNamed`. Analyzer tests: name resolution, nested join,
unknown name, `pathParameters`, non-constant name; the pinned M7-B "path destinations keep refusing" is replaced by the stronger `route` contract.
