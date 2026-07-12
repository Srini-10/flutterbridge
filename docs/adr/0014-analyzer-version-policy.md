# ADR-14 — Analyzer version pinning and upgrade policy

- **Status:** Accepted (M0-T7). Amends Spec v2.0 §10 (`dart/bridge_analyzer`) and §7.6 (compatibility matrix).
- **Date:** 2026-07-12

## Evidence (M0-T3, F8)

`package:analyzer` 14.0.0 ships a redesigned AST. Adapting the M0-T3 spike cost three compile-fix
rounds against an API most Dart documentation still describes in its pre-14 form:

| Was | analyzer 14 |
| --- | --- |
| `ClassDeclaration.members` | `ClassDeclaration.body.members` |
| `ClassDeclaration.name` | `ClassDeclaration.namePart.typeName` |
| `NamedExpression` (`.name.label.name`, `.expression`) | `NamedArgument` (`.name` Token, `.argumentExpression`) |
| `ArgumentList.arguments: List<Expression>` | `List<Argument>`; `Expression implements Argument` |
| `SimpleFormalParameter.type` | `FormalParameter.type` / `.name` (unified sealed class) |

This is risk **R6** (Dart SDK / analyzer churn) materialising on day one of implementation, not in
some future year. Also relevant (**F7**): widget identification via
`staticType.allSupertypes` string-matching worked and needed **no Element/Fragment API** — and the
Element/Fragment API is exactly where the churn lives.

## Decision

**Pin `analyzer` to an exact version.** `dart/bridge_analyzer` declares `analyzer: 14.0.0` — not
`^14.0.0`. A transitive minor bump must never be able to change extraction output, because extraction
output is hashed into every cache key (Spec §7.2).

**Prefer the stable surface.** Where a resolved *type* answers the question, use it (F7). Reach for the
Element/Fragment API only when types cannot answer, and isolate every such use behind
`bridge_analyzer`'s internal adapters so an upgrade touches a bounded set of files.

**Upgrade policy.** An analyzer upgrade is its own PR, never a drive-by. It must: (a) leave the G1
golden corpus byte-identical, or (b) explain every diff. No feature work rides along.

**CI strategy** (from M1-T7):

| Job | Channel | Blocking? |
| --- | --- | --- |
| `dart-stable` | Dart stable, pinned analyzer | **yes** |
| `dart-beta` | Dart beta channel | **advisory** — must be green within one week of a break |

The beta job is the early-warning system that R6's mitigation promised. It has already paid for itself
once, before it existed.

## Consequences

- A Dart minor release cannot silently change extraction. It changes it in a PR, visibly, against the
  corpus.
- Budget: roughly one engineer-week per Dart minor, as ADR-2 anticipated. M0 confirms the estimate is
  the right order of magnitude, not that it is generous.
