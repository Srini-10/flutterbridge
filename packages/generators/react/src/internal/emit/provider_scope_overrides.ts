// `ProviderScope(overrides: [...])` at the application root (`docs/m14/riverpod-usage-matrix.md` §4h).
//
// ## Why `main()`'s own body, when nothing else here ever reads it
//
// `project.ts`'s own `needsRiverpod` doc is explicit: "root discovery starts from `MaterialApp`, not from
// `runApp`'s argument" — a deliberate choice, because the *navigable structure* of the app (which routes
// exist, what renders where) must not depend on how a program happened to wrap its root widget. `overrides:`
// is a different question: it names no UI and produces no route. It is the one piece of `main()`'s own body
// this generator has a reason to read — not to discover structure, but because it is the only place Riverpod
// lets a program say "start this provider with a different value/create than its own declaration says."
//
// ## Why this is a narrow, bounded read, not "model `main()`"
//
// This looks for exactly one shape: `runApp(<a ProviderScope construction>)`, reached directly from `main()`'s
// own top-level statements — the only shape either real corpus uses (both call `runApp` once, synchronously,
// as `main()`'s own last statement or inside a `try`). It does not walk arbitrary control flow, does not
// resolve `main()`'s own locals, and does not attempt to model `main()`'s own `async`/`await` — see the file
// header's own account of exactly where that stops.
//
// ## What "sound" means here, and why nothing has to decide it explicitly
//
// Each override element is lowered by the *ordinary*, general `emitExpression` — the same function a
// provider's own `create` callback or a component's own render tree uses — against a scope that has never
// heard of `main()`'s own locals (there is no `fieldScope`-style rebinding here, unlike a top-level constant's
// own initializer). A reference to something `main()` alone declares — `prefs`, from `final prefs = await
// SharedPreferences.getInstance();` — is therefore an *ordinary* undeclared reference, and
// `expression.ts`'s own existing fallback (`` `${name}` is not declared in this program ``) reports it and
// returns its own `REFUSED` marker, exactly as it would for any other unresolvable name. Nothing here has to
// detect "this override depends on an async local set up before `runApp` was called" specially — the
// generator already refuses an unresolvable reference precisely, wherever it is written, and this reuses that
// rather than adding a second way to say the same thing.
//
// A refusal here reports an error like any other, so the whole-program gate (`pipeline.ts`'s own check, after
// every emitter has run) is what actually stops generation — this module does not special-case "some
// overrides failed" into a partial success; a real app whose only unsupported override is `appPreferencesProvider`
// still fails to generate, honestly, rather than shipping with that one override silently missing. What this
// module changes is *why* it fails: a precise, per-override diagnostic, never total silence.
//
// A program calling a top-level *function* that returns an `Override` (`loginAsHintProvider.overrideWith(...)`
// wrapped in a helper like App B's own `loginAsHintSeed()`) is refused the identical way — the callee was
// never independently reached by `emitFunctionModules`'s own walk (which starts from render trees and
// actions, not `main()`), so it resolves as an ordinary unreached reference. Inlining a zero-argument helper's
// own body here, the way a widget-returning helper already is (ADR-0062), is a real, bounded next step, not
// attempted this milestone — named in `docs/m14/riverpod-usage-matrix.md` §4h, not silently worked around.

import type { AnyUirNode } from '@bridge/uir';

import { ModuleBuilder } from './module.js';
import { emitExpression, type EmitScope } from './expression.js';

type Node = Record<string, unknown>;

const asArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);
const kindOf = (node: Node): string => (typeof node['kind'] === 'string' ? (node['kind'] as string) : '<unknown>');

/** `ProviderScope`'s own declaring library — the same check `package_kit.ts`'s riverpod table itself relies on. */
const PROVIDER_SCOPE_LIBRARY = 'package:flutter_riverpod/src/framework.dart';

/** What extracting `main()`'s own root `ProviderScope(overrides: [...])` produced. */
export interface RootProviderScopeOverrides {
  /** Each override element, already lowered to TS text (`"compiledBrandDefaultsProvider.overrideWithValue(...)"`) — in source order. */
  readonly texts: readonly string[];
  /** The import lines the lowered texts need, rendered — spliced into `app/providers.tsx` verbatim, the same way `app/page.tsx`'s own dynamic imports already are. */
  readonly imports: readonly string[];
}

