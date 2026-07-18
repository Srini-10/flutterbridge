// The runtime capability registry — the one place that knows which package the emitted code runs against.
//
// ## The duplication this removes
//
// `'@bridge/runtime-react'` was a `const RUNTIME` in `component.ts` and another in `expression.ts`, and the
// list of widget names in the "supported today" diagnostic was a *third* hand-kept copy of `WIDGET_MAP`'s
// keys — which had already drifted, still naming M3-B's seven after M4-A added eight more. Each copy was
// individually reasonable and collectively the thing ADR-18 is written against, in miniature: one fact,
// restated, with no mechanism to keep the statements in step.
//
// So the specifier is stated once, here, and everything a generated file reaches for goes through one of the
// four functions below. A second kit — or a version bump that renames the package — is one edit.
//
// ## What a "capability" is, and why the map declares them
//
// A `WidgetMapping` used to say only *which component to render*. Everything else a widget needed from the
// runtime was implicit: `Padding` needs `EdgeInsets` to exist, `Align` needs `Alignment`, `Divider` needs the
// theme to define `outlineVariant`. Implicit needs are unverifiable needs — the `Divider` case failed at
// runtime in a browser, as `BRG4006`, because nothing at build time knew it had a requirement at all.
//
// A capability is that requirement, made declarative. `roles: ['outlineVariant']` on the mapping is checked
// against the program's own `app.Token` set before a byte is emitted (`BRG3010`); `valueTypes` are imported
// without the emitter naming them. Adding a widget stays two edits — a runtime component and a map entry —
// and the map entry now carries enough for the generator to *verify* the pairing rather than assume it.

import type { ModuleBuilder } from './module.js';

/**
 * The runtime kit generated applications import from.
 *
 * ADR-6's subject: emitted code targets a versioned package rather than inlining its behaviour, so a kit
 * release fixes every converted application without regenerating any of them. ADR-22 names this specifier as
 * a generator's `runtimeRange` — the semver range it declares compatibility with — and the M4 verifier
 * enforces the pairing. One constant, so the two cannot disagree.
 */
export const RUNTIME_MODULE = '@bridge/runtime-react';

/**
 * Declares that the file needs a runtime export, and returns the local name to write.
 *
 * The single door to the kit. Emitters call this rather than `module.use(RUNTIME, …)` so that the specifier
 * appears in exactly one file — and so a future kit split (`@bridge/runtime-react/layout`) is a change here
 * rather than a search across every emitter.
 *
 * @param module - the file being written.
 * @param name - the exported name, e.g. `Column`, `useSignal`, `EdgeInsets`.
 * @returns the local name.
 */
export function useRuntime(module: ModuleBuilder, name: string): string {
  return module.use(RUNTIME_MODULE, name);
}

/**
 * Declares a type-only dependency on a runtime export.
 *
 * Separate from {@link useRuntime} because the import block groups them differently: a type-only name folds
 * into `import { type X, Y }` and carries no runtime cost. `ModuleBuilder.use` widens a type-only import to a
 * value one if the same name is later needed as a value, so asking for both is safe in either order.
 *
 * @param module - the file being written.
 * @param name - the exported type name, e.g. `ThemeDescriptor`.
 * @returns the local name.
 */
export function useRuntimeType(module: ModuleBuilder, name: string): string {
  return module.use(RUNTIME_MODULE, name, { typeOnly: true });
}

type Node = Record<string, unknown>;

/**
 * Whether a constructed type is provided by the runtime kit, and so must be imported from it.
 *
 * Decided from the type's own **library**, not a hand-kept list of names: `EdgeInsets` resolves to
 * `package:flutter/…` and the kit mirrors it; `Product` resolves to the application's own package and does
 * not. A kit value type added later — `Alignment`, `BoxConstraints` — needs no change here, which is the
 * property that makes "one runtime component, one map entry, nothing else" true for value types too.
 *
 * A framework type the kit does *not* export is caught the moment the build-proof typechecks real output
 * (`TS2305`), which is what that test is for. This was validation defect D2, fixed by asking the library
 * rather than a list.
 *
 * @param type - the `TypeRef` of a `logic.New`.
 * @returns whether the kit provides it.
 */
export function isKitProvided(type: Node | undefined): boolean {
  const library = type?.['library'];
  return typeof library === 'string' && library.startsWith('package:flutter/');
}
