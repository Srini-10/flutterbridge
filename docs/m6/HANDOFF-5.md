# Handoff — session 5

**The cross-platform matrix is fully green, M6-A/B are on `main`, and the largest compiler limitation
affecting real applications turned out to be smaller and differently shaped than it was documented as.**

---

## 1. Windows — closed

Run [29684926520](https://github.com/Srini-10/flutterbridge/actions/runs/29684926520): **all 8 jobs pass**,
including `windows-latest · packaged install`, which had never passed, and
`byte-identical across platforms`, which is the property M5-F existed to establish.

Nothing was needed this session. The previous session's last dispatched run was already green; it had not
been read. **Read the run before assuming the work is open** — that check cost one command and would have
cost an afternoon of re-diagnosis.

## 2. M6-A/B landed (Phase 0)

`feature/m6-foundation` rebased onto `main` with **no conflicts**, [PR #2](https://github.com/Srini-10/flutterbridge/pull/2), merged.

`notifyListeners` erasure (M6-1) and `widget.foo` lowering (M6-B) are now on `main`, where they should have
been two sessions ago. 217 analyzer tests passed on the rebase.

**`lint:deps` and `verify:depcruise-negative` cannot run on this machine** — dependency-cruiser refuses
Node 25.9.0 and only Node 25 is installed. CI runs 24.6.0. Both passed there. Worth knowing before
diagnosing them as broken locally.

## 3. M6-C — the route-argument gap is not what the document said

### What was claimed, and what is true

`GAP-route-component-arguments.md` was written from the generator's symptom. Two of its central claims are
wrong, and the corrections are what made this session's work possible:

| Claimed | Measured |
| --- | --- |
| the arguments "never reach" the generator | **they are extracted in full** — `props` on the `ui.Element` in the app root's slot, values and spans intact |
| hello_bridge "does not hit this gap" | **it hits it** — `home: LoginScreen(isDark:, onToggleTheme:)`, both required |
| the fix is a new `arguments: Record<string, Binding>` on `app.Route` | that duplicates data already in the document. `RouteArgument[]` exists and is what `app.RouteTransition` already carries |

The document is a **missing link, not a missing representation**. `app.Route` records *which component*
renders and never *which element constructed it*, so the route emitter — handed the route table, not the
app root's render tree — has no path to props that are sitting in the same document.

Full evidence: [`GAP-route-constructor-arguments.md`](./GAP-route-constructor-arguments.md), which
supersedes the earlier one.

### The defect that was actually shipped

```text
build succeeded.        ← bridge build, 10 files written

app/page.tsx(14,11): error TS2739: Type '{}' is missing the following properties
                     from type 'CounterPanelProps': label, step
```

The compiler **reported success and handed over source that does not compile**, in generated code the
developer is told not to edit. The gap was never that a feature was missing; it was that nothing said so.

`BRG3018` now refuses it, naming the parameters, the layer that owns the fix, and the amendment.
Implemented, mutation-verified, end-to-end through the real pipeline.

### The measurement that retired the open question

The earlier document named one thing that had to be measured before a shape could be chosen — *where else
construction arguments appear*. Across both real applications and the fixture:

| Position | hello_bridge | continuum | unichat | Works today? |
| --- | --- | --- | --- | --- |
| **tree** | 3 | 80 | 329 | ✅ `ui.Element.props` |
| `builder:` | 1 | 15 | 50 | ❌ no `app.RouteTransition` at all |
| `return` | 0 | 12 | 31 | ✅ tree, via a build method |
| **`home:`** | 1 | 7 | 0 | ❌ the gap |

**The tree position dominates ~10:1 and already works.** So the field belongs on `app.Route`, not on
whatever models a component reference — `ui.Element` already models that and already carries `props`.

### Two findings that should change M6-C's plan

- **Neither real application uses `go_router`. Zero `GoRoute`.** C1 recorded it as *the dominant navigation
  shape in real apps* and that conclusion drove `app.RouteTransition`'s design. In this corpus it is
  absent and `Navigator` + `MaterialPageRoute` is universal. **Re-measure before relying on C1 here.**
- **`Navigator.pop` is the most frequent navigation operation** — 129 uses against 58 pushes — and Spec
  v2.4 §A17.3 says a pop is explicitly *not* an `app.RouteTransition`. The most common navigation in the
  corpus has no node at all.

## 4. `mounted` vs `context.mounted` — two concepts (Phase 4)

Classifying the 11 real `context.mounted` uses by enclosing declaration:

| Scope | Uses |
| --- | --- |
| inside a `State` | 2 |
| **a top-level function** | **9** |

`changeProfilePhoto(BuildContext context, …)` and friends have no `State` anywhere, so a single
`component.mounted` member would have to **invent a component** for nine of eleven sites. They also differ
in arity — `component.mounted` is nullary, `context.mounted` needs an operand.

This **confirms** the two-member vocabulary already proposed rather than revising it. Appended to
[`GAP-mounted.md`](./GAP-mounted.md). Analysis only; still a schema change, still not implemented.

## 5. State

| | |
| --- | --- |
| `main` | `b48ad61` — M6-A/B merged |
| PR [#3](https://github.com/Srini-10/flutterbridge/pull/3) | `feature/m6-route-arguments` — BRG3018 + both gap documents |
| Matrix | **all 8 jobs green** |
| Analyzer tests | **221** |
| TS tests | 130 gen-react; 22 tasks, forced non-cached |
| Determinism | byte-identical across 3 runs |
| hello_bridge | BRG3010 ×19, BRG3002 ×5, BRG3018, BRG3016, BRG3013, BRG3008, BRG3007, BRG3006, BRG2104 |

## 6. Next, in order

1. **Merge PR #3** once CI is green.
2. **The ADR for `app.Route.arguments`** — and it should cover the imperative case in the same document.
   The `builder:` position carries **65 of the corpus's arg-carrying route sites against 8 for `home:`**,
   and currently produces no node whatsoever. Amending `app.Route` alone closes the smaller half and
   leaves the larger one silent. They are one question: *how does a destination receive its arguments.*
3. **M6-C navigation proper** — imperative navigation, dialogs, bottom sheets, overlays. `showDialog` (23)
   and `showModalBottomSheet` (21) are real corpus volume. Start from the measurement above, not from C1.
4. **A real analyzer fixture for the `bind.Param` regression** — outstanding since session 2, still.
5. **npm publish** — still the largest gap between "released" and "usable by a stranger". `@bridge/runtime-react`
   404s, so a generated project cannot `npm install` without a workspace link. This session hit it directly.

## 7. What this session should be remembered for

**A documented blocker was wrong in the direction that mattered.** The gap document said the analyzer loses
route constructor arguments. It does not — it extracts them perfectly, and the loss is one missing
reference between two nodes in the same file. Every downstream conclusion had been built on the stronger
claim, including a proposed schema field that would have duplicated data already present.

The correction cost three probes against the real analyzer. **Reading the document the compiler actually
emits, rather than the code that consumes it, is what separated the two.**

The second lesson is about severity. The thing worth fixing here was not the missing feature — that still
needs an ADR — but the **`build succeeded`**. A compiler that refuses is usable; a compiler that lies about
success moves the failure into generated code and blames the developer for it.
