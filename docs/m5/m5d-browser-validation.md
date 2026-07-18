# M5-D — Browser end-to-end validation and production readiness

**Status: complete. A FlutterBridge-generated application has now run in a browser, and two defects that
made that impossible are fixed.**

The headline is uncomfortable and worth stating first:

> **No application FlutterBridge had ever generated could have run in a browser.** One defect stopped
> `next build` outright; the other left the application building, loading, hydrating and doing nothing when
> you clicked it. Both were green on every gate the project had — extraction, normalization, generation,
> `tsc` against the real runtime kit, and (M5-C) a registry install.

```text
  18 passed (10.2s)      production 14 · development 4
```

Full regression: 34/34 turbo tasks, 207 analyzer tests, 28 `bridge_uir`, `dart analyze` clean,
`codegen:check` OK, `lint:stubs` OK. Nothing committed.

---

## 1. The subject, and what is honestly absent

| Application | Emits? | In the browser suite |
| --- | --- | --- |
| `examples/counter` | ✅ zero diagnostics | ✅ |
| `fixtures/apps/hello_bridge` | ❌ **30 errors** | ❌ — there is nothing to load |
| build proof / layout proof | n/a — UIR fixtures, not projects | via `build.test.ts` |

**`hello_bridge` is not skipped, it is refused**, and the brief's instruction — *"if something cannot
generate honestly, stop, report, document, never fake support"* — is why it is absent rather than present
with its assertions commented out. Its 30 errors:

| Code | × | What it is |
| --- | --- | --- |
| `BRG3010` | 19 | a widget paints a Material role the program's theme defines no token for |
| `BRG3002` | 5 | an expression the generator cannot lower (incl. `new FavoritesStore(…)` — no class emission) |
| `BRG3006` | 4 | `widget` — the `StatefulWidget`/`State` back-reference, unmodelled |
| `BRG3016` | 2 | `MaterialApp` parameters with nowhere to go |
| `BRG3013` | 2 | a named capability that is not built |
| `BRG3008` | 2 | — |
| `BRG3007` | 2 | a `ui.Async` reached the generator: rendering a future needs loading and error branches |
| `BRG2104` | 1 | the same, upstream in normalization |

**19 of 30 are one root cause.** `hello_bridge` writes literal theme colours on purpose — they are N10's
input — so the program has tokens for `primaryColor` and `scaffoldBackgroundColor` and none for `surface`,
`onSurface`, `onSurfaceVariant` or `error`. INV-20 forbids inventing them, and the diagnostic already says
what to do (`ColorScheme.fromSeed(…)`). That is the compiler being right, and I did not edit the fixture to
make a number go down — the remaining 11 are the real capability gaps, and they are M5-A's list.

## 2. The two defects

### B1 — emitted imports carried `.js`, so `next build` failed on every generated app

```text
./app/page.tsx
Module not found: Can't resolve '@/components/counter-screen.js'
```

The scaffolder writes `"moduleResolution": "Bundler"`. Under Bundler resolution **TypeScript accepts a
`.js` specifier and resolves it to the `.tsx` beside it** — the `.js` convention belongs to `NodeNext`,
where the emitted JavaScript is what actually runs. webpack does no such mapping: it looks for a file
literally named `counter-screen.js`, does not find one, and stops.

So `tsc --noEmit` was clean and `next build` failed. **`tsc` was the only gate the pipeline had**, and M5-B
and M5-C both reported "the emitted project typechecks clean against the real kit" — true, and a different
claim from "the application builds". Three milestones were green on a project that could never have run.

Fixed by emitting extensionless specifiers, which is what Bundler resolution wants and what both resolvers
agree on.

### B2 — a signal read through an expression never subscribed, so the counter did not count

The app built, served, hydrated, and did nothing:

```text
initial             : You have pushed the button 0 times.
after ElevatedButton: You have pushed the button 0 times.
after FAB           : You have pushed the button 0 times.
CONSOLE(0):  PAGE ERRORS(0):  FAILED(0):
```

`_count.set(…)` ran. The signal changed. React never re-rendered, because nothing had subscribed to it.

