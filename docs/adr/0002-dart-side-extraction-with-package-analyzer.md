# ADR-2 — Dart-side extraction with `package:analyzer`, persistent server

- **Status:** Accepted (frozen, Specification v2.0 §1.2, §3.1, §7.2)
- **Date:** 2026-07-11

## Context

Extraction needs *resolved* Dart semantics. Without type resolution you cannot distinguish
`Provider.of<CartModel>(context)` from an arbitrary method call, or know that a field is a
`ChangeNotifier`. The only production-grade source of resolved Dart is `package:analyzer` — the same
foundation the Dart SDK, `dart fix`, and `custom_lint` are built on.

## Decision

The compiler frontend is a **Dart CLI** (`bridge_analyzer`) that loads the project via
`AnalysisContextCollection`, walks resolved ASTs, and emits UIR as NDJSON. It never generates target
code. From M5 it also runs as a **persistent server** (length-prefixed NDJSON over stdio) so warm
re-extraction of a single file is fast enough for `bridge dev`.

## Alternatives considered

1. **Parse Dart from Node (tree-sitter).** Syntax without semantics. Fatal — see Context.
2. **Consume kernel/dill output.** Too low-level: the widget-tree intent that the whole platform
   depends on has already been desugared away.

## Consequences

- The repository is bilingual, with an IPC boundary. Mitigated by (a) generating UIR types for *both*
  languages from one schema, so they cannot drift, and (b) keeping the transport deliberately dumb.
- The Dart track is the long pole; TypeScript work proceeds against committed G1 fixture UIR so the
  two tracks never serialize (Blueprint §6, R9).
- Permanent, small tax: tracking Dart SDK releases (~1 engineer-week per Dart minor), with the beta
  channel in CI from M1 (R6).
