# FlutterBridge — production compatibility audit (phase 2)

Baseline `ded8c3c`; head `8ade08d` plus this audit. 13 commits, ADR-0055…0067. Real applications were analysed **read-only, in disposable
copies**; nothing in either was edited, and no fix names an application, a package's private class or a file. Each fix is a general
Dart/Flutter semantic with a Flutter-oracle fixture and mutants.

## Burn-down (real applications)

| Application | Baseline | Now |
| --- | --- | --- |
| 240-file consumer app — analyzer errors | **296 `BRG1201`** (part files) | **0** |
| 240-file app — generator errors | 639 | 599, with far more code reachable (a class model, statics, mixins, freezed shape now lower instead of being refused first) |
| 240-file app — opaque expressions | ~700 (function refs 76, throw 67, extension 61, mixin 59, `?.` 34, spread 27, switch 20, tear-offs 18 …) | 61 (`extension`), 9 widget-by-call, 7 unrecognised widget, 4 record |
| 21-package monorepo — analyzer errors | 45 (`BRG1201`/`1309`/`1313`, then `1202`, `1204`) | **0** |
| Monorepo — routes | **0** | **127**, 0 unresolved pages, 0 dangling navigations |
| Monorepo — generator errors | (blocked before generation) | 4 675 over 816 components: `ref` 464 / Riverpod, design-system theme extensions (`context.palette`, `BRG3010` 293), `BRG3013` top-level variables built from those |

Neither application compiles end to end, and neither can: both are built on Riverpod, one on `dio` and native audio plugins, one on
`supabase` and a theme-extension design system. Those are package APIs with no model here. What the real code exposed that is *general*
is fixed and proven; the rest is refused by name (see the contract in `docs/guide/language-support.md`).

## What was built (each with an ADR, a fixture compared with real Flutter, and mutants)

| ADR | Capability | Found by |
| --- | --- | --- |
| 0055 | General class model: constructors, inheritance, abstract, statics, operators, `is`, object mutation notifications | 240-app: classes were refused |
| 0056 | Enhanced enums as classes | 18 `BRG1312` |
| 0057 | SDK statics (`identical`, `Object.hash`, `unawaited`, `double.infinity`), package constants as identity tokens | 549 `BRG3006` |
| 0058 | throw/rethrow expressions, tear-offs, cascades, whole-chain null-shorting, collection spread/if/for, checked `as` | 350 opaque expressions |
| 0059 | Mixins; classes that others inherit are classes | 59 mixins |
| 0060 | List/Set/Map surface, collection constructors, enum statics | fold/firstWhere/List.from; monorepo `BRG1201` ×35 |
| 0061 | Exception classes, typed `catch`; **`try/finally` no longer swallows the exception** (silent loss since M3) | oracle |
| 0062 | Widget-returning helpers inlined; statement-bodied `build` (prelude); widgets as values; `ui.Nodes` | 17 helpers, `BRG1313` |
| 0063 | Widget constructors: initializer-list constants, named constructors, factories | monorepo design system |
| 0064 | go_router page wrappers, `StatefulShellRoute`, duplicate paths; `id`/`kind` named arguments no longer mistaken for nodes | monorepo: 0 routes, `BRG1204` |
| 0065 | Dart 3 patterns: switch expressions and pattern cases | 67 opaque switches |
| 0066 | `DateTime`, `Timer`, `Future` factories, parsing, async and named-parameter functions | 144 named-arg refusals |
| 0067 | freezed's generated shape: callable copy objects, generics, type guards, `runtimeType` | freezed part files |

Earlier in the phase (before the ADR series above): part-file symbols (`704f114`, the 296 `BRG1201` — one root cause), project statics (`382e9ec`).

## Silent losses found and fixed in this phase

`try { } finally { }` swallowed the exception; `?.` on a subscript dropped the `?`; `a?.b.c` guarded only `a?.b`; `json['id'] as int` was
an unchecked assertion; a typed `catch` caught everything; a `final` field holding a mutable object was not state when the mutable field
was inherited; a `Timer`/signal receiver was read twice; a named argument called `kind` broke the builder's validators.

## Not done (honestly)

Riverpod and the package boundary above; `InkWell`/gestures, `LayoutBuilder`/constraints (still refused with their existing diagnostics — not
built in this phase); route names; extension methods (61 in one app); records; a **large production app running in Chromium** — not achieved.
No claim of universal Flutter support is made.

## Gates on the final tree

`just ci` exit 0; `just release-check` exit 0; `just e2e` 66 tests in Chromium (production and development) pass; `just determinism` byte-identical across every run (an earlier attempt failed only on a `pub.dev` socket error and was re-run). `git diff --check` clean. `fixtures/apps/hello_bridge/analysis_options.yaml` (the user's change) is untouched and unstaged.
