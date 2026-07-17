# ADR-22 — The generator SPI

- **Status:** Accepted (M3-B). Adds the generation half of Spec v2.0 §1.2 rule 2 / ADR-8 to `@bridge/plugin-sdk`.
- **Date:** 2026-07-17

## Context

`@bridge/gen-react` has declared its own public surface since M0, in a comment:

```ts
// BRIDGE-STUB(M2): public surface — reactGenerator: TargetGenerator. See Blueprint §3 M2-T16..T20.
```

**`TargetGenerator` does not exist.** It is named there and nowhere else — not in `plugin-sdk`, not in the
compiler, not in any built artifact. `plugin-sdk` exports exactly three types (`WidgetSpec`,
`WidgetCatalog`, `BridgePlugin`), all about widget metadata. There is no emit path in the plugin host, no VFS
in `@bridge/core` (`export {}`, `BRIDGE-STUB(M2)`), and no orchestrator downstream of normalization.

So M3-B does not implement a contract. It **defines** one. This ADR is that definition.

## The invariant this appears to break, and why it does not

`plugin-sdk`'s header is emphatic:

> **Declarative metadata, never behaviour.** An adapter describes widgets. It does not transform them, and it
> is given no way to. There is no `flatten(node)` here, no `emit(node)`, no callback the compiler invokes —
> only facts.

And `docs/m2/compiler-readiness-report.md` lists as a **passing** architectural check:
*"Plugin SDK carries no behaviour | ✅ types and interfaces only"*.

A generator is, unavoidably, "a callback the compiler invokes". Three things reconcile it:

1. **The rule is about adapters, and says so.** Its subject is "an adapter", and its reason is stated: an
   adapter that could *act* would be a place a framework's assumptions could reach into a target-neutral IR.
   That reasoning is about the **input** side — what may influence normalization. A generator sits on the
   **output** side, after normalization, and by construction cannot influence it: it is handed a finished
   program and returns text.
2. **The check is still true, literally.** "Types and interfaces only" — `TargetGenerator` is an interface.
   `plugin-sdk` still ships zero runtime code and zero behaviour; it declares the *shape* of behaviour that
   lives elsewhere. That is exactly what it already does for `BridgePlugin`, which the host invokes `import()`
   on.
3. **ADR-8 already requires it.** *"Plugins run in-process, but capability-scoped: the host hands each plugin
   narrow interfaces (VFS, diagnostics, query access) and nothing else."* A capability handed to a plugin is
   only meaningful if the plugin does something with it. ADR-8 scopes plugins to include generators and
   presumes this SPI; it was simply never written down.

## Decision

### The generator is a plugin, and `BridgePlugin` grows one optional field

```ts
export interface BridgePlugin {
  readonly name: string;
  readonly version: string;
  readonly widgets?: WidgetCatalog;
  readonly generator?: TargetGenerator;   // new
}
```

Additive and backward-compatible: `@bridge/widgets-material` is unchanged, and `PluginHost`'s duck-type gate
(`name` + `version`) already admits a generator plugin. One loading path, one discovery mechanism, one sort
order. A generator is not a second kind of thing the host must learn about.

### The generator receives a read-only view, not a `Program`

`Program` is a class in `packages/compiler/src/internal/program.ts`, with a private constructor, and
`.dependency-cruiser.cjs` forbids the plugin realm from importing `@bridge/compiler` at all — including
`import type`, because `tsPreCompilationDeps` is on.

So `plugin-sdk` declares **`ProgramView`**: the query half of `Program`, expressed over `@bridge/uir` alone
(the only dependency `plugin-sdk-only-uir` permits).

```ts
export interface ProgramView {
  readonly nodes: readonly AnyUirNode[];
  get(id: NodeId): AnyUirNode | undefined;
  has(id: NodeId): boolean;
  ofKind<K extends AnyUirNode['kind']>(kind: K): readonly Extract<AnyUirNode, { kind: K }>[];
}
```

The compiler's `Program` satisfies it structurally, with no change to the compiler. `with()` and `toNdjson()`
are deliberately absent: a generator that could rewrite the program would be a normalization pass in the wrong
package, and the whole point of ADR-1 is that normalization is shared and target-neutral.

