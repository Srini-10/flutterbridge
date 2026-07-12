# ADR-8 — In-process, capability-scoped plugins; no hard sandbox yet

- **Status:** Accepted (frozen, Specification v2.0 §4.1)
- **Date:** 2026-07-11

## Context

Plugins (widget mappers, package adapters, generators, passes, verifiers) execute on the hottest path
in the compiler — emission — and they are the extension surface the platform is built to encourage.

## Decision

Plugins run **in-process**, but **capability-scoped**: the host hands each plugin narrow interfaces
(VFS, diagnostics, query access) and nothing else. `fs` and `fetch` are lint-banned inside plugin
packages, and the conformance suite runs plugins under a Node permission-model harness to catch
escapes. Full isolate/subprocess sandboxing is **deferred**.

## Alternatives considered

- **Isolate/subprocess sandboxing per plugin.** Pays serialization overhead on every emitted node and
  complicates the SPI, in exchange for defending against an adversary we do not currently have.

## Threat model (explicit)

The realistic risk is **accidental nondeterminism or stray I/O** by a well-meaning plugin author, not
a malicious plugin. Scoped interfaces, lint bans, and the determinism double-run in the conformance
suite address exactly that.

## Consequences

- A misbehaving plugin can, in principle, still reach around the host. This is accepted while plugin
  distribution stays inside the organization's registry.
- The SPI stays synchronous and cheap, which keeps emitters simple.

## Revisit trigger

Third-party plugin distribution opens beyond the internal registry.
