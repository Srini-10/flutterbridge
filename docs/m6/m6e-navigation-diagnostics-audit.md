# M6-E — Navigation Diagnostics Audit

**Truthful diagnostics before new capability. ADR-0025 is not implemented, the schema is untouched, and no
navigation capability was added.** Three diagnostics were saying things that were false; they now say what
is true.

---

## 1. Scope note — what "no generator changes" had to mean

The brief forbids generator changes, and every navigation diagnostic is *emitted by* the generator. Taken
literally the milestone could not be performed at all, so the rule was read as its evident intent: **no
change to what is generated.** What changed is diagnostic text, the capability table's data, and one
double-report.

That reading is checked rather than asserted — the emitted-output tests and the byte-identical determinism
run are unchanged and still pass (§6). No lowering, no widget mapping, no emission path was touched.

## 2. Phase 1 — the audit

Every navigation, overlay and routing diagnostic across all three domains.

| Code | Fires when | Root cause correct? | Blames | Owner named? | Correct next action? |
| --- | --- | --- | --- | --- | --- |
| BRG1304 | `onGenerateRoute:` is set | ⚠️ over-claims — see §5 | compiler | yes | yes |
| BRG1307 | a transition names neither or both destinations | ✅ | **itself** — "a bug in the compiler, not in your code" | yes | n/a (internal) |
| BRG1308 | a navigation names an undeclared path | ✅ | compiler | yes, links BRG1304 | yes |
| BRG2110 | a widget list is buried in props | ✅ *after* its M4-G→M5-A correction | catalog | yes | yes — names the two-line fix |
| BRG2301 | a live object crosses a route boundary | ✅ | **the program, correctly** | user | yes — "pass an id and load from it" |
| BRG2302 | N11 promoted cross-route state | ✅ | nobody — it is `info` | compiler | n/a |
| BRG2303 | a cross-route callback cannot be promoted | ✅ mostly — one of three reason strings is a symptom | user | yes | partly |
| BRG3006 | a name is undeclared | ⚠️ **was reached by `showDialog`** — fixed, §4 | **the program, wrongly** | no | no |
| BRG3008 | an inline destination has no path | ❌ **stated cause invalidated** — fixed, §3 | ambiguous | no | no |
| BRG3013 | a known capability is missing | ✅ the model the others should follow | compiler | yes | yes |
| BRG3018 | a route's component needs arguments | ✅ verified against the schema, not its own prose | compiler | yes | yes |

Two diagnostics were wrong and one was unreachable-by-the-wrong-path. All three are fixed. **Nothing was
weakened**: every code that was an error is still an error, and the two messages that changed became *more*
specific about what is missing and who owns it.

## 3. BRG3008 — a measurement that outlived its measurement

The message told users, for four milestones:

> …a legalization decision this generator declines to make on the evidence available — **one push, in one
> fixture**.

By the time anyone re-read it, M5-A had counted 17 occurrences and M6-D counted **62 pushes and 93
`MaterialPageRoute`s** across two production applications. And ADR-0025 had moved the root cause: the
generator is not waiting for evidence about URL policy, it is waiting for a UIR node that says *perform this
transition here*.

Now:

> …it names no route and has no path (Spec v2.4 §A17). Two things are missing and both are owned by the
> compiler, not by your program: no UIR node says *perform this transition here* (ADR-0025 D2,
> `logic.Navigate`), and a destination with no path needs a URL that only this generator can choose — which
> it will not invent, because a URL the developer never wrote is what §A17.2 refused.

The refusal is unchanged and still an error. What went away is the number.

**The generalisation, now enforced by a test:** a diagnostic must describe a *capability*, never the state
of the evidence when it was written. A sentence that has to be re-measured to stay true is one nobody
re-measures. `no capability describes implementation history` scans every entry in the registry for counts,
fixtures and milestone names.

## 4. The overlay calls that blamed the program

Found by running the pipeline, not by reading the table:

```text
error [BRG3006] `showDialog` is not declared in this program, so there is nothing to emit for it.
```

`showDialog` is valid Flutter. Telling an author it is "not declared in this program" blames correct code
for a gap the compiler owns — which is exactly the generic message the capability table was built to
abolish, reappearing because **the table had no entry for the call**. `AlertDialog` was in it; `showDialog`
was not, and the reference the generator refuses is the call.

`showDialog` (23 corpus uses) and `showModalBottomSheet` (21) are the two most frequent overlay calls
measured. Both now report `BRG3013`, naming the capability and the owning layer.

### The registry gap this exposed

Six navigation call names the corpus uses had no entry at all — `pushReplacement` (6 uses), `popUntil` (6),
`maybePop` (2), plus `pushAndRemoveUntil`, `popAndPushNamed`, and the five overlay openers. Each fell
through to BRG3006.

### One capability was two

