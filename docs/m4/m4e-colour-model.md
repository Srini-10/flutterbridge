# M4-E — The colour model and decoration

**Goal:** eliminate the architectural gap around colour-valued properties.

**Status: complete.** Colours resolve end-to-end for every form real Flutter writes. Decoration lowers through
one path. **No schema change, no new compiler pass, no new ADR** — the gap turned out to be an *analyzer*
capability, not a missing construct.

CI green: 207 analyzer tests + `dart analyze` clean, 28 `bridge_uir`, 22/22 TS test tasks (306 runtime, **93**
generator, 126 compiler), 18/18 typecheck, `codegen:check` OK, `lint:stubs` OK.

---

## 1. The colour model

### What the evidence said

Every form was put through the real analyzer. All eight extract cleanly — the M4-D report's assumption that
they were blocked was wrong about *where* the block was:

| Written as | Extracts as | Constant? |
| --- | --- | --- |
| `Color(0xFF2196F3)` | `logic.New Color(Lit int)` | yes |
| `Colors.white` | `logic.Ref`, type `Color` | yes |
| `Color.fromARGB(255, 33, 150, 243)` | `logic.New Color.fromARGB(Lit…)` | yes |
| `Color.fromRGBO(33, 150, 243, 1.0)` | `logic.New Color.fromRGBO(Lit…)` | yes |
| `Colors.blue.shade700` | `logic.PropertyAccess`, type `Color` | yes |
| `Theme.of(context).colorScheme.primary` | nested `PropertyAccess` over a `Call`, type `Color` | no — a role read |
| `BoxDecoration(color:, border:, boxShadow:, gradient:)` | `logic.New` with nested colours at depth | mixed |

**The decisive observation: every one carries `type: Color`.** So a colour is identifiable by its *resolved
type*, never by a parameter's name — which is what makes the lowering general rather than per-widget.

### Where a colour belongs, and who decides

INV-20 (ADR-13) is unambiguous: *"every colour a mapped Material widget paints must resolve to an
`app.Token`"*. That answers the §1 question — a colour belongs in **`app.Token`**, not in `bind.Const` as a
hex, and not in a second colour system.

The question that actually mattered was *who can put it there*. And there is only one possible answer:

> **The analyzer, because a colour's value exists in Dart's constant evaluator and nowhere downstream.**
> By the time the compiler sees `Colors.white` it is a name with no value attached; by the time it sees
> `Color(0xFF2196F3)` it is an integer nobody knows is a colour.

So this is analyzer work, and that is why it needed **no new normalization pass and no schema change**. A
compiler pass could not have done it.

### The algorithm

In `ExpressionExtractor.extract`, ahead of every other path, for any expression whose resolved type is a
framework `Color`:

1. **Constant-evaluate.** Success → hoist to an `app.Token` named from the value (`colorFF2196F3`), and
   replace the expression with a `logic.Lit` holding that **name**. Deterministic and self-deduplicating: the
   same colour in ten files is one token.
2. **Otherwise, recognise a role read.** A property access whose receiver is named `colorScheme` already
   *names* a token, so the property name is the answer. Recognised structurally — neither `Theme` nor `of`
   appears anywhere in the function.
3. **Otherwise, return `null`** and fall through to ordinary extraction, where the generator refuses it
   (`BRG3014`).

Both resolving paths converge on the same output — **a string naming a token** — and nothing downstream can
tell a hoisted literal from a designed role. That convergence is the whole design: it is why the generator
contains *no colour-conversion code at all*, and why colours nested three levels inside a `BoxDecoration`'s
`boxShadow` list are handled by the same rule that handles a `ColoredBox`'s `color`.

Hoisting also serves ADR-13's stated purpose: a DTCG export, a Figma sync and every ui-realm kit now see
*every* colour the application uses, not only the ones that happened to sit in a `ThemeData`.

## 2. Architecture changes

| Layer | Change |
| --- | --- |
| **Schema** | **None.** |
| **Compiler (N1–N11)** | **None.** |
| **Analyzer** | `ExpressionExtractor._colour` (recognition + hoisting + role reads); `TokenExtractor.hoistColour`. ~120 lines. |
| **Catalog** | None. Colour is identified by resolved type, which is not framework metadata. |
| **Runtime kit** | `ColorToken`; `BorderSide`/`Border`/`Offset`/`BoxShadow`/`LinearGradient` value types; `shadowStyle`; `decorationStyle` extended to gradients, shadows and borders; `Material`, `Ink`. |
| **Generator** | Six mappings (`ColoredBox`, `DecoratedBox`, `Material`, `Ink`, `Container.color`/`.decoration`); `colorProps` capability; `BRG3014`. **No lowering code** — token names pass through. |

The kit's colour props were renamed `colorRole` → `color`, typed `ColorToken`. That is a *simplification*: it
removed the Flutter→kit prop rename, so `BoxDecoration(color:)` in Dart is `BoxDecoration({ color: … })` in
the output, and the generator's existing kit-provided lowering carries the whole decoration tree with no
per-type table.

## 3. Generated artifacts

Real emitted output from the build proof — analyzer-produced UIR only, typechecked against the unmocked kit:

```tsx
<ColoredBox color={'colorFF2196F3'} child={<Text>{'literal colour'}</Text>} />
<ColoredBox color={'colorFFFFFFFF'} child={<Text>{'named colour'}</Text>} />
<DecoratedBox decoration={new BoxDecoration({
  border: Border.all({ color: 'color1F000000', width: 2 }),
  borderRadius: BorderRadius.circular(8),
  boxShadow: [new BoxShadow({ blurRadius: 4, color: 'color1F000000', offset: new Offset(0, 2) })],
  color: 'colorFFFFFFFF' })} child={…} />
<DecoratedBox decoration={new BoxDecoration({
  gradient: new LinearGradient({ colors: ['colorFFFFFFFF', 'color1F000000'] })})} child={…} />
<Material borderRadius={BorderRadius.circular(4)} color={'colorFFFFFFFF'} elevation={3} child={…} />
<Container alignment={Alignment.center} decoration={new BoxDecoration({
  borderRadius: BorderRadius.circular(12), color: 'colorFFFFFFFF' })} padding={EdgeInsets.all(8)} width={200} … />
```

