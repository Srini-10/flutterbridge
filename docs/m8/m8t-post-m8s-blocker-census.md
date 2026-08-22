# M8-T — Post-M8-S real-application blocker census and next-capability decision

**Date:** 2026-08-22. **Baseline:** `396571d` (== `origin/main`, clean tree except the pre-existing,
unrelated `fixtures/apps/hello_bridge/analysis_options.yaml` drift — confirmed present, left untouched).
**Type:** measurement + decision. **Outcome: docs-only.** Every candidate capable of closing the largest
diagnostic categories (`Theme.of`, module-emission, imperative overlay/navigation lowering) requires new
schema/ADR-level architecture on fresh, rigorous investigation — none passes the implementation gate.
**Selected M8-U target: module-emission architecture, scoped to exactly one real, proven-clean shape**
(a same-shape-as-`formatUptime` top-level `logic.FunctionDecl`) — the smallest, most-already-scoped,
lowest-risk candidate among the large ones, with an exact ownership/module-path/ordering/refusal-boundary
pre-scoping below so M8-U can implement without re-deriving architecture from scratch.

## 1. Fresh baseline — PROVEN

```
git status --short   → only fixtures/apps/hello_bridge/analysis_options.yaml (pre-existing, unrelated, untouched)
git rev-parse HEAD          → 396571dfdc048080230c21a289a10dfb29ca763b
git rev-parse origin/main   → 396571dfdc048080230c21a289a10dfb29ca763b
```
Fresh test baseline (not cited from M8-S): `pnpm --filter @bridge/gen-react test` → 263/263 (23 files).
`pnpm --filter @bridge/compiler test` → 153/153 (10 files). `dart test` (`bridge_analyzer`) → 317/317.
All three re-run fresh, this milestone, before any investigation began.

## 2. Fresh Continuum pipeline census — PROVEN

Read-only, via a temporary `bridge.json` per app (`source` pointing at the real Continuum path, `work`/
`out` redirected outside both repos entirely — no writes into Continuum's own tree at any point;
`git status --short` in Continuum confirmed empty before, during, and after every measurement).

| Stage | mac | droid |
|---|---|---|
| analyze | 0 errors / 95 warnings | 0 errors / 124 warnings |
| normalize (info/error diagnostics) | BRG2101×7, BRG2103×5, BRG2114×5, BRG2115×1, BRG2303×2, BRG2301×1 | BRG2101×9, BRG2103×5, BRG2114×6, BRG2115×1, BRG2303×2, BRG2301×2 |
| generate (errors) | BRG3001×2, BRG3002×7, BRG3004×8, BRG3005×1, BRG3006×15, BRG3008×1, BRG3013×10 | BRG3001×2, BRG3002×7, BRG3004×12, BRG3005×1, BRG3006×15, BRG3008×1, BRG3013×10 |
| generate (warnings) | BRG3001×12, BRG3002×5 | BRG3001×13, BRG3002×6 |
| files emitted | 0 | 0 |

Identical to M8-S's own last recorded numbers — **nothing drifted** since `396571d`. This is the **current
real pipeline blocker population** (§3 below separates it from the larger *latent* population found at
analyze-stage that generation has not yet reached).

## 3. Current blockers vs. latent blockers — PROVEN

Analyze-stage `BRG1302` ("no UIR representation") warnings, by construct, mac (121 total for droid, 93 for
mac; top entries): `throw expression`×29, "This collection element has no UIR representation"×14,
`adjacent string literals`×11, `is-check`×11, `cascade`×7, `collection-if`×5, `collection-for`×3,
`spread`×3, `rethrow`×2, `switch expression`×2, six distinct map/array index-assignment writes×1 each.