`imperative overlays` was a single capability string with a single owner covering two different blockers:

| | Mechanism | Closed by | Owner |
| --- | --- | --- | --- |
| **Route overlay** — `showDialog`, `showModalBottomSheet`, `showMenu`, `AlertDialog`, `PopupMenuButton` | pushes a `Route` (ADR-0024 cites the SDK lines) | ADR-0025 D2 | **schema** |
| **Messenger overlay** — `showSnackBar`, `ScaffoldMessenger`, `SnackBarAction` | enqueued on the nearest `ScaffoldMessenger`, which owns queue, lifetime and dismissal | **nothing yet** | **adr** |

This mattered because `OWNER_LABEL.adr` reads *"an architectural decision that has not been made yet (it
needs an ADR)"*. **That sentence became false for route overlays the moment ADR-0025 was written.** Leaving
them as `adr` would have been a new stale claim of exactly the kind §3 is about — so they moved to `schema`,
and the messenger family kept `adr`, where the label is still true.

A test now pins both halves, including that an `adr`-owned entry may not cite an ADR in its own text.

## 5. Not changed, and why

**BRG1304's refusal stands.** Its *stated cause* — `onGenerateRoute` routes "cannot be read into a static
route graph" — over-claims: it is true of an arbitrary function and false of the `switch`-on-literals shape
that is the only one the corpus uses (M6-D §2). But softening it here would edit the analyzer, which this
milestone forbids, and the honest replacement is a sentence about what *this analyzer does not read yet* —
which is ADR-0025 §6's territory. Recorded, deliberately not touched.

**BRG2303's third reason string** — *"a value the compiler has no id for"* — is a symptom, and the comment
beside it names the real cause (BRG2105) without putting it in the message. Normalization, not navigation;
left for whoever owns N11 next.

**BRG2110's residual clause.** Its message was corrected in M5-A to blame the catalog rather than the
frontend, but the superseded sentence still sits mid-message. Not navigation-owned; noted.

## 6. Validation

| Gate | Result |
| --- | --- |
| Generator tests | **147** pass (130 + 17 new) |
| Analyzer tests | 221 pass |
| Whole workspace | 22 tasks, forced non-cached |
| `dart analyze`, portability, stubs, codegen-check | clean |
| Determinism | byte-identical across 3 runs |
| Emitted output | **unchanged** — no test asserting generated bytes changed |
| End-to-end | real Flutter project: `BRG3006` and the duplicate `BRG3002` gone, one diagnostic per construct |

### Mutation testing

Every new test was verified to bite:

| Mutation | Caught by |
| --- | --- |
| remove the `showDialog` entry | 3 tests, incl. the BRG3006-fallthrough guard |
| restore the `BRG3002` double-report | `a refused call is refused once` |
| put "one push, in one fixture" back | the BRG3008 wording test |
| collapse route + messenger overlays to one owner | 2 tests, incl. the `adr`-honesty test |

### A trap this repository has now recorded five times

The first version of the regression fixture hand-authored a flatter node graph than the analyzer emits.
Twelve tests failed at once — the *good* outcome, since a wrong shape usually produces silent passes. The
correct path was read from a real `.bridge/uir.ndjson`:

```text
ui.Component.render.slots.body.children[0].props.onPressed.expr.body[0].value.callee
```

**Mint fixtures from the analyzer.** It is in three handoffs already; this is the fifth instance.

## 7. Deliverables

- **Updated diagnostics** — BRG3008 restated; 11 registry entries added; route/messenger overlays split;
  the BRG3002 double-report on refused calls removed.
- **Regression tests** — `packages/generators/react/tests/navigation_diagnostics.test.ts`, 17 tests,
  mutation-verified, covering every form the brief names.
- **Capability audit** — §4, plus four registry invariants now enforced by tests.
- **Documentation** — `docs/guide/supported-widgets.md` (regenerated: the unsupported table now carries a
  diagnostic column, splits the two overlay kinds and documents route arguments and `onGenerateRoute`, none
  of which it mentioned); `docs/troubleshooting.md` (BRG3008 and BRG3018 sections added, both with
  workarounds; the BRG3013 section corrected — it claimed one amendment covers all overlays, which is what
  §4 disproves).
- **Engineering report** — this document.

## 8. What this milestone should be remembered for

**A compiler's diagnostics are part of its contract, and they rot.** None of these three was a lowering
bug. Every one was the compiler describing its own history — a count, a fixture, an ADR that had since been
written — to a user who cannot see any of it and can only read the sentence as a statement about their
program.

The one that cost most was the cheapest to prevent: `showDialog` had no table entry, so the most specific
diagnostic system in the codebase fell back to the one message it exists to abolish, and told authors of
valid Flutter that their program was missing something. The fix was one line of data. Finding it required
running the pipeline instead of reading the table.
