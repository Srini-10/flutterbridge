# ADR-17 — Architectural rulings at the M1-T8 gate

**Status:** Accepted (2026-07-12)
**Supersedes:** the open-issue register carried from M0-T7 through M1-T8.

Nine issues had accumulated across M0 and M1 — each one raised, documented, and deliberately *not*
resolved by the engineer who found it. They are resolved here, together, at the gate where extraction
stabilized. This ADR is the register: what was ruled, and why the ruling is what it is.

---

## ISSUE-6 — Node identity → **two-tier, ratified** (amends Spec §2.3)

Spec §2.3 said an id is "blake3 of the node's canonical form". Taken literally, that cannot work: an
L3 declaration and the things that refer to it are mutually referential, so a pure content hash has no
fixed point. M1-T3 shipped a two-tier strategy and flagged it.

**Ruled:** the two tiers are the architecture, not a workaround.

| | Identity | Because |
| --- | --- | --- |
| **Declarations** | the **symbol** (`comp:lib/a.dart#LoginScreen`) | a file being rebuilt must resolve a reference *into a cached file* to the id that file already has. Without this, per-file caching is impossible — not merely difficult. |
| **Tree nodes** | **content**, stripped of id/anchor/span, recursively | two identical subtrees *are* one node. That is what content addressing means. |
| **Occurrence** | the **anchor** | two identical `SizedBox`es are one node and two *places*. Overrides address places. |

This is what makes `incremental ≡ clean` provable rather than hopeful, and it is now load-bearing for
the cache, for overrides, and for AI provenance (ADR-7).

## ISSUE-7 — Digest algorithm → **SHA-256 stays**

Cross-language determinism (Dart *and* TypeScript must agree, byte for byte) beats blake3's speed.
Hashing has never been the bottleneck; resolution has. If it ever becomes one, changing the algorithm
invalidates every cached artifact exactly once — which the version context already handles, and which
v2.2 has just demonstrated in anger.

## ISSUE-8 — `RawNode` → **approved exactly as implemented**

`symbol` stays **optional**: only declaration-like records own one, and an expression inside a widget
tree is not something anything refers to. References stay **embedded** as `RawRef` values inside
`fields`; there is no top-level `references` array, because the canonical builder resolves references
*structurally*, with zero per-kind knowledge, and a parallel array would break exactly that.

Recorded as Spec v2.2 §A12. **Do not manufacture synthetic symbols to satisfy a sentence.**

## ISSUE-9 — Layer partitioning → **deferred**

One canonical NDJSON document for all of M1. Splitting L0–L4 into separate artifacts is a packaging
decision, and packaging decisions made before the pipeline exists are packaging decisions made blind.

## ISSUE-10 / ISSUE-13 — The incremental seam → **corrected, and now wired**

M1-T5 declared `typedef ModuleExtractor = List<RawNode> Function(String, String)` — **synchronous**.
It could: the incremental machinery was built and proved against a fake extractor, and *what* is
extracted is irrelevant to *whether* it needs re-extracting.

M1-T8 then discovered the obvious. Extraction needs a **resolved** unit, and `package:analyzer`
resolves only asynchronously. A synchronous extractor cannot resolve, so a synchronous seam is a seam
nothing can plug into.

**Ruled: a correction to the seam, not a redesign.** The signature is now
`Future<List<RawNode>> Function(String, String)` and `IncrementalAnalyzer.analyze` is async. **The
algorithm is untouched** — digests, the API/impl fingerprint split, cache keys, the merge order — which
is precisely why the byte-identity property survived the change instead of having to be re-established.

The adapter that joins the two lives in `pipeline/incremental_pipeline.dart`, because that is the only
layer that may see both: `incremental` declares the seam and must never import an analyzer, `session`
owns the analyzer and must never import `incremental`.

**ISSUE-10 is closed.** Proved on `hello_bridge`:

| | files re-analyzed | output |
| --- | --- | --- |
| cold cache | 7 of 7 | identical to clean |
| no change | **0** | identical to clean |
| edit a method **body** | **1** | identical to clean |
| edit a public **API** | 4 (the file + its 3 dependents) | identical to clean |

## ISSUE-14 — `bind.Const(null)` → **v2.3 amendment; workaround stands**

`bind.Const.value` is required, and canonical JSON omits nulls (INV-1) — so `value: null` and *no
value* are the same bytes, and the schema rejects the node. A future schema must distinguish *absent*
from *explicitly null* without relying on JSON omission semantics.

Until then a null constant travels as `bind.Expr(logic.Lit)`, whose `value` is optional and whose
absence already means null. Same meaning; it validates.

## ISSUE-15 — `logic.Index` → **v2.3 amendment**

`a[i]` has no node. It is common enough to deserve one:

```
logic.Index { target, index, type }
```

Until the amendment exists, index expressions remain `logic.OpaqueExpr` — preserved with their source,
never dropped.

## ISSUE-16 — Route discovery → **adapters own it; extraction does not**

wonderous declares its routes through its own `AppRoute extends GoRoute`, with positional arguments and
non-`const` paths. Recovering that means guessing "first positional is the path, second is the builder"
— inventing behaviour for one application.

**Ruled:** extraction understands only *canonical* routing APIs (`MaterialApp.routes`/`home`,
`GoRouter`/`GoRoute`/`ShellRoute`). Framework- and package-specific route discovery belongs to the
adapter registry. **No package is ever special-cased in the extractor.**

The cost is honest and must stay visible: an application whose routes we cannot see is an application
**N11 silently does nothing for**. That is a coverage gap in the adapter registry, not a defect in
extraction.
