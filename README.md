# FlutterBridge

Flutter Application Compiler Platform.

```
Flutter project → Universal Semantic Compiler → UIR → N generators (React/Next.js first)
```

**The architecture is frozen at Specification v2.0.** This repository implements it; it does not
redesign it. New abstractions, package splits, or interface changes require an ADR that documents a
proven contradiction in the spec — not a preference.

## Status

| Milestone | State |
| --- | --- |
| M0 — De-risk spike | **complete** — [GO WITH CONDITIONS](docs/m0/m0-final-review.md) |
| M1 — UIR + extraction | not started (unblocked; see the M1 readiness checklist) |
| M2 — Pipeline + React MVP (walking skeleton / MVP) | not started |
| M3+ | not started |

The architecture is **Specification v2.0 + [v2.1 amendments](docs/spec/v2.1-amendments.md)**, the
latter adopted at the M0-T7 gate. M0 produced six new ADRs (11–16) and **zero UIR schema changes**.

Packages exist as skeletons from M0 so that the architecture rules (Spec §1.2) are enforced from the
first commit. Directories marked *reserved* carry no code until their milestone.

## Layout

| Path | Purpose |
| --- | --- |
| `packages/uir` | UIR schema, node types, IDs, canonical form, NDJSON IO, migrations |
| `packages/plugin-sdk` | Every extension interface (SPI) + plugin testkit |
| `packages/core` | Plugin host, VFS + hash-guard, diagnostics, config, logging |
| `packages/compiler` | Query engine, pass manager, normalization/analysis, legalization, orchestrator |
| `packages/verification` | Verifier host + verifiers (static, visual, …) |
| `packages/cli` | `bridge` command surface |
| `packages/generators/react` | Target #1: Next.js generator |
| `packages/adapters/widgets-material` | Material widget mappers |
| `packages/runtimes/react` | `@bridge/runtime-react` — layout/theme/nav/state engines |
| `dart/` | `bridge_analyzer` (extraction), `bridge_uir` (generated types), `bridge_lints` — *reserved, M1* |
| `fixtures/` | Golden corpus: fixture apps, UIR (G1), emit (G2), screens (G3) |
| `docs/adr/` | Architecture decision records (ADR-1…ADR-10 from Spec §12) |

## Commands

```bash
just install        # pnpm install --frozen-lockfile
just build          # turbo: codegen -> build
just test           # all package tests
just lint           # architecture rules (Spec §1.2) + stub-tag discipline
just lint-negative  # prove the architecture rules reject a forbidden import
just dart-analyze   # flutter analyze on the fixture app
just ci             # everything above — mirrors .github/workflows/ci.yml
```

## Rules of engagement

1. Specification v2.0 and the Implementation Blueprint are the single source of truth.
2. Deferred work is a stub tagged `// BRIDGE-STUB(M<n>): <what the real impl adds>`; CI rejects
   untagged stubs.
3. Nothing on the Blueprint §5.2 blocklist gets implemented before its milestone.
4. Found a problem? File it as an implementation issue. Do not redesign the interface.
