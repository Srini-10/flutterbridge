# ADR-9 — AI as a boundary-only suggester, with deterministic scoring and human merge

- **Status:** Accepted (frozen, Specification v2.0 §6)
- **Date:** 2026-07-11

## Context

The long tail of unmapped widgets and pub packages is the platform's main source of manual work. LLMs
are good at proposing mappings. Builds, however, must be **deterministic** (D1–D5) — that is a
promise made to every consumer of this compiler.

## Decision

**The compiler is deterministic; AI operates only at the boundary.** The AI subsystem may analyze
gaps, propose mappings, and draft overrides. Its output enters the build only through the same
reviewed channels a human's would: an adapter package or an override file, merged by a person.

- **Gap analyzer:** deterministic clustering of diagnostics/`Opaque` nodes by blast radius. No LLM.
- **Suggester:** LLM + RAG over a knowledge base of *approved* adapters. Produces candidates only.
- **Confidence scorer:** deterministic gate — does it compile under `tsc --strict`, does it pass the
  conformance suite, does its golden render diff stay under threshold, how similar is it to approved
  adapters. The model's self-assessment carries the *lowest* weight.
- **Approval:** score ≥ 0.85 opens a PR labeled `ai-suggested` with diff, rendered before/after
  screenshots, score breakdown, and provenance (`model`, `promptVersion`, `kbSnapshot`).
  **Nothing lands without human merge.** Merged adapters carry `provenance: ai-assisted` forever.

## Alternatives considered

1. **AI inline in the compile path.** Nondeterministic builds. Violates D3. Not negotiable.
2. **Fine-tuning a model on the adapter corpus.** Unauditable and unrevertable. Retrieval over a
   curated, human-approved knowledge base is both, and improves monotonically with the registry.

## Consequences

- `@bridge/ai` must have **no write path into build output** — enforced structurally: the package does
  not depend on the VFS, and an audit at M7 confirms it (Blueprint §9, M7 DoD).
- Suggestion quality is bounded by the knowledge base, which is a curation responsibility, not a model
  responsibility.
