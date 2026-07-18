// The asset pipeline — every asset the program references, collected once and emitted as a manifest.
//
// ## What an asset reference looks like by the time it reaches here
//
// Two shapes, both established by running the real analyzer (the M4-C probe):
//
//     Image.asset('images/logo.png')          →  ui.Element Image, props.name = bind.Const 'images/logo.png'
//     Image(image: AssetImage('images/bg…'))  →  props.image = bind.Expr → logic.New AssetImage('images/bg…')
//
// The first is a widget prop the catalog named (ADR-0023); the second is a constructed provider. They are
// different node shapes carrying the same fact, so both are walked — and neither is special-cased by widget
// *name*: the first comes from `WidgetMapping.assetProps`, the second from the constructed type's own name.
// Registering a new asset-bearing widget is a line in the widget map, and a new provider is a line below.
//
// ## Why the manifest is built from references rather than from the pubspec
//
// Flutter's own `AssetManifest.json` is generated from the `assets:` section of `pubspec.yaml`. This one
// cannot be: ADR-22 makes `generate` a pure function that returns `EmittedFile[]` and forbids it reading the
// filesystem, and the analyzer does not currently carry the pubspec's asset list into UIR — `Pubspec.load`
// reads `name`, `dependencies` and the SDK constraints, and nothing else.
//
// So the manifest maps every *referenced* key to the URL the generated app serves it at, and a referenced
// asset that no file backs is a 404 rather than a build error. That is a real limit and it is stated rather
// than papered over: closing it means teaching the analyzer to emit declared assets, which is analyzer work
// with no schema change, and it is recorded as such rather than approximated here.
//
// ## Determinism
//
// Keys are sorted before emission, so the manifest's bytes do not depend on the order the tree was walked —
// the same rule the import block and the token list follow, for the same reason.

import { GeneratorDiagnosticCode } from '../diagnostics/codes.js';
import type { EmitScope } from './expression.js';
import { mappingOf } from './widgets.js';

type Node = Record<string, unknown>;

const kindOf = (node: Node): string => (typeof node['kind'] === 'string' ? node['kind'] : '');
const idOf = (node: Node): string | undefined => (typeof node['id'] === 'string' ? node['id'] : undefined);

/**
 * Constructed providers whose first positional argument is an asset key.
 *
 * `NetworkImage` and `MemoryImage` are deliberately absent: a URL is not an asset and bytes are not a file,
 * so neither belongs in a manifest of things the app must ship.
 */
const ASSET_PROVIDERS: ReadonlySet<string> = new Set(['AssetImage', 'ExactAssetImage']);

/** Where the generated app serves its assets from, and the prefix the manifest's URLs carry. */
const PUBLIC_PREFIX = '/assets/';

/** An asset the program references. */
export interface AssetReference {
  /** The key as the Dart source wrote it — `images/logo.png`. */
  readonly key: string;
  /** The URL the generated app serves it at. */
  readonly url: string;
}

/**
 * Every asset the program references, sorted by key.
 *
 * Walks the whole program once rather than per component: an asset referenced from two screens is one entry,
 * and the manifest is a property of the application rather than of any file in it.
 *
 * @param nodes - the program's nodes.
 * @param scope - for reporting an unreadable key.
 * @returns the references, sorted and deduplicated.
 */
export function collectAssets(nodes: readonly Node[], scope: EmitScope): readonly AssetReference[] {
  const keys = new Set<string>();

  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value === null || typeof value !== 'object') return;
    const node = value as Node;

    if (kindOf(node) === 'ui.Element') {
      const widget = String((node['component'] as Node | undefined)?.['name'] ?? '');
      const mapping = mappingOf(widget);
      const props = (node['props'] ?? {}) as Record<string, unknown>;
      for (const prop of mapping?.assetProps ?? []) {
        const binding = props[prop] as Node | undefined;
        if (binding === undefined) continue;
        const key = constantString(binding);
        if (key === undefined) {
          scope.report(
            GeneratorDiagnosticCode.UnresolvableAsset,
            'error',
            `\`${widget}.${prop}\` is an asset key the generator cannot read as a constant, so it cannot ` +
              `go in the manifest. An asset missing from the manifest becomes a broken image at runtime, ` +
              `which looks like a slow network rather than a defect — so it is refused here instead. A ` +
              `computed asset path needs an override.`,
            idOf(node),
          );
          continue;
        }
        keys.add(key);
      }
    }

    // A constructed provider — `AssetImage('images/bg.png')`. Recognised by the *type* it constructs, not by
    // the widget that holds it, so a provider assigned to a variable and passed around is found too.
    if (kindOf(node) === 'logic.New' && ASSET_PROVIDERS.has(String(node['typeName'] ?? ''))) {
      const args = Array.isArray(node['args']) ? (node['args'] as Node[]) : [];
      const first = args[0];
      const key = first === undefined ? undefined : literalString(first);
      if (key === undefined) {
        scope.report(
          GeneratorDiagnosticCode.UnresolvableAsset,
          'error',
          `\`${String(node['typeName'])}\`'s asset key is not a constant, so it cannot go in the manifest.`,
          idOf(node),
        );
      } else {
        keys.add(key);
      }
    }

    for (const child of Object.values(node)) visit(child);
  };

  for (const node of nodes) visit(node);

  return [...keys]
    .sort()
    .map((key) => ({ key, url: `${PUBLIC_PREFIX}${key}` }));
}

/** The string a `bind.Const` carries, or `undefined` if the binding is not a constant string. */
function constantString(binding: Node): string | undefined {
  if (kindOf(binding) !== 'bind.Const') return undefined;
  return typeof binding['value'] === 'string' ? binding['value'] : undefined;
}

/** The string a `logic.Lit` carries, or `undefined`. */
function literalString(node: Node): string | undefined {
  if (kindOf(node) !== 'logic.Lit') return undefined;
  return typeof node['value'] === 'string' ? node['value'] : undefined;
}

/**
 * The manifest module's source.
 *
 * A plain data module — the kit consumes descriptors, not UIR (ADR-19), and an asset manifest is about as
 * plain as a descriptor gets.
 *
 * @param assets - the references, already sorted.
 * @param manifestName - the exported name.
 * @returns the file's body lines, for a `ModuleBuilder`.
 */
export function assetManifestLines(
  assets: readonly AssetReference[],
  manifestName: string,
): readonly string[] {
  const lines: string[] = [
    `/** Every asset the program references, keyed as the Dart source named it. */`,
    `export const ${manifestName}: AssetManifest = {`,
    '  assets: {',
  ];
  for (const asset of assets) {
    lines.push(`    ${JSON.stringify(asset.key)}: ${JSON.stringify(asset.url)},`);
  }
  lines.push('  },', '};');
  return lines;
}
