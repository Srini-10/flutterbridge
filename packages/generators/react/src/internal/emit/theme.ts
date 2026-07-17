// The theme emitter — `app.Token` → a `ThemeDescriptor`.
//
// ## The projection ADR-19 asks for
//
// > `app.Token` carries `id`, `span`, `anchor` and `ext` — content-addressed identity and source provenance,
// > which exist so the compiler can attribute diagnostics and dedupe nodes. A runtime resolving `surface` for
// > a hovered button needs `name → value`. The kit's input is the *projection*, and projecting is the
// > generator's job.
//
// This is that projection, and it is the whole emitter: `{ name, group, light, dark }`, sorted by name.
//
// ## What it must not do
//
// **Not derive anything.** ADR-13 is explicit that the palette is compile-time work, done by N10 with
// `material_color_utilities` — the same package Flutter uses — because *"deriving at runtime would mean
// re-implementing Material's algorithm inside every kit"*. It would be no better here: a second derivation in
// the generator is a second answer, and ADR-13 measured what guessed colours cost (up to 15/255 per channel).
// If N10 emitted three tokens, three tokens are emitted.
//
// **Not reformat a colour.** The values pass through verbatim. An eight-digit value is ARGB and a six-digit
// one is RGB (ADR-21); the kit knows that, and re-encoding here would be a third place that has to.

import { GeneratorDiagnosticCode } from '../diagnostics/codes.js';
import type { EmitScope } from './expression.js';
import { stringLiteral } from './expression.js';
import type { ModuleBuilder } from './module.js';

type Node = Record<string, unknown>;

const RUNTIME = '@bridge/runtime-react';

/**
 * Emits the theme descriptor.
 *
 * @param tokens - every `app.Token` in the program.
 * @param module - the file to write into.
 * @param scope - reporting.
 * @returns the exported descriptor's name.
 */
export function emitTheme(tokens: readonly Node[], module: ModuleBuilder, scope: EmitScope): string {
  const typeName = module.use(RUNTIME, 'ThemeDescriptor', { typeOnly: true });
  const exported = module.declare('theme', 'theme');

  // Sorted by name. The program's node order is canonical (kind, then id), and id order is hash order — so
  // emitting in program order would put tokens in an order that looks random and changes when a value does.
  const sorted = [...tokens].sort((a, b) => (String(a['name']) < String(b['name']) ? -1 : 1));

  if (sorted.length === 0) {
    scope.report(
      GeneratorDiagnosticCode.UnsupportedExpression,
      'warning',
      'the program declares no design tokens, so the generated theme is empty. Every colour a mapped ' +
        'widget paints must resolve to a token (INV-20), so any themed component will fail to resolve one.',
    );
  }

  module.line('/** The design tokens, projected from the program\'s `app.Token` nodes (ADR-19). */');
  module.line(`export const ${exported}: ${typeName} = {`);
  module.block(() => {
    module.line('tokens: [');
    module.block(() => {
      for (const token of sorted) {
        module.line(`{ ${tokenFields(token).join(', ')} },`);
      }
    });
    module.line('],');
  });
  module.line('};');
  module.line();
  return exported;
}

/** One token's fields, in a fixed order. */
function tokenFields(token: Node): string[] {
  const fields = [
    `name: ${stringLiteral(String(token['name'] ?? ''))}`,
    `group: ${stringLiteral(String(token['group'] ?? 'color'))}`,
    `light: ${jsonValue(token['light'])}`,
  ];
  // Absent `dark` means the token does not vary by brightness — not that dark is missing. Emitting
  // `dark: undefined` would be the same to the runtime but would say something different to a reader.
  if (token['dark'] !== undefined) fields.push(`dark: ${jsonValue(token['dark'])}`);
  return fields;
}

/**
 * Emits a token value.
 *
 * `light`/`dark` are `unknown` in the schema (`x-uir-json: true`) — the shape varies by group, and a colour is
 * a string while a spacing is a number. They are emitted as they arrived.
 */
function jsonValue(value: unknown): string {
  if (typeof value === 'string') return stringLiteral(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null || value === undefined) return 'null';
  // A structured value (a shadow, a motion curve). `JSON.stringify` is deterministic for a value that came
  // from JSON, because its key order is the order the loader parsed.
  return JSON.stringify(value);
}