/**
 * The analyzed project's own `main()` — its top-level `logic.FunctionDecl`, whose own `span.file` carries no
 * `package:` prefix (a real Dart workspace can put more than one `main` in one analyzed document: a pub
 * *workspace* resolves sibling apps' packages onto the same dependency graph, and a declaration reached only
 * transitively — never called, never imported by the analyzed project's own code — is still extracted, per
 * this analyzer's own "every declaration in the graph" discipline. Confirmed directly against real App B:
 * `apps/customer`'s own analyzed document carries both `lib/main.dart`'s own `main()` *and*
 * `package:admin/main.dart`'s — a sibling app in the same workspace, reached transitively, never customer's
 * own root). A file reached as a dependency is always `package:<name>/...`; the analyzed project's own files
 * never carry that prefix — the same distinction `registry.isFrameworkLibrary`-style checks elsewhere in this
 * generator already rely on, applied here to tell two same-named top-level functions apart.
 */
function findMain(nodes: readonly AnyUirNode[]): Node | undefined {
  for (const node of nodes as unknown as Node[]) {
    if (kindOf(node) !== 'logic.FunctionDecl' || node['name'] !== 'main') continue;
    const file = (node['span'] as Node | undefined)?.['file'];
    if (typeof file === 'string' && !file.startsWith('package:')) return node;
  }
  return undefined;
}

/** Every `logic.Call`/`logic.MethodCall` node reachable from `value` by ordinary structural descent (no lambda/control-flow skipping — `main`'s own body is small and linear). */
function findRunAppArgument(value: unknown): Node | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRunAppArgument(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (value === null || typeof value !== 'object') return undefined;
  const node = value as Node;
  if (kindOf(node) === 'logic.Call') {
    const callee = node['callee'] as Node | undefined;
    if (callee?.['name'] === 'runApp') {
      const args = asArray(node['args']);
      return args[0] as Node | undefined;
    }
  }
  for (const child of Object.values(node)) {
    const found = findRunAppArgument(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * The raw `elements` of `main()`'s own root `ProviderScope(overrides: [...])` list, or `undefined` when
 * `main()` calls `runApp` with something other than a direct `ProviderScope(...)` construction, or that
 * construction has no `overrides` argument, or an empty one.
 *
 * Exported separately from {@link rootProviderScopeOverridesOf} so `functions.ts`'s own `reachableFunctions`
 * can seed its reachability walk from the identical list — a provider (or a helper function returning an
 * `Override`) referenced *only* from an override, never from a component or an action, would otherwise never
 * be found reachable and so never be emitted, which `provider_scope_overrides.ts`'s own lowering would then
 * (correctly, but confusingly) report as an ordinary unresolved reference. Finding the list is cheap and has
 * no side effect, so computing it twice (once for reachability, once for lowering) costs nothing worth
 * sharing more tightly for.
 */
export function rootProviderScopeOverrideElements(nodes: readonly AnyUirNode[]): readonly Node[] | undefined {
  const main = findMain(nodes);
  if (main === undefined) return undefined;
  const argument = findRunAppArgument(main['body']);
  if (argument === undefined || kindOf(argument) !== 'logic.New') return undefined;
  const type = argument['type'] as Node | undefined;
  if (type?.['library'] !== PROVIDER_SCOPE_LIBRARY || type?.['name'] !== 'ProviderScope') return undefined;
  const overridesArg = (argument['namedArgs'] as Record<string, Node> | undefined)?.['overrides'];
  if (overridesArg === undefined || kindOf(overridesArg) !== 'logic.ListLit') return undefined;
  const elements = asArray(overridesArg['elements']) as Node[];
  return elements.length === 0 ? undefined : elements;
}

/**
 * `main()`'s own root `ProviderScope(overrides: [...])`, lowered — `undefined` for the same reasons
 * {@link rootProviderScopeOverrideElements} is. `providersModulePath` is `app/providers.tsx`'s own path, so
 * imports the lowered overrides need resolve relative to the file they will actually be spliced into.
 */
export function rootProviderScopeOverridesOf(
  nodes: readonly AnyUirNode[],
  scope: EmitScope,
  providersModulePath: string,
): RootProviderScopeOverrides | undefined {
  const elements = rootProviderScopeOverrideElements(nodes);
  if (elements === undefined) return undefined;

  const scratch = new ModuleBuilder(providersModulePath);
  const scratchScope: EmitScope = { ...scope, module: scratch };
  const texts = elements.map((element) => emitExpression(element, scratchScope));
  return { texts, imports: scratch.importLines() };
}
