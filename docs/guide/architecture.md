# Architecture overview

```text
Flutter project
     │
     ▼  bridge analyze          Dart — reads the resolved element model (ADR-2)
   UIR  (.bridge/uir.ndjson)    a layered IR: ui.* logic.* bind.* sig.* app.* l0.*
     │
     ▼  N1 … N11                TypeScript — target-neutral normalization
 normalized UIR
     │
     ▼  bridge generate         a plugin, loaded at runtime (ADR-22)
 EmittedFile[]  →  the CLI writes them
     │
     ▼  tsc                     against the real runtime kit
 a Next.js project
```

## Why the analyzer is a separate program

It needs Dart's resolved element model — what a type *is*, not what it is spelled. Recognition is by
resolved supertype, never by name: C1's evidence is that name-based recognition misclassified 18 widgets,
and M5-A found the last surviving instance of it (a `MaterialColor` is a `Color`, and an exact name test
said otherwise).

## Why there is an IR at all

So that a second target costs a generator, not a compiler. The passes N1–N11 are target-neutral: `N7` does
not contain the word `Container`, it asks a catalog. A Vue generator would reuse all of it.

## Where knowledge lives

| Fact | Where | Enforced by |
| --- | --- | --- |
| what a widget *is* — slots, children, transparency | `catalog/widgets/*.json`, generated into every domain | ADR-18, `codegen:check` |
| what a package's widgets are | one catalog + one adapter + one registry line | ADR-18 |
| what a target *renders* | the generator's own widget map | Spec §1.2 rule 2 |
| Material's constants | the catalog, transcribed from the SDK with a file:line citation each | INV-20 (ADR-13) |

## Invariants worth knowing

- **INV-4** — nothing is invented. A construct with no faithful lowering is refused, with a reason.
- **INV-17** — the CLI contains no compilation logic. It orchestrates.
- **INV-19 / ADR-15** — no module-scope mutable state. A module is shared across every request on a server.
- **INV-20 / ADR-13** — every colour a mapped widget paints resolves to a token. A literal colour in
  emitted output is a compiler bug.
- **INV-22** — no framework runtime primitive survives extraction.

## Determinism

The same source produces byte-identical output, and `normalize(normalize(x)) == normalize(x)`. Both are
contracts rather than implementation details, and `bridge validate` checks them on *your* project — not
only in this repository's tests.

## Further reading

- [`docs/architecture/compiler.md`](../architecture/compiler.md) — the pass pipeline in detail
- [`docs/adr/`](../adr/) — every architectural decision, with the evidence for it
- [`docs/m4/`](../m4/), [`docs/m5/`](../m5/) — milestone reports: what was built, and what was refused
