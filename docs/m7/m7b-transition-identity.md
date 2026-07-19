# M7-B — Transition Identity

**Solved, and the solution needed no new mechanism — but it covers only half the departures, for a reason
that is architectural rather than incidental.**

A departure now names the edge it performs:

```json
{"kind": "app.RouteTransition", "id": "ae96a52a40dc8269", "component": "…"}
{"kind": "logic.Navigate", "action": "push", "transition": "ae96a52a40dc8269"}
```

Bound by `NodeId`. Nothing matches a span, nothing matches a name, and the generator reconstructs nothing.

---

## 1. Departures measured (Phase 1)

Hand-written `lib/` Dart, comment lines and generated files excluded.

| Form | hello_bridge | continuum | unichat | **total** |
| --- | ---: | ---: | ---: | ---: |
| `Navigator.push` | 0 | 14 | 45 | **59** |
| `Navigator.pushNamed` | 0 | 0 | 13 | **13** |
| `Navigator.pushReplacement` | 0 | 0 | 6 | **6** |
| `showDialog` | 0 | 6 | 17 | **23** |
| `showModalBottomSheet` | 0 | 0 | 21 | **21** |
| `pushReplacementNamed` / `pushAndRemoveUntil` / `showMenu` | 0 | 0 | 0 | **0** |
| | | | | **122** |

**`Navigator.push` with an inline destination is 59 of the 122** — the single largest departure form, and
the one this milestone makes identifiable.

## 2. Where identity can first exist (Phase 1, traced)

| Layer | Can an edge be named here? |
| --- | --- |
| **Analyzer / extraction** | **Yes** — `RawNode.symbol` + `RawRef(symbol)` is exactly ADR-17's deferred binding, and it is what every declaration already uses |
| UIR | ids exist, but they are minted *by* the builder from content; extraction cannot know one |
| Normalization | too late — the departure statement is already built or dropped |
| Generator | too late, and finding an edge here is the reconstruction the rules forbid |

So identity must be minted at extraction, as a symbol, and resolved to a `NodeId` by the builder.

## 3. The design (Phase 2)

**Nothing new was added.** The transition extractor mints `nav:<file>#<ordinal>`, attaches it to the
`app.RouteTransition`, and **returns it to the call site that asked**. The statement extractor puts that
symbol in `logic.Navigate.transition`, and the builder resolves it exactly as it resolves a reference to a
component or a store.

The ordinal is worth defending, because it looks like the sort of thing this project refuses:

> **It is not span matching and not a heuristic.** Nothing is ever *looked up* by this symbol from the
> outside. The extractor mints it and hands it back to the very call site that asked, so the two nodes are
> bound **by construction** rather than by searching for one another. The ordinal exists to make the symbol
> unique, not to make it findable.

Rejected alternatives, and why:

| Approach | Verdict |
| --- | --- |
| match the edge to the call by **span** | forbidden by the brief, and it is the heuristic `unsupported.ts` already names as the thing not to do |
| match by **name** | there is no name — a call site is not a declaration |
| have the generator find the edge | reconstruction, and it would duplicate the route extractor in every generator |
| **symbol + deferred binding** | ✅ existing mechanism, causal rather than inferential |

## 4. The blocker: a transition is not a declaration

Identity ships for **component** destinations and is deliberately withheld from **path** destinations. The
reason is a real invariant, and the analyzer's own test suite found it:

```text
BRG1207: The declaration "nav:lib/main.dart#0" is referenced,
         but no node with its id survived the build.
```

`BRG1207` enforces that **every symbol a pass declares corresponds to a node that survived it** — and it
sweeps all declared symbols, so an unreferenced one trips it too. That invariant is correct: a symbol is
the builder's word for *a declaration*, and a declaration exists.

A transition is not a declaration, and the two destination kinds differ in whether they are guaranteed:

| Destination | Resolution | Can the edge drop? |
| --- | --- | --- |
| **component** — `Navigator.push(MaterialPageRoute(builder: (_) => Detail()))` | `RawRef` to a `ui.Component`, a real declaration | **no** — and `_destination` already returns null for anything that does not resolve to one |
| **path** — `Navigator.pushNamed('/x')` | `RawRouteRef` against the route table | **yes** — a path matching no route drops the edge with `BRG1308`, *a warning by design*, because there the program rather than the compiler is at fault |

