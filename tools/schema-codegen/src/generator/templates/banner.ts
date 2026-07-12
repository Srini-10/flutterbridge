/**
 * The header stamped onto every generated file.
 *
 * It carries no timestamp and no machine name. A generated file whose content changes because it was
 * generated at a different moment is not deterministic (D1–D5), and every diff of it is noise.
 */

/** The banner for a generated file in [language], produced from schema version [uirVersion]. */
export function banner(uirVersion: string): string {
  return [
    '// GENERATED CODE — DO NOT EDIT',
    '//',
    '// Produced by tools/schema-codegen from packages/uir/schema/*.json.',
    `// UIR schema version: ${uirVersion}`,
    '//',
    '// Edit the schema and re-run `pnpm codegen`. Hand-edits to this file are lost on the next run,',
    '// and CI fails if this file does not match the schema (drift check).',
  ].join('\n');
}
