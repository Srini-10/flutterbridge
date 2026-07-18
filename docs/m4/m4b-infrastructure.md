# M4-B — Infrastructure Report

**Goal:** make adding the next 50+ widgets mechanical rather than architectural.

**Status:** complete for §§1, 2, 3, 5, 6, 7. **§4 (assets) is blocked** by a genuine architectural conflict,
documented with evidence in [ADR-0023](../adr/0023-naming-positional-widget-arguments.md) and not implemented
— `CLAUDE.md` rule 4 is explicit that an interface change is filed, not made.

CI is green: 207 analyzer tests + `dart analyze` clean, 28 `bridge_uir`, 22/22 TS test tasks (253 runtime,
70 generator, 126 compiler), 18/18 typecheck, `codegen:check` OK, `lint:stubs` OK.

---

## 1. Architecture changes

### The one-sentence summary

Three things widgets used to each own privately — **how a Flutter enum becomes CSS**, **how a box is sized**,
and **where a colour comes from** — became three shared layers, and the widget map became a *declaration of
requirements* that the generator verifies instead of assumes.

### Theme-in-component (§1)

`ThemeSurface` (`internal/theme/surface.ts`) is the whole of what a Material component may know about theming.
A component names a **role** and gets a CSS value; it never sees a hex string, a brightness, or the fact that
ADR-21 puts alpha first.

The design decision worth recording: **the kit does not enumerate the role vocabulary.** The 46 `MaterialRole`
values are framework metadata living in `packages/uir/schema/l3.json`, and ADR-18 forbids restating them in a
second language while ADR-19/ADR-6 keep the kit off the schema's version. Both hold at once because the kit
needs *lookup*, not enumeration — a role is a string here, and the **generator** (which has `MaterialRole`)
checks at build time that every role a mapped widget paints is one the program's tokens define. Type safety
sits where the schema is; the kit stays a resolver.

Two real defects fell out of building it:

1. **An INV-20 violation shipped in M4-A.** `material.ts` held `const DIVIDER_COLOR = 'rgba(0, 0, 0, 0.12)'` —
   a literal colour in a kit component, which ADR-13 calls *"a compiler bug"* in as many words. It was also
   wrong in dark mode, where a 12%-black rule is invisible. `Divider` now resolves `outlineVariant`.
2. **`role` was dropped at the generator→runtime boundary.** `emitTheme` never emitted it and
   `TokenDescriptor` had no field for it. Invisible, because N10 sets `name` and `role` to the same string for
   every role it derives — so lookup by name found them and nothing appeared missing. The case it lost is the
   other producer: `ThemeData(primaryColor: …)` extracts under the *parameter's* name carrying `role`
   separately, and a component asking for `primary` would not have found it.

Elevation and state-layer composition are in place (`ThemeSurface.elevation`, `.stateLayer`) and read their
opacities from `shadow`-group tokens, per ADR-18's rule that Material's opacities are framework metadata. No
pass emits those tokens yet — see *Remaining blockers*.

### Constraint model (§2)

`internal/layout/constraints.ts`. Flutter's box protocol mapped to CSS **once**, serving all ten widgets the
brief names. Helpers return `CSSProperties` fragments and `mergeStyles` composes them onto one element — a
`Container` is insets *and* constraints *and* alignment, and nesting a `<div>` per concern would change what a
percentage resolves against and put three extra nodes in every tree.

### Alignment model (§3)

`internal/layout/alignment.ts`. Every Flutter alignment vocabulary — `MainAxisAlignment`, `CrossAxisAlignment`,
`MainAxisSize`, `WrapAlignment`, `WrapCrossAlignment`, `TextAlign`, `VerticalDirection`, `TextDirection`,
`Alignment`, `AlignmentDirectional` — with **one** conversion layer. `flex.ts` no longer holds a table.

The one genuine branch: `Alignment` is **physical** and `AlignmentDirectional` is **logical**, and CSS
distinguishes them too (`justify-content: left` vs `flex-start`). Mapping both onto `flex-start` — the obvious
shortcut — silently converts every physical alignment into a directional one, invisible until the first RTL
locale and wrong on every screen of it.

### Generator infrastructure (§5)

`internal/emit/runtime.ts` is the capability registry: the runtime specifier is stated **once** (it was a
`const RUNTIME` in two files), and `isKitProvided` moved here so value-type imports resolve from the type's own
library rather than a name list.