Minting a symbol for a path transition converts that warning into a build error. So path departures keep
their capability refusal, and the test that caught this is kept as the pin.

### The smallest amendment that would close it

A **conditional declaration** in the builder: a symbol whose node may legitimately not survive.

1. `ReferenceResolver.declare(symbol, span, {conditional})` records it in a separate set.
2. `validation.dart`'s BRG1207 sweep skips conditional symbols — their absence is expected, not a hole.
3. A reference to a conditional symbol whose node did not survive resolves to `_unresolved`, so the
   **referring node is dropped too**, using the propagation that already exists for `RawRouteRef`.

Point 3 is the one with a real constraint: it needs the referenced node's fate to be known before the
referring node is built, which is an ordering guarantee the builder does not currently state. That is why
this is written down rather than improvised — it is a builder change with an ordering precondition, and
guessing at it would be exactly the kind of unverified change this milestone is meant to avoid.

**Cost when done:** 13 `pushNamed` + 6 `pushReplacement` departures become identifiable, plus every future
path-based navigation. **Not blocking:** the 59 inline pushes, which are the larger half and work now.

## 5. What is still refused, and correctly

| Form | Status |
| --- | --- |
| inline `push` / `pushReplacement` | **identity ✅**; generation still `BRG3008` — an inline destination has no path, and choosing a URL the developer never wrote is the separate legalization decision §A17.2 refused |
| `pushNamed` / `pushReplacementNamed` | `BRG3013` — needs §4's amendment |
| `showDialog` / `showModalBottomSheet` | `BRG3013` — these are calls, not `Navigator` methods; the adapter does not claim them yet, which is a **separate** piece of work from identity and was left alone deliberately (the brief: *do not broaden scope*) |
| `pop` / `popUntil` | `pop` compiles (M7-A); `popUntil` refuses — no predicate is modelled |

So **no new generated output** lands in this milestone. What lands is the identity that unblocks it, plus
the evidence that it is sound.

## 6. Validation

| Gate | Result |
| --- | --- |
| Analyzer tests | **225** (221 + 4 new) |
| Workspace | 22 tasks, forced non-cached |
| `dart analyze` both packages | clean |
| Determinism | byte-identical across 3 runs |
| portability / codegen-check | clean |
| Real project | `logic.Navigate.transition` == `app.RouteTransition.id`, verified in `.bridge/uir.ndjson` |

The identity test asserts **the same id**, not that a transition is present — a presence check would pass
against a node pointing at the wrong edge, which is the failure mode worth catching.

**Corpus:** hello_bridge unchanged (no departures). Continuum and unichat were measured but **not compiled**
— both still fail earlier on unrelated capabilities, so a build would prove nothing about this change. No
browser test: nothing new is generated to exercise.

## 7. A regression I introduced and the suite caught twice

Both were found by existing tests, and both are worth recording because they are the same shape — *a change
that looked local and was not*.

1. **BRG1207 on a dropped path transition** (§4). This is the finding of the milestone; it turned an
   implementation detail into an architectural statement about what a symbol means.
2. **Duplicate edges.** Dedup used `_seen` as a `Set`; making it a `Map<…, String?>` and treating a null
   value as "absent" meant every path transition was re-emitted on the second walk of a method — one call
   site, two edges in the nav graph. Five tests failed at once. Membership and symbol are two different
   facts, and the map is now read with `containsKey`.

## 8. What this milestone should be remembered for

**The mechanism was already there.** Transition identity needed no new concept, no span matching and no
generator lookup — `RawNode.symbol` and `RawRef` have carried every declaration reference in this compiler
since ADR-17, and a transition can use them the moment you accept that the extractor should *hand back*
what it minted instead of being asked to find it again later.

**And the half that does not work explains what a symbol is.** A symbol is a promise that a node exists.
A path-based transition cannot make that promise, because whether it exists depends on a route table that
is only complete at build time. That is not a limitation to route around — it is the invariant doing its
job, and the amendment in §4 is what it would take to widen it honestly.