### The generator returns files. It does not write them.

```ts
generate(context: GeneratorContext): GeneratorOutput   // { files: readonly EmittedFile[] }
```

ADR-8: *"`fs` and `fetch` are lint-banned inside plugin packages."* And `.dependency-cruiser.cjs` blocks
`generators/** → core/**`, so a generator could not reach a VFS even if one existed — which it does not
(`@bridge/core` is a stub).

Returning files rather than writing them is not a workaround for the missing VFS; it is better than one, and
should survive it:

- **It makes the generator a pure function.** `generate(program) → files`. Determinism — the property the
  whole milestone is judged on — becomes testable by calling it twice and comparing, with no filesystem, no
  temp directory, and no cleanup. Byte-identical output is an `expect(a).toEqual(b)`.
- **It keeps the decision about *where* bytes land with the host**, which is the only component that knows
  whether this is a build, a dry run, a diff, or an editor preview.

When `@bridge/core`'s VFS lands, it consumes `EmittedFile[]`. The SPI does not change.

### Diagnostics: `BRG3xxx`, and a second `Diagnostic` declaration

`docs/architecture/compiler.md` reserves the ranges: `BRG0xxx` environment, `BRG1xxx` extraction, `BRG2xxx`
normalization, **`BRG3xxx` generation**, `BRG4xxx` verification. `BRG3xxx` is entirely unused. Generation
claims it.

`Diagnostic` already exists — in `packages/compiler/src/internal/diagnostic.ts`, which a generator cannot
import. `plugin-sdk` declares a structurally identical one. **This is duplication, and it is knowingly
accepted for now**, which deserves saying plainly because ADR-18 exists to stop exactly this: *"a fact stated
twice is a fact that will eventually be stated two different ways."*

The mitigation is that the two are structurally identical, so TypeScript makes them mutually assignable and
the orchestrator boundary type-checks; drift produces a compile error, not a silent disagreement. The correct
end state is the compiler re-exporting `plugin-sdk`'s — and the compiler's own `diagnostic.ts` header already
argues for it: *"A shared vocabulary belongs beneath the things that share it, not inside one of them."* That
is a one-line change to a package M3-B is instructed not to touch, and it belongs at the **M3-T6 SPI freeze**
(ADR-10: *"UIR 1.0.0 and SPI 1.0.0 are frozen only after this falsification, never before"*), where the SPI is
reviewed as a whole. Recorded here so it is a scheduled decision and not an accident.

### An `error` disqualifies the program

The compiler's severity semantics are already written (`docs/architecture/compiler.md`):

> **error** — the program is not fit to generate from. Something would have to be invented.

So `generate` refuses a program carrying an `error`-severity diagnostic rather than emitting a
best-effort project. A generator that emits from a program with a hole in it produces an application that
compiles and is wrong, which is worth less than no application at all.

### `runtimeRange` becomes a field

ADR-6 requires it — *"Generated code may only use public kit entrypoints within the generator's declared
`runtimeRange` (INV-12, INV-13)"* — and it is declared nowhere. `TargetGenerator.runtimeRange` is a semver
range naming the kit the emitted code is written against. M3-B states it; enforcing it against the kit's
actual version is the verifier's job (M4).

## Consequences

- **`plugin-sdk` is now the wall for both directions**: what a plugin may *say* about widgets, and what a
  plugin may *do* on the way out. Both remain interfaces; the package still has no runtime code.
- **The compiler is unchanged.** No orchestrator is added here. `PassManager` still stops at normalization, and
  wiring `bridge build` is M2-T21/M4 work. M3-B's generator is invoked directly, by its tests, as a pure
  function — which is what makes it testable before the host that will call it exists.
- **A second generator falsifies this SPI cheaply**, which is ADR-10's whole plan: `gen-storybook` and
  `gen-openapi` at M3 with *zero* diffs to `@bridge/compiler` and `@bridge/core`. This SPI is designed so that
  is possible — it mentions nothing about React.