and the tokens they resolve against, in `src/theme/tokens.ts`:

```
seed = #FF6750A4   colorFF2196F3 = #FF2196F3   colorFFFFFFFF = #FFFFFFFF   color1F000000 = #1F000000
```

Note `Color(0xFF2196F3)` and `Color.fromARGB(255, 33, 150, 243)` collapsed to **one** token — the same colour
written two ways is one entry in the palette.

## 4. Corpus coverage delta

| | M4-D | M4-E |
| --- | --- | --- |
| Supported instantiations | 856 (44.3%) | **879 (45.5%)** |
| Classified unsupported | 246 (12.7%) | **227 (11.7%)** |
| Unknown (mostly the apps' own widgets) | 831 (43.0%) | 827 (42.8%) |

**The instantiation delta understates the change.** `Container` (89 uses) was already counted as "supported"
in M4-D while silently forwarding neither `color` nor `decoration` — every one of those 89 rendered without
its fill. The same was true of `Card`, `Material` and `Ink`. So the honest reading is: +23 widgets that could
not render at all, plus a *correctness* fix across the single most-used container in the corpus.

Colour-property coverage, which M4-D could not measure at all: **every constant colour form and every
`colorScheme` role read now resolves.** The only unsupported case is a colour computed at run time.

## 5. Diagnostics

| Code | Severity | Meaning |
| --- | --- | --- |
| `BRG3014` `UnresolvableColor` | error | A colour with no build-time value — a ternary, or a value from a store. Names the missing capability (a colour knowable at build time), the owning subsystem (the analyzer), and what to do instead (lift the choice to a theme role, or override). |

No diagnostic was weakened. `ColoredBox`/`DecoratedBox` were *removed* from the `MISSING_CAPABILITIES` table
because they are now genuinely supported, which is the only honest way to remove an entry.

## 6. Determinism proof

```
2565eb045eceb5884a459bc50aa355a85dfc52476b803c22522c36891529af22   (3 independent normalize runs)
2565eb045eceb5884a459bc50aa355a85dfc52476b803c22522c36891529af22
2565eb045eceb5884a459bc50aa355a85dfc52476b803c22522c36891529af22
```

Preserved by construction: a token's name is derived from its *value*, so discovery order cannot affect it;
`TokenExtractor.flush` already sorted its keys; hoisting adds no clock, filesystem or random source. The
analyzer's golden is pinned at `d7ee7f1f…`.

## 7. Incremental proof

**Fixed point** — `normalize(normalize(x)) == normalize(x)`:

```
2565eb045eceb5884a459bc50aa355a85dfc52476b803c22522c36891529af22   n1.ndjson
2565eb045eceb5884a459bc50aa355a85dfc52476b803c22522c36891529af22   nn.ndjson
```

10 analyzer nodes → 56 normalized (the 46 roles N10 derives). **Incremental ≡ clean** holds via
`generate.test.ts` and the analyzer's incremental suites, all green.

## 8. Benchmark comparison

| Measure | M4-D | M4-E | Δ |
| --- | --- | --- | --- |
| Analyzer (build-proof extraction) | 2.00–2.11 s | 2.03–2.08 s | none measurable |
| `bridge normalize` | 0.08–0.09 s | 0.08 s | none |
| Runtime kit bundle | 69,549 B | 73,320 B | +5.4% |
| Runtime tests | 306 | 306 | — |
| Generator tests | 86 | 93 | +7 |

Colour hoisting costs one constant evaluation per `Color`-typed expression, on a path the analyzer already
walks — below measurement noise. **No optimization was done, because no bottleneck was measured.**

## 9. Remaining blockers before M4 completion

1. **The animation engine (36 uses, runtime).** Unchanged and still the largest single gap.
2. **`Matrix4` / `Transform` (33 uses, runtime).** Still the best effort-to-coverage ratio available: CSS
   `transform` takes the same matrix.
3. **The constraint model's measuring half (31 uses, runtime).** `LayoutBuilder`, `FittedBox`. Needs a
   decision about SSR-time layout before it can be built.
4. **The sliver protocol (28 uses, ADR).**
5. **The gesture model (21 uses, runtime).** Now the *only* thing standing between `Ink`/`InkWell`/
   `ListTile.onTap` and being complete — their colours, shapes and state-layer opacities are all in place.
6. **Run-time colours (`BRG3014`).** The residue of this milestone: a colour chosen by a ternary or read from
   a store. Genuinely needs a value knowable at build time, so the honest fix is upstream in the application
   rather than in the compiler.

### Two smaller things this milestone surfaced

- **A hoisted seed.** `ColorScheme.fromSeed(seedColor: Color(0xFF6750A4))` hoists its argument, so a themed
  app carries both `seed` and `colorFF6750A4` with the same value. Harmless, deterministic, and slightly
  redundant; suppressing it would need the expression extractor to know it is inside a theme declaration,
  which is context it does not have.
- **`Border` is `Border.all` only.** A non-uniform `Border(top:, left:)` needs four longhands per property
  and a different merge order; it is refused rather than painted uniformly.

**Recommendation for M5:** take the animation engine, `Matrix4`, and the gesture model together (90 corpus
uses). All three are runtime-only, need no ADR, and the gesture model in particular unlocks Material
components whose entire visual specification is already in the catalog.