`WidgetMapping` gained `roles` and `alignmentProps` — requirements the generator *checks* rather than assumes.
And `supportedWidgetNames()` is now derived from `WIDGET_MAP` instead of a hand-kept copy that had drifted to
naming seven widgets while fifteen were supported: the diagnostic whose job is telling an author what *is*
available was itself out of date.

Two emitter gaps were found empirically (by running the real analyzer over a probe fixture, not by reading
code) and fixed:

- **Kit static consts.** `Alignment.bottomRight` arrives as a `logic.Ref` with a dotted name and a
  `package:flutter/…` type. It now lowers to the same text with an import attached.
- **Kit named-arg constructors.** `BoxConstraints(maxWidth: 400)` arrives as `logic.New` with `namedArgs`,
  which `refuseNamedArgs` rejected outright. For a *kit-provided* type the signature is known by convention
  (named params → one options object), so it now lowers. **This also unblocked `EdgeInsets.symmetric`, whose
  matching kit signature had been sitting unreachable since M3-A.**

---

## 2. Files added

| File | What |
| --- | --- |
| `packages/runtimes/react/src/internal/layout/alignment.ts` | Every alignment vocabulary → CSS, once |
| `packages/runtimes/react/src/internal/layout/constraints.ts` | The box protocol → CSS, once |
| `packages/runtimes/react/src/internal/theme/surface.ts` | `ThemeSurface` — roles, typography, spacing, radius, elevation |
| `packages/runtimes/react/src/internal/react/theme.ts` | `useThemeSurface()` — reactive, SSR-safe, memoised |
| `packages/generators/react/src/internal/emit/runtime.ts` | The runtime capability registry |
| `docs/adr/0023-naming-positional-widget-arguments.md` | The §4 blocker |
| `docs/m4/m4b-infrastructure.md` | This report |

`internal/widgets/edge_insets.ts` → `internal/layout/edge_insets.ts` (git-tracked rename: it is a layout value
type, not a component).

## 3. Files modified