Cross-referencing against the generate-stage `BRG3004` set (§4.4): only `switch expression`, `cascade`,
`spread`, and `adjacent string literals` currently appear as *reached, blocking* errors — every other
category (`throw expression`×29 chief among them) is **latent**: real, extracted-but-opaque, and not yet
on any path the render tree or a reachable action currently walks. This milestone does **not** rank the
latent population against the proven-reachable one — ranking a hypothetical 29-site category above a
proven, currently-blocking one would repeat the exact "frequency without reachability proof" mistake this
milestone exists to avoid (matching M8-O/M8-Q's own established discipline).

## 4. Diagnostic census — root-cause breakdown

### 4.1 BRG3006 ("not declared in this program") — 15 sites, both apps, PROVEN

| Construct | Count | Target exists? | Root cause |
|---|---|---|---|
| `Theme.of(context).textTheme.*` | 5 diagnostic lines (shared nodeId `070ef28714bcf1f6`, content-addressed — see §7) | Node is a real `logic.Call`/`PropertyAccess` chain, extracted correctly; the `Theme.of` `logic.Ref` itself carries no `target` | Generator: no recognition path for a class-static-method reference (`Theme.of`) at all |
| `getApplicationDocumentsDirectory` | 1 | untargeted (third-party plugin function, `path_provider`) | SDK/third-party function, no target ever possible without a plugin-facts mechanism |
| `join` | 1 | untargeted (`package:path`) | same as above |
| `_logBuffer` | 2 | targeted (a real component field) | reached only via a lifecycle method (`initState`/`dispose`) OR gated by the same-shaped route-boundary/module blockers already catalogued — not independently investigated further this milestone (narrow, 2 sites, already-known-adjacent to M8-Q's `sig.Effect` finding) |
| `_onboardingSlides` | 1 | targeted (a real component getter) | same shape as `_logBuffer` |
| `ContinuumFeature.values` | 1 | untargeted (an SDK enum reflection member, `.values`) | enum reflection member, no target mechanism exists |
| `_isLast` | 2 | targeted (a real getter, `packages/ui-kit/onboarding_page.dart`) | component-scoped getter reachability, not independently investigated further |
| `_slides` | 1 | targeted (same file) | same |
| `double.infinity` | 1 | untargeted (SDK constant) | SDK constant, no target mechanism exists |

**Targeted-vs-untargeted breakdown:** 9 of 15 have a real, resolved target (`Theme.of`×5 as one shared
content-id, `_logBuffer`×2, `_onboardingSlides`×1, `_isLast`×2, `_slides`×1 — 5 distinct targeted
identities); 6 of 15 are genuinely untargeted (SDK/third-party: `getApplicationDocumentsDirectory`,
`join`, `ContinuumFeature.values`, `double.infinity`, plus `Theme.of` itself, whose OWN callee `logic.Ref`
has no target even though the surrounding expression is a real, well-formed call). **Confirms M8-L/M8-P's
own finding that BRG3006 is structurally overloaded — this milestone finds the SAME overload persists**:
roughly a third of the remaining population (SDK/third-party references) can never be "identity-fixed" at
all; they need a plugin-facts/override mechanism, a materially different kind of work than declaration
identity.

### 4.2 BRG3013 ("unsupported capability") — 10 sites, both apps, identical set — PROVEN

| Construct | Count | Category | Owner |
|---|---|---|---|
| `_log` (`logic.FieldDecl`) | 2 (1 declaration, duplicate emission — §8.3) | module-emission | generator |
| `formatUptime` (`logic.FunctionDecl`) | 1 | module-emission | generator |
| `describeTransferFailure` (`logic.FunctionDecl`) | 1 | module-emission (but independently blocked by switch-expression opacity, §8.4) | generator + extraction |
| `formatBytes` (`logic.FunctionDecl`) | 2 (1 declaration, duplicate emission) | module-emission | generator |
| `Navigator.of` | 1 | imperative navigation overlay | schema/ADR (existing `MISSING_CAPABILITIES` entry, `owner: 'schema'`) |
| `ScaffoldMessenger.of` | 1 | overlay messenger | schema/ADR (existing entry, `owner: 'adr'`) |
| `showDialog` | 1 | overlay route | schema/ADR (existing entry, `owner: 'schema'`) |
| the `SettingsPage` push (`diagnostics`/`platformSection`/named-object args) | 1 | route-boundary object decomposition (BRG2301-adjacent) | already known, out of scope since M8-I |

**All 10 are correctly classified** — this is the honest, already-precedented "unsupported capability"
refusal M8-L/M8-P built, not a misattribution. None of the 10 is "existing architecture the generator
merely lacks a lowering branch for" in the cheap sense the task's §11 asks to check for — `Navigator.of`/
`ScaffoldMessenger.of`/`showDialog` are explicitly marked `owner: 'schema'`/`'adr'` in the generator's own
`unsupported.ts` table, meaning their own implementation is already known to need new UIR vocabulary, not
a small generator patch.

### 4.3 BRG3004 ("no UIR representation, reached generator as opaque") — 8 (mac) / 12 (droid) — PROVEN

| Reason | mac | droid | Known/new |
|---|---|---|---|
| `switch expression` | 1 | 1 | known (M8-L §9) |
| `widget returned by a call` | 1 | 1 | **new**, not previously catalogued |
| `spread` | 3 | 3 | **new** — highest-frequency newly-discovered category |
| `build body with statements` | 1 | 1 | residual of M8-B's own scope (M8-B closed the if-chain-then-return shape; this is a different, unaddressed shape within the same reason string — confirmed via M8-B's own doc table, not a regression) |
| `builder body with statements` | 1 | 1 | **new**, adjacent to the above (a builder callback, not a build method) |
| `for-element` | 1 | 1 | **new** |
| `adjacent string literals` | 0 | 2 | known (M8-K), now confirmed reachable/blocking in droid |
| `cascade` | 0 | 1 (reported twice, same node) | **new** |

Every BRG3004 site is **error severity** — all 8/12 are hard blockers, not warnings, despite the smaller
raw count than BRG3006/BRG3001.

### 4.4 BRG3001/BRG3002 — PROVEN

BRG3001 (widget catalog): 2 error (`DropTarget` — third-party plugin widget, no mapping possible without
plugin facts; `SwitchListTile` — a real Material widget with **zero existing catalog or runtime
support**, confirmed by direct grep of both `packages/adapters/widgets-material/src/generated/
material_catalog.ts` and `packages/runtimes/react/src/`) + 12/13 warning (dropped, non-blocking props:
`ListTile.dense`×7, `Icon.color`×2, `Card.color`, `ListTile.onTap`, `LinearProgressIndicator.color`).

BRG3002: 7 error (constructing an instance of a class the generator does not emit class declarations for
— `DateTime`, `File`, `SettingsPage`, each via `new X(...)`; 2 named-argument-lowering sites, one of which
is the same `SettingsPage` push already catalogued under BRG3013/BRG2301) + 5/6 warning (missing list
keys, non-blocking).

## 5. Reconfirm previously-known boundaries (A–P) — PROVEN

| Item | Status |
|---|---|
| A. M8-R/N11 route-boundary closure | **Unchanged.** `_forget`'s `BRG2303` refusal re-confirmed, byte-identical message, naming `_announceRevocation` (§9). |
| B. `sig.Effect` no lowering | Unchanged — `_logBuffer`'s own `initState`/`dispose` calls remain silent (no diagnostic of their own), consistent with M8-Q's finding. |
| C. module-emission architecture absent | Confirmed absent (§8). |
| D. `FunctionDecl` full lowering absent | Confirmed absent — 3 real sites, all `BRG3013` (§4.2). |
| E. `FieldDecl` full lowering absent | Confirmed absent — 1 real site (`_log`), `BRG3013`. |
| F. parameter/N5/N11 identity interaction | Untouched, unchanged since M8-N; no new evidence gathered this milestone (out of this milestone's own investigation scope). |
| G. adjacent-string-literal extraction | Confirmed still open, now confirmed **reachable/blocking** in droid (§4.3) — previously only latent. |
| H. switch-expression extraction | Confirmed still open, blocking `describeTransferFailure` doubly (§4.3, §8.4). |
| I. BRG2301 route-boundary object cases | Unchanged — 1 (mac) / 2 (droid), same sites (`diagnostics`, `platformSection`). |
| J. BRG2303 non-promotable cases | Unchanged — 2 sites both apps (`onForget`/`_forget`, `onExportLogs`), `_forget`'s own message identical to M8-R's own recorded text. |
| K. `Theme.of` behavior | Investigated in full (§7). |
| L. third-party/platform/plugin gaps | Confirmed present and real: `getApplicationDocumentsDirectory`, `join`, `DropTarget`, `Logger(...)` (via `_log`'s own `logic.New`). |
| M. catalog/widget gaps | Confirmed: `SwitchListTile` (real Material widget, zero support), `DropTarget` (third-party, needs plugin facts). |
| N. local-variable identity | **CLOSED, confirmed** — fresh 263/263 gen-react suite includes `local_variables_build.test.ts` unmodified, passing. |
| O. catch-clause identity | **CLOSED, confirmed** — fresh suite includes `catch_clause_build.test.ts`/`catch_clause_reference.test.ts` unmodified, passing; real-Continuum `e` sites remain absent from BRG3006 (§2). |
| P. transitive action reachability | **CLOSED, confirmed** — fresh suite includes `transitive_action_reference.test.ts`/`transitive_actions_build.test.ts` unmodified, passing. |

**No regression found in N/O/P or anywhere else** — nothing here outranks new-capability work.

## 6. Normalize blockers — PROVEN

| Code | Count (mac/droid) | Classification |
|---|---|---|
| BRG2301 | 1/2 | Correct refusal — `diagnostics`/`platformSection` are live objects at a route boundary (ADR-11a), unchanged since first observed (M8-I). |
| BRG2303 | 2/2 | Correct refusal — `onForget` (M8-R's own dependency-closure refusal, unchanged, §9), `onExportLogs` (pre-existing `writes.length===0` refusal, predates M8-R). |
| BRG2305 | 0/0 | Not observed in this corpus — no forwarded-parameter shape currently reached. |
| BRG2306 | 0/0 | Not observed — no multi-caller consensus conflict currently reached. |

No N11 change was made or considered this milestone, per instruction.

## 7. `Theme.of` investigation — PROVEN (delegated to a dedicated read-only research pass, independently
spot-verified against the actual source)

**1. Site count:** 19 real source occurrences (not 5 — the earlier "5" was diagnostic-line count against a
single, content-addressed, shared node id, not distinct source sites): mac 6, droid 4, `packages/ui-kit`
9.

**2. Shape:** not uniform — 7 sites read `Theme.of(context).X.Y` inline; 12 sites (the dominant pattern in
`ui-kit`) assign `final theme = Theme.of(context);` once and read `theme.X.Y` repeatedly; one site
(`pairing_page.dart:711-714`) chains a further method (`.withValues(alpha:)`) on top of a role read.

**3. Members read:** `.textTheme.{headlineSmall, titleMedium, titleLarge, titleSmall, bodySmall,
bodyMedium, labelSmall, labelMedium, displaySmall}`; `.colorScheme.{primary, primaryContainer,
secondaryContainer, error, outline, outlineVariant}`; one ThemeData-level field, `.dividerColor`. Zero
`.brightness` reads anywhere.

**4. Raw UIR shape:** a real, well-formed `logic.PropertyAccess` chain wrapping a `logic.Call` to a
`logic.Ref{name:'Theme.of', type:{name:'ThemeData Function(BuildContext)'}}` — **no `target`**. Verified
directly against `.bridge/uir.ndjson`. **Critically, `.colorScheme.<role>` reads never reach this shape at
all** — they are already collapsed, at extraction time, into `logic.Lit{value:'<role>'}` by an existing
structural mechanism (§7.8) — the `Theme.of` `logic.Ref` literally does not exist in the document for
those 6 role-reads; it exists only for the 9 `.textTheme.*` reads and the 1 `.dividerColor` read (10
total real occurrences of the failing shape, confirmed by direct grep of the raw document for
`"Theme.of"`).

**5. Analyzer recognition:** none, by resolved identity. `dart/bridge_analyzer/lib/src/session/extract/
expression_extractor.dart:757-773` (`_roleOf`) recognizes `.colorScheme.<role>` **structurally** — its own
doc comment states plainly "neither `Theme` nor `of` is named anywhere in this function"; it matches any
receiver whose own property/identifier name is literally the string `'colorScheme'`, regardless of what
produced it. Everything else (`.textTheme.*`, `.dividerColor`) falls through the analyzer's own
`_topLevelTarget` (line 975), which by explicit design (its own doc comment) never resolves a class static
method — so no `target`, ever, for any spelling.

**6. Normalization:** no change — byte-identical node ids before and after N1–N11.

**7. Failure stage: the generator**, confirmed directly (`packages/generators/react/src/internal/emit/
expression.ts:342-475`) — the node is correctly extracted and correctly survives normalization; the
`logic.Ref` case checks `target` (absent) → `paramInScope` (no) → `isKitProvided` (the callee's function
type has no `library`, so this never matches) → `missingCapabilityOf` (no `'Theme.of'` entry exists) →
falls to the generic `BRG3006` branch.

**8/9. Relationship to M7-K / existing token architecture:** `.colorScheme.<role>` reads are **already**
fully absorbed by the existing architecture (ADR-13/M7-K), confirmed: N10 already derives the complete
Material role set for **both** light and dark brightness. Zero `Theme(data:…, child:…)` nesting exists
anywhere in Continuum (grepped, zero hits) — so every real `Theme.of(context)` call in this corpus
resolves to the one static, app-root theme; nothing here contradicts the token architecture's compile-time
model with a genuinely dynamic runtime lookup. **However, `.textTheme.*` (9 of the 10 real failing sites)
has no existing token-architecture equivalent at all** — N10 tokenizes colors only, never typography
(font size/weight/family/letter-spacing, several CSS properties per Material "text style" role, unlike one
value per color role). `.dividerColor` (1 site) is a bare ThemeData-level field, not a `colorScheme.<role>`
shape, so it also falls outside `_roleOf`'s existing structural match, and mapping it onto an existing
derived color role (e.g. `outlineVariant`) is a genuine, undecided design judgment call, not a mechanical
lookup.

**10. Generator special-casing:** none exists for `Theme.of` (`grep -rn "Theme.of\|ThemeData\|themeOf"
packages/generators/react/src/` → zero hits). By contrast, `Navigator.of`/`ScaffoldMessenger.of` **are**
already special-cased, in the generator's `unsupported.ts` `MISSING_CAPABILITIES` table — but purely for
DIAGNOSTIC CLASSIFICATION (BRG3006→BRG3013), not for lowering, and every entry there is explicitly marked
`owner: 'schema'` or `owner: 'adr'`.

**Collision risk:** zero — no user-defined class in Continuum declares its own static `of(BuildContext…)`
method. Moot regardless of collision, since the analyzer's own scope exclusion (§7.5) means a class static
method never gets a `target` irrespective of name.

**Verdict:** `Theme.of` is **not one problem**. The `.colorScheme.*` half is already solved by existing
architecture. The `.textTheme.*`/`.dividerColor` half (10 real, currently-blocking sites — genuinely
*more* than the 5 originally estimated, and not the same population) needs new typography-token
architecture — a real schema/ADR-level decision (how does a Material "text style" role become a token: one
CSS property or several? light/dark-sensitive the same way color roles are?), not a bounded reuse of what
exists.

## 8. Module-emission investigation — PROVEN (delegated to a dedicated read-only research pass)

**Real reachable declarations: 4, not "5 sites".** `_log` (`logic.FieldDecl`, same-package), `formatUptime`
(`logic.FunctionDecl`, `continuum_ui_kit`, cross-package), `describeTransferFailure` (`logic.FunctionDecl`,
`continuum_ui_kit`, cross-package), `formatBytes` (`logic.FunctionDecl`, `continuum_ui_kit`, cross-package).
6 diagnostic *emissions* per app (`_log`×2, `formatBytes`×2 — confirmed to be the identical normalized
node id reported twice, a minor generator-side duplicate-diagnostic artifact, not two distinct reference
sites; `formatUptime`×1, `describeTransferFailure`×1).

**Own dependency closure:** none of the 4 declarations references another top-level `FieldDecl`/
`FunctionDecl` (checked directly, zero hits). **But 3 of 4 have an independent, unrelated blocker
module-emission would not fix:** `_log`'s initializer is `Logger(...)`, hitting the pre-existing
third-party-class `logic.New` refusal (BRG3002); `describeTransferFailure`'s body is a Dart switch
*expression*, extracted as `logic.OpaqueExpr` (an extraction-side gap, §4.3); `formatBytes`'s own body
locals need scope-population machinery (`localBindingsIn`-equivalent) that a NEW module-emission code path
would have to remember to wire in, since no such path exists yet to have it. **Only `formatUptime` has no
independent blocker** — module-emission, if built today, would produce exactly one additional working
generated function from real Continuum evidence.

**Async/mutation:** none of the 4 is async; none is a mutable top-level `var` (all `isFinal:true`). A
mutable top-level field exists in the raw census (`_cached`, `noise.dart`) but has zero reachable
references — not a real, currently-relevant site.

**Cross-package:** 3 of 4 (`formatUptime`, `describeTransferFailure`, `formatBytes`) are cross-package
(declared in `continuum_ui_kit`, referenced from the app). Only `_log` is same-package.

**Generator architecture:** confirmed, directly, that no standalone-module emission category exists today
— `packages/generators/react/src/internal/emit/` has component/store/app-root/routes/theme/assets/module
emitters only; a real fixture build's own file list (`app/layout.tsx`, `app/page.tsx`,
`app/providers.tsx`, `next.config.mjs`, `package.json`, `src/assets/manifest.ts`, `src/components/*.tsx`,
`src/routes/routes.ts`, `src/theme/tokens.ts`, `tsconfig.json`) confirms this — no bare declarations file
is ever emitted. `module.ts`'s own `ModuleBuilder`, however, is already a generic, reusable file-writer
(imports, symbol collision, deterministic ordering) — a new declarations-module emitter would **reuse**
this, not invent a new one.

**Ordering:** proven unneeded by real evidence — zero cross-references exist among the 4 real
declarations. M8-P's own topological-sort concern was demonstrated only in a synthetic fixture, never in
real Continuum evidence, confirmed again this milestone.

**Verdict (§9 of the investigation, verbatim classification):** module-emission is **not one coherent,
immediately-valuable capability** for the current corpus — 3 of 4 real sites gain nothing from it (they
remain blocked by unrelated defects); the architecture it would require (a new per-file declarations
module, an `EmitScope.fieldModules`/`functionModules` map, cross-package import wiring reusing the
*existing* package-URI resolution) is real but **narrow**, and its entire currently-provable payoff is one
function (`formatUptime`). Topological ordering and cycle handling are proven unneeded by evidence, not
merely assumed unneeded.

## 9. Module architecture boundary — DECIDED (pre-scoping for M8-U, no code written)

Per §20 of the task instructions, since module-emission is the selected M8-U target (§17) but does not
pass the M8-T implementation gate (§8's own finding: no existing ADR decides the emission model), this
section pre-scopes the architecture precisely so M8-U does not have to re-derive it:

- **Exact first declaration kind:** `logic.FunctionDecl` only, not `logic.FieldDecl` — proven by evidence
  (§8) that the only real, currently-clean site is a function (`formatUptime`); `_log` (the only real
  `FieldDecl` site) is independently blocked and would validate nothing.
- **Exact reachable subset:** a top-level function whose body (a) contains no reference to another
  top-level `FieldDecl`/`FunctionDecl` (no dependency-closure question to solve), (b) is not `async`, (c)
  contains no local variable requiring `localBindingsIn`-style scope resolution *inside this new emission
  path specifically, unless that wiring is added in the same change* (the safest, narrowest cut excludes a
  body with locals; a slightly less narrow cut includes it, provided the new emitter's own scope
  construction explicitly calls `localBindingsIn`, mirroring `component.ts`'s own `declareLocalActions`,
  not `store.ts`'s own `actionScope`, which is the one existing scope constructor that omits it — see M8-S
  §nothing, a fresh finding of this milestone).
- **Exact ownership model:** the declaration is emitted into exactly one new file, owned by the Dart file
  it was declared in (one declarations module per source file, not one per declaration and not one
  per-package aggregate) — the smallest ownership model consistent with the existing per-component,
  per-store file-per-declaration-group convention already used elsewhere in the generator.
- **Exact module path model:** reuse the *existing* cross-package/component-module path resolution already
  proven in the generator (confirmed present and reusable, §8) — no new path-resolution mechanism.
- **Exact dependency ordering:** none needed — proven unneeded by evidence (§8); do not build topological
  sort or cycle detection speculatively.
- **Exact refusal boundary:** any top-level `FieldDecl`/`FunctionDecl` outside the reachable subset above
  (has a cross-declaration dependency, is async, mutates module state, or its own body independently opaque
  for an unrelated reason) continues to refuse via the existing, correctly-classified `BRG3013`, unchanged
  — module-emission's own refusal boundary must not regress any currently-correct refusal into a silently
  wrong lowering.
- **Not yet decided, deliberately left to M8-U itself:** whether a second declaration (a real `FieldDecl`,
  once one exists in the corpus with no independent blocker) should share the same file-per-source-file
  convention or its own; this milestone found no real evidence to decide it from, and inventing an answer
  without evidence would violate this project's own "prove before implementing" discipline.

## 10. Other candidate blockers — PROVEN, newly discovered this milestone

- **`spread`** (`ui.Opaque`, 3+3=6 sites, all error-severity, blocking) — a widget/collection spread
  operator (`...items`) inside a children list. No existing UIR vocabulary for it; would need a new
  `ui.Spread`/`logic.Spread`-shaped construct — its own schema question, not investigated further this
  milestone (out of the depth budget available), flagged as the single highest-frequency **newly
  discovered** currently-blocking category.
- **`widget returned by a call`** (1+1=2 sites) — a function that returns a `Widget`, invoked inline in the
  render tree. Real, blocking, uninvestigated beyond identification.
- **`for-element`** (1+1=2 sites) — a `for` element inside a collection literal.
- **`cascade`** (0+1=1 site, reported twice for the same node) — Dart's `..` operator.
- **`SwitchListTile`** (1 site, error) — a real, standard Material widget with zero existing catalog or
  runtime support (confirmed by direct grep — no entry in `material_catalog.ts`, no component in
  `packages/runtimes/react/src/`). The smallest-*scope* candidate found this milestone (no ADR/schema
  question — purely a new catalog entry + a new runtime component, matching many already-shipped
  widgets), but also the **narrowest structural unlock** (fixing it unblocks exactly the one widget
  instance it names, nothing else in either app's own tree — confirmed no other diagnostic in either
  app's own census depends on or is nested beneath it).

None of these was investigated to the same depth as `Theme.of`/module-emission (§7, §8) — the task's own
effort budget was spent on the two candidates that were tied for highest frequency at the M8-S triage
point; these are reported as real, evidenced findings for M8-U's own future triage, not as this
milestone's own selected target.

## 11. Structural-unlock analysis — INFERRED

Using M8-C/M8-E's own dominator methodology (does removing this blocker expose more program structure, or
only itself): **no candidate found this milestone unlocks a meaningfully larger subtree.** `Theme.of`'s
`.textTheme.*` sites are leaf reads (property accesses feeding directly into a `TextStyle` prop — nothing
downstream of them is itself gated). `formatUptime`'s own callers (`describeTransferFailure`'s sibling
call sites) are themselves independently blocked by other causes, so fixing `formatUptime` alone does not
cascade into unblocking anything beyond its own one call site. `SwitchListTile` unlocks nothing beyond
itself. **This is a genuine, evidenced finding, not an assumption**: this corpus, at its current blocker
depth, does not currently exhibit the "one root cause behind many symptoms" shape M8-C/M8-E's own
methodology was built to find (unlike, for example, M8-A's own `if`-chain finding, which unlocked
generation entirely). The candidates here are closer to independent, parallel leaves.

## 12. Implementation-cost and risk analysis — INFERRED/DECIDED

| Candidate | P-class | Size | Schema? | ADR? | Silent-wrong-code risk |
|---|---|---|---|---|---|
| `Theme.of` (`.textTheme`/`.dividerColor`) | P2 (hard blocker, meaningful new architecture) | L | Yes (new typography-token concept) | Yes (undecided: 1-property vs multi-property token, `.dividerColor` mapping judgment call) | Low if done right, but only after the schema question is settled — attempting a shortcut (e.g. emitting a hardcoded CSS value per role name) would be exactly the "guessing" this project's discipline forbids |
| Module-emission (general) | P2 | L | No (additive only, confirmed) | Yes (undecided: file-per-declaration granularity, when to extend beyond one clean function) | Low — the narrowed, evidence-scoped subset (§9) has no ownership/lifetime ambiguity |
| Module-emission (narrowed to `formatUptime`-shape) | P1 (bounded architecture) | M | No | **Effectively decided by §9's own pre-scoping** — the remaining gap is implementation, not undecided design | Low, if the refusal boundary (§9) is enforced precisely |
| `Navigator.of`/`ScaffoldMessenger.of`/`showDialog` | P2 | L | Yes (`owner: 'schema'`/`'adr'`, already marked in the generator's own table) | Yes | Not evaluated further — already correctly, honestly refused (BRG3013), no urgency to force it |
| `spread`/`for-element`/`widget-returned-by-call`/`cascade` | P3 (narrow unsupported capability, each) | M each (uninvestigated depth) | Likely yes, each | Likely yes, each | Unknown — not investigated to this depth |
| `SwitchListTile` | P3 | S–M | No | No | Low — well-precedented (one more widget in an existing catalog+runtime pattern) |

## 13. Silent wrong-code audit — PROVEN (none found)

Every newly reachable path this milestone inspected (the `Theme.of` chain, the module-emission
declarations, the BRG3004 opaque reasons) was inspected for: wrong schema field names, dropped target
identity, silent fallback values, missing declarations, invalid hook placement, duplicated evaluation,
incorrect async handling. **One minor, non-wrong-code artifact was found and is worth naming honestly**:
`_log`'s and `formatBytes`'s own `BRG3013` diagnostics are each emitted **twice** for the identical
normalized node id (§8) — a diagnostic-deduplication gap in the generator's own reporting, not a
correctness defect (nothing is silently miscompiled; the same true fact is simply stated twice). Not fixed
this milestone (out of scope — a docs-only milestone does not touch production code; flagged for M8-U or a
future, separately-scoped cleanup). No P0 finding.

## 14. Decision matrix

| Candidate | Real sites | Apps | Hard-blocking? | Structural unlock | Existing-arch reuse | Schema? | ADR? | Size | Risk | Priority |
|---|---:|---|---|---|---|---|---|---|---|---|
| `Theme.of` (`.textTheme`/`.dividerColor`) | 10 | both | yes | none found | partial (color half only) | yes | yes | L | med (undecided mapping) | 3 |
| Module-emission (general) | 4 declarations / 6 emissions | both | yes | none found | mostly (reuses `ModuleBuilder`, existing path resolution) | no | yes (narrow) | L→M when scoped | low | **1** |
| Overlay/navigation trio | 3 | both | already honestly refused | none found | no | yes | yes | L | not evaluated | 4 |
| `spread`/`for-element`/etc. | 6/2/2/1 | both | yes | none found | no | yes (each) | yes (each) | M (uninvestigated) | unknown | 5 |
| `SwitchListTile` | 1 | both | yes | none | yes (catalog pattern) | no | no | S–M | low | 2 |

## 15. Selected M8-U target — DECIDED

**Module-emission architecture, narrowed to a single, proven-clean shape: a top-level `logic.FunctionDecl`
with no cross-declaration dependency, not async, matching `formatUptime`'s own real shape.**

**Why it outranks `Theme.of`:** `Theme.of`'s own real failing population (10 sites, larger than the
original 5-site estimate) requires an undecided, judgment-laden schema extension (a new typography-token
concept, with real open design questions — one CSS property or several per role, how `.dividerColor` maps)
before ANY implementation could proceed safely; module-emission's own remaining gap, after this
milestone's own pre-scoping (§9), is implementation against an already-narrowed, evidence-bounded
question, with no comparable open design judgment call.

**Why it outranks the overlay/navigation trio:** that trio is already correctly, honestly refused
(BRG3013) — there is no misattribution to fix, and its own required architecture (per the generator's own
`owner: 'schema'`/`'adr'` markers) has received zero scoping investigation this milestone, unlike
module-emission, which now has two rounds of real-evidence investigation (M8-P, and this milestone) behind
it.

**Why it outranks the newly discovered smaller blockers:** `spread`/`for-element`/`widget-returned-by-call`/
`cascade` are real and currently blocking, but each is its own, entirely uninvestigated schema question —
recommending one of them now would be exactly the "guess without evidence" this project's discipline
forbids. `SwitchListTile` is smaller and lower-risk, but its structural unlock is the narrowest of every
candidate measured (§11) — fixing it improves nothing beyond itself.

**Tie-break not needed** — module-emission (narrowed) is not tied with any other candidate on the
decision matrix; it uniquely combines "real, proven, currently-blocking," "already twice-scoped by direct
evidence," "no undecided schema," and "narrower open-ADR-question than every other L-sized candidate."

## 16. Implementation gate — FAIL (docs-only)

1. Root cause proven — **yes** (§8).
2. One coherent capability — **yes, once narrowed to §9's own scope**.
3. No unresolved ownership/lifetime issue — **yes** (§9 decides it).
4. No new runtime subsystem — **yes**.
5. No new module system — **yes** (reuses the existing `ModuleBuilder`).
6. No undecided schema change — **yes**.
7. **No undecided ADR — FAILS.** No existing ADR decides "how does the generator emit a standalone,
   non-component, non-store TypeScript module" — even the narrowed scope in §9 is this milestone's own
   inference, not a ratified architecture decision. Per this project's own hard rule (CLAUDE.md: "New
   abstractions... require an ADR documenting a proven contradiction in the spec"), this must be written
   and reviewed as its own decision, not folded silently into an implementation commit.
8. Recognition can be structural/identity-based — yes (moot, given condition 7's own failure).
9. Supported/refused subsets precisely definable — yes (§9's own refusal boundary).
10. Mutation-sensitive tests provable — yes, once implemented.
11. Small enough not to hide architectural decisions — **the opposite risk**: implementing it in the same
    milestone as this decision would hide the ADR-writing step this gate exists to force, exactly the
    failure mode condition 11 warns against.

**GATE: FAIL on condition 7.** Per instruction, M8-T is docs-only; §9 above is the exact M8-U
pre-scoping so the eventual ADR and implementation do not have to re-derive it from nothing.

## 17. Validation — docs-only

No production code changed. `git diff --check`: clean, empty (this document plus itself is the only
change). No `just ci`/`just determinism` re-run — nothing in the tree changed since the fresh, this-
milestone test baseline already recorded in §1. Continuum's own tree: confirmed empty `git status --short`
both before and after every measurement in this document.

## 18. Regression audit — PROVEN

M7-J/M7-K/M7-L/M7-N/M8-B/M8-D/M8-F/M8-H/M8-J/M8-N/M8-O/M8-P/M8-R/M8-S: all covered, unmodified, by the
fresh 263/263 gen-react suite and 317/317 Dart suite recorded in §1 — no unrelated browser suite was
re-run, since no production code changed this milestone (per instruction not to re-run expensive unrelated
suites without cause). M8-R's own N11 boundary re-confirmed unchanged directly against real Continuum
(§9/§6 above) — `_forget`'s `BRG2303` message is byte-identical to M8-R's own recorded text.

## 19. Exact M8-U recommendation

Write a short ADR (mirroring the `0028-amendment-*`/`0011-amendment-*` precedent style already established
this session) deciding exactly what §9 above pre-scopes: first declaration kind (`logic.FunctionDecl`
only), ownership model (one declarations module per source file), module path model (reuse existing
cross-package resolution), dependency ordering (none — proven unneeded), and refusal boundary (everything
outside the narrow shape stays `BRG3013`, unchanged). Then implement against `formatUptime` as the real,
proven validation case, with a permanent fixture (matching M8-N's/M8-S's own established convention) and
mutation-sensitive tests proving the refusal boundary holds (a function WITH a cross-declaration dependency,
or async, must still refuse). Do not attempt `_log`, `describeTransferFailure`, or general `FieldDecl`
support in the same milestone — none of the three has a currently-clean path, and attempting them would
reintroduce the exact "combining measurement and implementation hides the architecture decision" risk this
gate (§16, condition 11) exists to prevent.
