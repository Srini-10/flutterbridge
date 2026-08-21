# M8-K — Nested closure / constructor expression traversal

**Date:** 2026-08-21. **Baseline:** `444d4af` (== `origin/main`, clean tree, confirmed before any
change). **Type:** measurement only. No production code changed — the investigation disproved its own
premise before reaching an implementation decision.

## Headline finding

**There is no nested-closure traversal bug.** A real, controlled fixture — a closure with a top-level,
cross-package function call, nested two plain (non-widget) constructors deep, as a block body with a
local declaration and multiple statements, capturing its own parameter — extracts and resolves
correctly today, unmodified. The three named symptoms (`formatBytes`, `formatUptime`,
`describeTransferFailure`) fail for **two different, unrelated, already-existing reasons, neither of
them traversal**:

1. **All three fail identically at generate time, even when directly called with zero nesting at
   all.** The generator (`packages/generators/react`) has no lowering path for `logic.FunctionDecl` —
   confirmed by direct source search (zero matches, anywhere) and by a minimal fixture (`Text(greet('Ada'))`,
   one function, one call, no closure, no nesting) failing with the identical `BRG3006`.
2. **`formatBytes`'s one genuinely-absent real site** (`mac/pairing_page.dart:227`) is inside a Dart
   **adjacent string literal** (`'...' '...'`, implicit concatenation across two literals) — a
   pre-existing, already-diagnosed (`BRG1302`, "no UIR representation... preserved as an opaque
   expression") extraction gap, unrelated to closures or nesting. Removing only that one syntax shape
   from a fixture that otherwise reproduces the site exactly — cross-package function, closure,
   two-constructors-deep nesting, all left in place — makes the reference resolve correctly.

M8-K's own premise ("why do references disappear when nested in closures") does not hold: they do not
disappear when nested; they were never going to build regardless of nesting (finding 1), and the one
real absence has a different, already-understood cause (finding 2).

## 1. Baseline

```
git status --short   → (clean)
git rev-parse HEAD    → 444d4af399d06641a27fa0286778c54feb16d29c
git rev-parse origin/main → 444d4af399d06641a27fa0286778c54feb16d29c
```

Fresh `bridge_analyzer` (droid/mac): 0 errors both, 219/203 records — identical to M8-J's own reported
baseline. Temporary route-blocker removal (M8-I/M8-J's own method, redone fresh in a throwaway copy —
never committed): normalize passes, generate reached, same shape as before.

## 2. Real failing sites — traced fresh

| Reference | Declared at | Same-file uses | Cross-file use |
|---|---|---|---|
| `formatBytes` | `continuum_ui_kit.dart:15` | `:94`, `:173`×2 — all targeted | `mac/pairing_page.dart:227` — absent |
| `formatUptime` | `settings_page.dart:25` | `:232` — targeted | none in real Continuum source |
| `describeTransferFailure` | `continuum_ui_kit.dart:121` | `:170` — targeted | none in real Continuum source |

Fresh raw UIR confirms: `describeTransferFailure`'s reference at line 170 **already carries a real
target** (`171bd849b1735881`), pointing at its own real `logic.FunctionDecl` at line 119. It is not
nested in any closure or constructor at all — it sits in an ordinary widget-tree ternary,
`Text(t.failed ? describeTransferFailure(t.failureReason) : ...)`, inside a `for`-loop-built list item.
**`formatUptime` and `describeTransferFailure` have no genuinely broken site in real Continuum source at
all** — every real reference to them already resolves. Only `formatBytes`'s one cross-file call has a
genuine absence.

## 3. First lost AST node — for the one real absence

`mac/pairing_page.dart:227`, inside `_goConnected` (writes `_session`/`_peer` directly, so its body is
walked — M8-H): `ClipboardModule(bridge: ..., deviceId: 'mac', onOversizeBinary: (clip) =>
_append('•  clip is ${formatBytes(clip.payload.length)} — too large to sync; ' 'drag the file here to
send it instead'))`. The argument to `_append(...)` is two adjacent string literals. Traced directly:
`flutter analyze` and `bridge_analyzer` both report `BRG1302` at this exact expression — "A `adjacent
string literals` has no UIR representation. It is preserved as an opaque expression, with its source
text, so nothing is lost" — confirmed against a controlled fixture reproducing the identical shape
(§4). **The first lost node is the `AdjacentStrings` AST node itself** — not the closure, not the
constructor, not the call. Everything *around* it (the closure, `ClipboardModule`'s own construction,
the enclosing action) extracts fully; only the string-literal-concatenation expression becomes opaque,
and `formatBytes`'s call happens to sit inside its interpolation.

Classification (Phase 3's own A-F): **F — something else** — specifically, a pre-existing, already-
diagnosed, honestly-reported opaque-expression case (INV-4: nothing is silently dropped; the source text
survives, reported as `BRG1302`), not a traversal failure of any of the extraction functions
investigated (widget extraction, action/body extraction, constructor extraction, closure extraction,
signal/action discovery — all confirmed working correctly for this shape once the adjacent-strings
wrapper is removed).

## 4. Reduction ladder

Built `fixtures/apps/toplevel_fn_probe/` + `fixtures/packages/toplevel_fn_probe_dep/` (temporary — a
`StatefulWidget` action constructing plain, non-widget service classes with closure-typed named
arguments), pub-get'ed, `flutter analyze` clean, run through the real analyzer. Deleted after evidence
extraction; not part of the commit.

| Rung | Shape | Result |
|---|---|---:|
| A | direct function call, zero nesting (`Text(greet('Ada'))`) | resolves at extraction; **fails at generate** (`BRG3006`) — finding 1 |
| B | direct function tear-off | not separately tested — same declaration-side mechanism as A, already proven by M8-J |
| C | closure directly assigned to a local | not separately tested; subsumed by F/G below (a closure argument *is* this shape, just passed rather than bound) |
| D | closure passed to a Flutter widget callback (`onPressed`) | already proven working (M8-H, M8-J's own fixtures) |
| E | closure passed to a project-owned ordinary function | not separately tested |
| F/G/H | closure passed as a **named** argument to a project-owned, plain (non-widget) constructor | **resolves correctly** — `(payload) => _record(greet(payload...))`-shaped, single expression body |
| I | closure nested in a constructor itself assigned to a local, itself an argument to a second constructor | **resolves correctly** — two constructors deep, block closure, local declaration, multiple statements |
| J | (= I, tested together) | — |
| K/L | closure body as an expression *and* as a block (`{ ...; return ...; }`) | both **resolve correctly** |
| M | async closure | not separately tested — no evidence any real site needs it |
| N | closure with one parameter, used via property access (`payload.length`) | **resolves correctly** |
| O | closure with multiple statements + a local declaration | **resolves correctly** |
| P | closure capturing an enclosing local | not separately tested (real sites capture only `this`-scoped members, already covered) |
| Q | closure calling a cross-file function | covered by R (real fixture used a separate package, the harder case) |
| R | closure calling a cross-package function | **resolves correctly** — the exact real shape |
| S | closure calling a method/action | not separately tested; `_record`/`_append`-shaped calls already exercised as part of F-O |
| T | closure constructing a widget | not applicable to the real sites (none construct a widget inside the closure) |
| U | closure constructing a plain Dart object | subsumed by F-O (`Service`/`Outer` are exactly this) |
| V/W | closure nested inside a collection/map argument | not tested — no real site has this shape |

**The smallest failing delta found is not a nesting depth at all — it is the adjacent-string-literals
wrapper (§3), present or absent, with every other element of the real shape (cross-package call,
closure, two-constructor nesting, parameter property access) held fixed.** Removing only that wrapper
flips the reference from absent to correctly targeted.

## 5. Constructor classification

`ClipboardModule`, `Service` (fixture stand-in), `Outer` (fixture stand-in): **project-defined plain
classes** — none is a Flutter widget, controller, store, or third-party class. None extends
`StatelessWidget`/`StatefulWidget`/`ChangeNotifier`. This matters exactly as Phase 5 anticipates: the
extractor already, correctly, **inspects a closure argument to such a constructor without claiming the
constructor itself is emittable** — confirmed directly: `_construction`'s own `_arguments` call
unconditionally `extract()`s every named/positional argument (including closures) before the whole
`logic.New` node is assembled, and the resulting node's own `type`/`typeName` is preserved honestly as
"a plain object, not further modeled" — nothing about walking into the argument list claims or implies
the surrounding constructor call is itself renderable. This is compatible with, not a reversal of,
M7-M's own boundary (arbitrary project classes are not automatically constructible) — the closure's
*content* was already being walked; nothing here needed to change that boundary.

## 6. Why each closure matters (and why traversal was never actually the blocker)

For all three real symptoms, the closure's role is: **it becomes a captured callback value passed to a
plain service object**, never a route-boundary argument, never a component prop, never a `sig.Action`
body directly (though the enclosing method — `_goConnected` — is one). The pipeline needs to understand
it only insofar as any reference inside it (here, `formatBytes`) must resolve correctly if the whole
program is ever to generate. §4 already proves this need is **already met** by existing extraction —
there was no additional traversal work to justify doing here at all.

## 7. Existing closure/action machinery — already sufficient

Read in full: widget-callback closures (M8-H, M7-F/N), `sig.Action` body extraction
(`signal_extractor.dart`), the general expression dispatcher (`expression_extractor.dart`'s `extract()`,
which every closure — regardless of where it sits — passes through identically), and N5's closure-lifting
pass (relevant only to route-boundary promotion, M8-G/M8-I, not to this milestone's sites, none of which
cross a route boundary). **No parallel closure semantics were created or needed** — the one, general
`extract()` dispatcher, already used for every expression position in the grammar, is what already
walks a closure argument to a plain constructor; this was proven by evidence (§4), not asserted.

## 8. Side-effect safety

Not applicable — no code change was made. For the record, the reduction ladder's own closures included
a mutation (`setState`), a local declaration, and multiple statements (rung I/O), and extraction
produced exactly one `logic.Lambda`/body-statement tree per closure occurrence, matching source
structure directly — no duplication or re-evaluation was observed, consistent with every other
closure-extraction path already in the codebase (which this milestone found no reason to touch).

## 9. Capture analysis

Tested directly (§4, rung N): a closure parameter, referenced via property access
(`payload.length`), inside a call to a cross-package top-level function, itself the argument to a
`_record` call inside the closure body — every piece (parameter, property access, cross-package target,
enclosing method call) resolved correctly and independently verified in the raw UIR. No capture shape
in any real site required anything beyond what already works.

## 10. Function-prop typing relationship

Not reached — finding 1 (the generator has no `logic.FunctionDecl` lowering at all) is upstream of and
unrelated to M8-F's own found-but-unfixed "function-typed props generate as `unknown`" gap.  That
defect concerns a **parameter's declared type** in a generated props interface; this one concerns
whether a **referenced top-level function's own declaration** can be emitted as a value at all. Even if
M8-F's typing gap were fixed, `greet`/`formatBytes`/`formatUptime`/`describeTransferFailure` would still
fail identically, because there would still be nothing to emit for the `logic.FunctionDecl` the
reference points to. The two remain correctly separate findings.

## 11. Diagnostic ownership — misattributed, not merely downstream

Traced to `packages/generators/react/src/internal/emit/expression.ts`'s reference-lowering fallback.
Its own comment states the exact shape of this milestone's finding, unprompted: *"the `Ref` names
something outside the program — `notifyListeners()`, **a top-level Dart function**, a package API…
`Navigator.pushNamed` is the case that forced this: reporting 'not declared in this program' blamed the
program for a gap the compiler owns."* A `missingCapabilityOf(name, undefined)` check already exists,
consulted **before** the generic fallback, and already gives `Navigator.push`/`Navigator.pushNamed`/etc.
the honest `UnsupportedCapability` diagnostic instead. It is keyed by an enumerable table of known
framework API names (`MISSING_CAPABILITIES`), not by a structural check on the target node's kind — so
`formatBytes` (an arbitrary, project-defined name, not a fixed framework API) falls through to the
generic `UnresolvedReference`: *"`formatBytes` is not declared in this program"* — **factually false**
for this case. A real `logic.FunctionDecl` declaration, with a real id, exists; the generator's own
lookup for it (whatever that would be) is simply unbuilt. The precise, minimal, honest fix the
generator's own precedent already points at is **structural, not another table entry**: recognize when
a `logic.Ref`'s `target` resolves to a `logic.FunctionDecl` and report `UnsupportedCapability`
("top-level function lowering, which is not built yet") instead of the generic message — never by
matching the name `formatBytes` specifically, which would not generalize to any other project's own
top-level function.

**Not implemented here.** This is a genuine, well-evidenced, bounded-looking fix — but it is a
**generator**-side diagnostic/capability-classification change, not the **extraction**-side traversal
fix this milestone was scoped to investigate. Per this project's own established discipline (every
M8-G through M8-J milestone has declined to absorb an adjacent-but-differently-owned finding into its
own scope, documenting it instead), it is recorded here as a candidate for a future, narrowly-scoped
milestone of its own — not folded into a "traversal" milestone whose own premise it does not share.

## 12. Implementation gate

| Condition | Result |
|---|---|
| 1. Real closure body is representable by existing UIR | **Yes** — proven, not the blocker |
| 2. Existing action/expression semantics already define its meaning | Yes |
| 3. The failure is traversal only | **No** — proven false (§2-§4); the failure is (a) a generator lowering gap unrelated to nesting, and (b) a pre-existing, differently-diagnosed opaque-expression case |
| 4-10 | Not reached — condition 3 alone already fails the gate |

Per the task's own Phase 14 instruction: **STOP. This is a docs-only M8-K report.**

## 13. Implementation

None. No production code was changed.

## 14. Negative boundary

Not applicable — no positive capability was implemented to bound. For the record, the one real
still-refused shape (`formatBytes` inside adjacent string literals) remains correctly, honestly refused
(`BRG1302`), exactly as it already was before this milestone — nothing here weakened, suppressed, or
worked around that diagnostic.

## 15. Real Continuum result

Unchanged from M8-J's own baseline — no code changed, so no diagnostic moved:

| | droid | mac |
|---|---:|---:|
| BRG2305 | 0 | 0 |
| BRG2303 | 1 | 1 |
| BRG2301 | 2 | 1 |
| Files emitted | 0 | 0 |

## 16. Temporary-unblock result (fresh, redone for this milestone)

Same temporary, uncommitted method (M8-I/M8-J): null `onExportLogs`, decompose `diagnostics` to
primitives, null `platformSection`. Normalize passes; generate reached; `formatBytes`/`formatUptime` and
now-confirmed-already-working `describeTransferFailure` all still fail with `BRG3006` — **confirmed,
again, identical to before any M8-K measurement, because nothing was changed.** This directly confirms
finding 1: `describeTransferFailure`'s reference has always been correctly targeted, yet still fails at
generate, because the generator itself has no lowering for the declaration kind it targets — the same
failure `formatBytes`'s own already-targeted same-file sites (94, 173) independently exhibit too.

## 17. Fresh generator blocker census

Unchanged from M8-J's own §18 (`BRG3006`×29, `BRG3001`×15, `BRG3004`×12, `BRG3002`×10, `BRG3013`×4,
`BRG3008`×1, `BRG3005`×1) — no code changed, so the census is identical. Re-examined with this
milestone's own finding in hand: an unknown fraction of the 29 `BRG3006` sites are very plausibly the
*same* `logic.FunctionDecl`-lowering gap (any reference to any of Continuum's other top-level helper
functions, wherever declared), not 29 independent causes — but this was not individually re-traced site
by site here, since doing so is exactly the scope of the generator-capability finding (§11) this
milestone declined to implement, not a re-ranking exercise this measurement pass owns.

## 18. Regression

None — zero production code changed. `just ci`/`just determinism` not run, per the task's own
instruction not to claim validation that was not performed for a docs-only milestone. M8-J's own
regression evidence (top-level identity, unaffected) stands unchanged, since nothing here touches it.

## 19. Exact M8-L recommendation

Two independent, real, well-evidenced candidates, neither the one M8-K's own title suggested:

1. **Generator support for `logic.FunctionDecl`** (§11) — the actual, dominant cause behind all three
   named symptoms, and plausibly a meaningful fraction of the 29 `BRG3006` sites in the fresh census
   (§17). Two independently viable, differently-scoped sub-options exist and were not adjudicated here:
   (a) the smallest, purely diagnostic fix — recognize a `logic.FunctionDecl` target structurally and
   report `UnsupportedCapability` instead of the misleading `UnresolvedReference`, with no new emitted
   code — or (b) the larger, real capability — actually lowering a top-level function to a generated
   TypeScript function, which would need its own scoping pass (does the generator already have a place
   to put a free-standing helper function per file? What happens to a cross-package one?). Recommend
   starting with (a), diagnostic-only, to convert 29+ misattributed errors into honestly-scoped ones,
   before deciding whether (b) is warranted.
2. **The `BRG1302` "adjacent string literals" gap** (§3) — a narrow, already-diagnosed, extraction-side
   case with at least one confirmed real site; likely small in scope (representing two adjacent string
   literals as a single concatenated `logic.StringInterp`-shaped expression, matching how a single
   literal with interpolation already lowers) but not measured beyond the one site found here.

Recommend #1(a) as the actual next milestone: it is the only one of the two with real evidence at Continuum's
full scale (the whole 29-site `BRG3006` category, not one isolated expression shape), and it is a smaller,
better-bounded unit of work than #2's own extraction-grammar question.