Only a bare `bind.Signal` subscribed, by emitting `useSignal(…)` inline at the read. A signal reached
through an **expression** — `'…$_count times.'`, `_count + 1`, `if (_count > 3)` — arrives at the
expression emitter as a `logic.Ref` and became `_count.get()`: the right value, no subscription. String
interpolation is the single most common way a Flutter widget shows state, so the common case was the broken
one.

The fix hoists the subscription to the top of the component and has render-position reads use it:

```tsx
const [_count] = useState(() => signal(0));
const _count$ = useSignal(_count);          // ← subscribes, unconditionally

const handle_9429859f = () => {
  _count.set((_count.get() + 1));           // ← handler reads live, and is not a hook
};

<Text>{`You have pushed the button ${_count$} times.`}</Text>
```

Two reasons it is hoisted rather than fixed at each read site, and the second is a latent defect of its
own: **`useSignal` inline in JSX is a conditional hook call** whenever it sits inside a `ui.Cond` branch or
a `ui.List` template — which is exactly where bindings live. At the top of the component it is
unconditional by construction. The suite has a dev-server test for hook-order violations for this reason.

This also required splitting `EmitScope.signalRead` (the *value*, subscribed in render) from a new
`signalLocal` (the *object*, for `.set`/`.peek`). Those were previously one string, recovered by stripping
a trailing `.get()` — which worked only while every read had that exact shape.

## 3. The suite

`e2e/`, a new workspace package. **This retires the M2 stub tag on `just e2e`**, whose text named exactly
this pipeline: *"bridge build → next build → Playwright flows"*.

Every fixture is built by the real pipeline on every run — `flutter pub get` → `bridge build` (the CLI
binary, not an imported generator) → `npm install` → `next build`. The runtime kit installs from
`just package`'s tarball, the artefact M5-C validated through a registry, rather than a workspace link.

| Group | Tests | Asserts |
| --- | --- | --- |
| startup | 2 | 200, content **in the server's HTML**, hydration, landmark structure |
| state and signals | 3 | the counter counts; two widgets drive one action; state resets on reload (INV-19) |
| theme | 2 | colours resolve to N10's tokens; generated CSS is applied, not merely present |
| layout | 3 | Scaffold fills the viewport, FAB is positioned, `SizedBox(12)` is 12px, no horizontal overflow |
| routing | 2 | root route renders; an unknown path 404s rather than serving the app |
| assets | 2 | every request succeeds; **the console says nothing at all** |
| development build | 4 | hydration mismatch, key warnings, hook-order violations, console silence |

**Both a production server and a development server**, because they report different things: React's
production build strips warning text and skips whole checks, and hydration mismatches, key warnings and
rules-of-hooks violations are development-only. A production-only suite would be green on all three.

**Nothing is filtered by default.** `recordConsole` captures every message, page error and failed request;
exactly one message is tolerated anywhere — React's own "Download the React DevTools" banner, allowed by
exact subject at one call site with the reason written there, rather than by an "ignore info" rule.

### Regression protection

Both defects also have generator-level tests (`browser-regressions.test.ts`, 5 tests) that run in
`pnpm test` in under a second — the browser proves the behaviour once, these keep it proven. They assert
against `fixtures/uir/counter.normalized.ndjson`, a **real analyzer document** now committed, not a
hand-authored graph.

Seven existing `build.test.ts` assertions encoded the old emitted shape and were updated; one of them —
`<ListTile title={<Text>{_wonders.get()[index]}</Text>} />` — had B2's exact defect written into it as
expected output, working only because the enclosing `.map` happened to subscribe.

## 4. Measurements

Measurement only; nothing was optimized. Browser numbers are the page's own
`PerformanceNavigationTiming`, median of 5.

| Pipeline | ms | | Browser | |
| --- | --- | --- | --- | --- |
| `flutter pub get` | 765 | | server ready | 614 ms |
| `bridge init` | 85 | | TTFB | **3 ms** |
| **`bridge build`** | **8 427** | | first contentful paint | **20 ms** |
| ├ analyze | 8 335 (**99%**) | | DOMContentLoaded | 12 ms |
| ├ normalize | 13 | | load | 19 ms |
| ├ generate | 8 | | **interactive** | **12 ms** |
| `npm install` | 4 238 | | | |
| `next build` | 8 145 | | First Load JS (`/`) | **112 kB** |

Two observations, neither acted on:

