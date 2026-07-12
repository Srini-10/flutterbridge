# The UIR schema

**This directory is the single source of truth for the Universal Intermediate Representation.**

Every UIR model in the repository — Dart and TypeScript — is generated from these files by
`tools/schema-codegen`. Neither language domain hand-writes a UIR type (Spec §2.5), and CI fails if a
generated file no longer matches the schema.

**To change the UIR, change the schema.** Then run `pnpm codegen` and commit the result.

## Files

| File | Layer | Contains |
| --- | --- | --- |
| `shared.json` | — | `NodeId`, `Anchor`, `SourceSpan`, the node base contract, `WidgetRef`, `TypeRef`, the reserved `BRG23xx` diagnostic codes |
| `l0.json` | L0 source | the file table, with the API/impl fingerprints incremental compilation depends on |
| `l1.json` | L1 semantic | declarations, statements, expressions |
| `l2.json` | L2 UI | components, render trees, bindings, layout intent |
| `l3.json` | L3 application | routes, the signal graph, stores, endpoints, design tokens |

Layers are loaded independently: an OpenAPI generator reads L3 and never parses an expression.

## Every node carries

`id` (content-addressed, permanent), `kind` (the discriminant every union dispatches on), and `span`.
Optionally `anchor` (the override key) and `ext` (plugin data, round-tripped untouched).

**Array order is semantic.** Children appear in the order they appear on screen, and serialization,
equality and both generators all preserve it.

## The dialect

The files are valid JSON Schema 2020-12, but the generator understands a deliberately small subset of
it. A general JSON Schema compiler is a research project; a constrained dialect is a tool.

| Construct | Meaning |
| --- | --- |
| `{"type": "object", "x-uir-kind": "ui.Element"}` | a **node** — gets the base fields and a `kind` const |
| `{"oneOf": [...], "x-uir-union": true}` | a sealed union (Dart `sealed class`, TS discriminated union) |
| `{"enum": [...], "x-uir-enum-docs": {...}}` | a string enum; **every value must be documented** |
| `{"allOf": [{"$ref": base}, {inline}]}` | object extension; flattened away before generation |
| `{"type": "array", "items": ...}` | an ordered list |
| `{"type": "object", "additionalProperties": S}` | a string-keyed map |

Anything outside the dialect is **rejected**, not half-supported.

## What the validator rejects

Duplicate names · duplicate `kind`s · dangling `$ref`s · non-node union variants · a node in two
unions · invalid or undocumented enums · **missing documentation** on any definition or field ·
nodes missing `id`/`kind`/`span` · **reserved names** · **unconstructible cycles**.

Two of those rules exist because they caught real bugs while this schema was being written:

- **Reserved names.** A field called `override` shadows Dart's `@override` annotation inside its own
  class. A field called `constructor` is `Object.prototype.constructor` in JavaScript, so
  `o.constructor` is *never* `undefined` and an optional field by that name can never be seen as
  absent. Both produced code that compiled or parsed into nonsense. Neither can recur.
- **Unconstructible cycles.** Recursion is fine — an AST *is* recursion, and `Binary.left` is an
  `Expr` that includes `Binary`. What is rejected is a type none of whose paths terminate. The
  validator computes constructibility as a fixed point rather than banning cycles outright.

## Versioning

`x-uir-version` in `shared.json` is the schema version, and it is stamped into both generated
libraries. Changes ship with a migration module (Spec §2.4). Additive changes — a new optional field,
a new node kind — are a minor version; every generator must treat an unknown `kind` as opaque, which
is what lets the schema grow without breaking a generator someone else maintains.

## Amendments carried (Spec v2.1)

| Amendment | Where |
| --- | --- |
| **ADR-11 / N11** — cross-route state promotion | `StoreOrigin` (`declared` \| `promoted`), `SignalScope` (`component` \| `store`), `RouteTransition`, `RouteArgument.transport` |
| **ADR-11a** — route object transport | `RouteArgumentTransport.objectTransport` + `BRG2301` |
| **ADR-13** — derived Material colour roles | `MaterialRole` (the full M3 role set) and `Token`. **No colour is ever guessed.** |
| **A3** — layout intent | `LayoutIntent` (`widthIntent`, `heightIntent`, `tier`) — an optional field on `UiElement`, changing no existing node semantics |
