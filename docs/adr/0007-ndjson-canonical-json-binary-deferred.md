# ADR-7 — NDJSON + canonical JSON; binary encoding deferred

- **Status:** Accepted (frozen, Specification v2.0 §2.5)
- **Date:** 2026-07-11

## Context

UIR crosses a process boundary (Dart → Node) on every build, is cached content-addressably, and is the
artifact engineers will stare at when something goes wrong.

## Decision

- **Wire format:** NDJSON, one node per line, partitioned per layer (`program.l1.ndjson`, …) so a
  consumer can stream and load only the layers it needs.
- **Canonical form (hashing/caching only):** RFC 8785-style canonical JSON — sorted keys, a fixed
  number-serialization rule, no float/int ambiguity.
- **Binary encoding (FlatBuffers): deliberately deferred**, behind the reader interface.

## Rationale

A human-debuggable IR is worth more in the first three years than FlatBuffers throughput, and
layer-partitioned streaming already answers the memory concern.

## What must be perfect on day one

The **canonical-form and `nodeId` rules**. Node IDs are permanent: they key overrides, caches,
incrementality, and AI provenance. The wire format can be swapped later behind the reader interface;
the hashing rule cannot. Hence hash-stability goldens and property tests are written *before* the
implementation (Blueprint §10, step 4).

## Consequences

- Larger artifacts and slower parse than a binary format. Accepted.
- Any future binary encoder must produce the same `nodeId`s from the same canonical form.