- **Analysis is 99% of compile time**, and M5-A established the cause is Dart VM startup rather than
  analysis. M5-C measured a native analyzer at 3.2 s against 9.6 s. Unchanged conclusion.
- **The generated application is fast.** 20 ms to first paint and 12 ms to interactive, from a 112 kB
  first load. There is no measured bottleneck in the output, so there is nothing here to optimize.

## 5. Determinism

Three **complete** pipeline runs into a wiped directory — fresh `pub get`, fresh analyze from source, fresh
normalize, fresh generate:

```text
  ok   uir            run 1 vs run 2/3   7dae021ec9c4e694
  ok   normalized     run 1 vs run 2/3   82786fc6d819bade
  ok   emitted files  run 1 vs run 2/3   10 files

byte-identical across every run.
```

This is stronger than `bridge validate`, which checks determinism and the fixed point over one document
within one process. `just determinism` runs it.

## 6. Release audit

| Layer | Verdict | Detail |
| --- | --- | --- |
| **Analyzer** | ✅ | 207 tests, `dart analyze` clean, byte-identical across runs and forms |
| **Compiler** | ✅ | N1–N11 in 13 ms; fixed point and determinism hold on real documents |
| **Generator** | ⚠️ **two defects fixed here** | both were invisible to every non-browser gate |
| **Runtime kit** | ✅ | correct throughout — `useSignal` subscribed properly; the generator was not calling it |
| **CLI** | ✅ | unchanged this milestone; `--json` stage timings were the measurement source |
| **Packaging** | ✅ | unchanged; the kit tarball installed and ran in a real browser |
| **Documentation** | ⚠️ | `docs/guide/*` does not yet mention `just e2e`; no browser-testing guide |

### Release blockers

1. **A real application still cannot emit.** Unchanged from M5-A, and the reason this is `0.1.x`.
   `hello_bridge`'s 11 non-theme errors are the list: class emission, `widget` back-references, `ui.Async`.
2. **One application, one browser, one platform.** Everything below is a consequence of that.

### Minor issues and warnings

- **Next warns about multiple lockfiles** in the emitted project (`pnpm-lock.yaml` above it,
  `package-lock.json` inside). Harmless here, would confuse a user whose Flutter project sits in a
  monorepo. The generator could set `outputFileTracingRoot`.
- **A dev-server cross-origin warning** for `127.0.0.1` vs `localhost` — a harness artefact, not the app's.
- **`next dev` and `next start` cannot share a directory** (both own `.next`); the suite keeps two copies.
  Worth knowing before someone debugs it again.

### Technical debt

- The suite covers **one** application. Forms, dialogs, navigation between routes, scrolling and stores are
  all in the brief and none has an emitting subject — `hello_bridge` is where they live.
- **Store reactivity is unvalidated in a browser.** The component-local path had B2; the store path reads
  through `useStore` and was not exercised, because no emitting application has a store. Reading the code,
  it does not have B2's shape — but that is reading, not running, and this milestone is about the
  difference.
- No visual regression, no accessibility audit, no multi-browser run (Chromium only).

## 7. Release readiness

**Better than before this milestone, and for an uncomfortable reason.** The compiler's *output* is now
known-good in a way it never was: the one application that emits builds, serves, hydrates, updates on
interaction, resolves its theme, lays out correctly, and says nothing on the console in either mode.

Before M5-D that was unknown, and had been assumed since M3 on the strength of a typecheck.

What has not changed: coverage. One application is validated. The gap between "the example works" and
"a real app works" is M5-A's language list, and no browser test shortens it.

## 8. Recommendations for M5-E

1. **Close `hello_bridge`'s 11 non-theme errors, and add it to the suite.** It has forms, dialogs, multiple
   routes, a store and navigation — every group the brief named and this milestone could not reach. It is
   the cheapest way to multiply browser coverage, because the suite already exists and its subject list is
   one array.
2. **Then validate store reactivity in a browser specifically.** B2 was in the component-local path. The
   store path is analogous, has never been run, and would fail the same way — silently.
3. **Then broaden the environment**: Firefox and WebKit, and the platform matrix M5-C left open. Both are
   configuration on infrastructure that now exists.

Item 1 before item 3 is deliberate. M5-D's evidence is that the *unvalidated* paths are where the defects
are — two in the one path nobody had run — so more applications through one browser is worth more than one
application through more browsers.