**Runtime kit:** `index.ts` (exports + stub tags retagged M3→M4 with what actually remains),
`theme/theme.ts` (`role` field, `tokenAt`/`colorAt` non-reactive reads, role-first lookup), `theme/color.ts`
(`cssColor` — the CSS form, kept deliberately unlike `formatColor`'s ARGB interchange form),
`diagnostics/codes.ts` (BRG4008, BRG4009), `widgets/basic.ts` (+`Align`, `ConstrainedBox`, `AspectRatio`,
`FractionallySizedBox`, `SafeArea`; `Center` is now literally `Align(center)`), `widgets/flex.ts` (tables
removed, `verticalDirection`, `Wrap.crossAxisAlignment`), `widgets/stack.ts` (`alignment` now maps),
`widgets/material.ts` (themed).

**Generator:** `emit/widgets.ts` (capabilities, `supportedWidgetNames`, 5 new mappings),
`emit/component.ts` (`checkCapabilities`, registry), `emit/expression.ts` (the two lowerings, registry),
`emit/theme.ts` (`role`), `emit/store.ts` + `pipeline.ts` (`themeRoles`), `diagnostics/codes.ts` (BRG3010,
BRG3011).

**Fixtures/tests:** `build_proof_test.dart` + `temp_project.dart` + `fixtures/uir/layout_proof.ndjson`
(regenerated), `build.test.ts`, `generate.test.ts`, `widgets.test.ts`, `ssr.test.ts`.

## 4. Algorithms

- **Alignment → flex.** `(x, y) ∈ {-1,0,1}²` → `justify-content` × `align-items`, with the `x` table chosen by
  `directional`. Fractional coordinates are **refused** (`BRG3011` at build, `BRG4008` at runtime), not
  snapped. The rejected alternative — `position:absolute; left:L%; transform:translateX(-L%)` where
  `L=(1+x)/2·100` — is *arithmetically exact* for arbitrary `(x,y)`, but takes the child out of flow, so a
  `Center` inside an auto-height `Column` collapses to nothing. A worse failure in a far more common shape.
- **Constraints → CSS.** Four numbers → four longhands. `Infinity` maxima emit nothing (`none` would clear an
  inherited limit); a stated `minWidth: 0` **is** emitted, because CSS's default `min-width: auto` on a flex
  item is its min-content size — the automatic-minimum-size rule, corrected once for every widget.
- **Theme resolution.** `createThemeSurface(theme, brightness)` is a pure function of two arguments; the hook
  memoises on exactly those. Colour lookup is role-first then name, cached per `(brightness, name)`.
- **Capability check.** Per `ui.Element`, before emission: declared roles ∩ program tokens, and constant-folded
  alignment coordinates. `constantAlignment` reads only literal constructions (including `logic.Unary '-'`);
  anything it cannot evaluate is left alone, because a false `error` refuses a program that is fine.

## 5. Validation

Every piece is exercised through **Flutter → Analyzer → Normalize → Generator → TypeScript → Runtime** on the
real build proof, using analyzer output only. No hand-written UIR anywhere in the chain.

The fixture now carries `ColorScheme.fromSeed(seedColor: Color(0xFF6750A4))`, and that is load-bearing:
`Divider` declares `outlineVariant`, so the seed is the difference between a program that generates and one
that is correctly refused. The proof therefore exercises the whole token path — `ThemeData` → analyzer →
`app.Token` → **N10** → generator → `ThemeDescriptor` → the kit's surface — where it previously asserted layout
over an unthemed app.

The old assertion *"the compiler changes nothing for this fixture"* was replaced. It was true, and a weaker
proof than it looked: a chain in which a stage is a no-op does not demonstrate the stage runs. It now asserts
what N10 actually does — preserves all 6 analyzer nodes, adds exactly 46 derived roles including
`outlineVariant` and `primary`.

**SSR:** 5 new tests in `ssr.test.ts`, in the Node environment (no jsdom). The surface resolves roles under
`renderToString`, `Divider` server-renders, brightness does not leak between requests (ADR-15), and elevation
composes from tokens. Server emits `rgb(202 196 208)`; the client CSSOM normalises to `rgb(202, 196, 208)` —
same declaration, no hydration mismatch, and both forms are asserted at the layer that produces them.

**INV-20 asserted on the artefact**, not trusted: the emitted component source contains no `#RRGGBB` and no
`rgb(`.

## 6. Benchmark impact

| Measure | Value |
| --- | --- |
| `bridge normalize` (52 nodes incl. N10's 46 derived) | 0.07–0.08 s, 5 runs |
| Runtime kit bundle (`dist/index.js`) | 38,990 bytes |
| Runtime suite | 253 tests, ~0.9 s |
| Signal-graph bench | unchanged — cached deep read 104k hz, 1000 batched writes 45k hz |

The theme surface adds no per-render cost beyond one `useMemo` keyed on `(theme, brightness)`: colour parsing
is cached per `(brightness, name)` for the theme's lifetime, so the *n*th component reading a role does a `Map`
lookup. It is off the signal-graph hot path entirely, which the unchanged benchmark confirms.

## 7. Determinism proof

```
$ node packages/cli/bin/bridge.mjs normalize fixtures/uir/layout_proof.ndjson --out n{1,2,3}.ndjson
daf1dbabee46ff4f05d53aeb8855fbad9132dea0b3de609af0f94138b88e1635  n1.ndjson
daf1dbabee46ff4f05d53aeb8855fbad9132dea0b3de609af0f94138b88e1635  n2.ndjson
daf1dbabee46ff4f05d53aeb8855fbad9132dea0b3de609af0f94138b88e1635  n3.ndjson
```

Three independent runs, identical SHA-256. Preserved by construction in the new code: `mergeStyles` pins key
order (object spread preserves string-key insertion order), named constructor arguments are **sorted** before
emission so the bytes do not depend on the order the analyzer walked the argument list, and every lookup table
is a frozen module-scope constant with no state in it (ADR-15).

Generator determinism holds at the artefact level (`generate.test.ts`: byte-identical files across runs,
independent of node arrival order) and the analyzer's is guarded by the golden drift-check plus its own
`determinism_test.dart`.

## 8. Incremental proof

**Fixed point** — `normalize(normalize(x)) == normalize(x)`:

```
daf1dbabee46ff4f05d53aeb8855fbad9132dea0b3de609af0f94138b88e1635  n1.ndjson
daf1dbabee46ff4f05d53aeb8855fbad9132dea0b3de609af0f94138b88e1635  nn.ndjson
```

Identical, so N10 does not re-derive on top of its own output — the derived tokens are content-addressed and
the pass short-circuits on an already-populated role set.

**Incremental ≡ clean** is asserted in `generate.test.ts` (a second run over an unchanged program produces an
identical result) and by the analyzer's `incremental_test.dart` / `incremental_pipeline_test.dart`, all green.

## 9. New diagnostics

| Code | Severity | Meaning |
| --- | --- | --- |
| `BRG3010` `UnresolvedThemeRole` | error | A mapped widget paints a Material role the program's tokens do not define. The **build-time half of INV-20** — previously this compiled cleanly and threw `BRG4006` on first paint. Message names the role and points at `ColorScheme.fromSeed`. |
| `BRG3011` `UnrepresentableAlignment` | error | A fractional `Alignment` CSS flexbox cannot express. Message states the exact position. |
| `BRG4008` `UnrepresentableAlignment` | runtime | The same, for a hand-written alignment the generator never saw. |
| `BRG4009` `InvalidToken` | runtime | A token of the wrong *shape* for its accessor (spacing holding a string). Distinct from `BRG4007`, which is a colour whose text will not parse. |

## 10. Remaining blockers

1. **Assets (§4) — blocked.** See [ADR-0023](../adr/0023-naming-positional-widget-arguments.md). Positional
   widget arguments reach UIR under a synthetic `_positional0` key; the extractor's own comment says *"the
   schema has nowhere to put it."* Verified against the real analyzer. Also needs `WIDGET_MAP` keyed on
   `constructorName` (`Image.asset` ≠ `Image.network`, and `mappingOf` ignores it today), pubspec `assets:`
   parsing (does not exist), and a host decision on asset bytes (ADR-22 forbids the generator touching the
   filesystem).
2. **Elevation/state-layer opacities.** The composition functions are in place and read `shadow`-group tokens;
   no pass emits them. Per ADR-18 they are framework metadata and belong in `catalog/`, which needs a codegen
   target into the runtime kit.
3. **The measuring half of the constraint model.** `FittedBox` over arbitrary content, `Align`'s
   `widthFactor`/`heightFactor`, intrinsic sizing, and the unbounded-main-axis case. All need a child's
   *measured* size, which is a layout read rather than a style. Retagged `BRIDGE-STUB(M4)` with each divergence
   named at the helper that causes it.
4. **`hello_bridge` still cannot satisfy INV-20** — it sets `primaryColor`/`scaffoldBackgroundColor` on
   `ThemeData` rather than using a `ColorScheme`, so N10 derives nothing. Unchanged from the M3-B corpus report;
   BRG3010 now makes it a *loud* failure rather than a silent one if a Material widget is added to it.

## 11. Widget families now unlocked

Adding a widget in these families is now **one runtime component + one `WIDGET_MAP` entry**, no third file:

- **Pure layout** — `Container`, `ColoredBox`, `DecoratedBox`, `Opacity`, `ClipRRect`, `Transform`,
  `IndexedStack`, `SingleChildScrollView`, `OverflowBar`, `ListBody`. Constraint + alignment models cover them.
- **Themed Material chrome (colour only)** — `Card`, `ListTile`, `Chip`, `CircleAvatar`, and the Material
  *appearance* of `ElevatedButton`/`TextButton`/`OutlinedButton`. Colours resolve through `ThemeSurface`; those
  needing elevation wait on blocker 2.
- **Text styling** — `TextAlign`, `TextDirection` and the typography accessor are in place; `TextStyle` needs
  the `typography`-group tokens to be emitted.
- **Anything taking a Flutter value type** — the named-argument lowering means a new kit value type needs no
  emitter change at all.

Still architectural, unchanged from the M4-A triage: imperative overlays (SnackBar/BottomSheet/menus),
controlled inputs and controllers (TextField/Form), the sliver protocol, and `Hero`'s shared-element
transition. Each needs its own ADR before implementation.

## 12. Next milestone recommendation

**M4-C: accept ADR-0023, then land assets and the catalog's Material metadata.** In order:

1. **Accept or reject ADR-0023.** It blocks `Image`, `Icon` and every other widget with a meaningful positional
   argument, and accepting it lets the `role: 'text'` special case be *deleted* rather than joined by an `Icon`
   one — a net reduction in framework knowledge outside the catalog.
2. **A catalog codegen target for the runtime kit**, carrying Material's elevation and state-layer opacities.
   This is the last thing standing between the themed-chrome family and being mechanical, and `color.ts` has
   been waiting on it since M3-A.
3. **Then** the widget sweep — Family A and themed chrome, which by then really is two files each.

Doing 3 before 1–2 would mean the first `Card` reintroduces a literal opacity in a kit component, which is the
INV-20 violation this milestone just removed.
