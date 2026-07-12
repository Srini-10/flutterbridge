// The TypeScript catalog — what the compiler's widget registry consumes.
//
// A **subset** of the JSON, and deliberately so: the compiler needs slots, children and transparency.
// It has no use for `componentBases` or `lifecycle` — those are facts about how a *frontend* reads
// source, and the compiler never reads source. Generating each domain the subset it needs is not a
// compromise; it is the point.

import type { Catalog } from './model.js';

export function generateTypeScript(catalog: Catalog): string {
  const widgets = catalog.widgets
    .map((w) => {
      const parts = [`name: ${JSON.stringify(w.name)}`, `library: LIBRARY`];
      if (w.slots) parts.push(`slots: ${JSON.stringify(w.slots)}`);
      if (w.childrenProp) parts.push(`childrenProp: ${JSON.stringify(w.childrenProp)}`);
      if (w.transparentWithoutProps)
        parts.push(`transparentWithoutProps: ${JSON.stringify(w.transparentWithoutProps)}`);
      return `  { ${parts.join(', ')} },`;
    })
    .join('\n');

  return `// GENERATED CODE — DO NOT EDIT.
//
// Generated from catalog/widgets/${catalog.catalog}.json by tools/catalog-codegen.
//
// Framework metadata is authored **once** and generated into both language domains (ADR-18). To change
// what the compiler knows about a widget, change the JSON.

import type { BridgePlugin, WidgetCatalog, WidgetSpec } from '@bridge/plugin-sdk';

const LIBRARY = ${JSON.stringify(catalog.library)};

const WIDGETS: readonly WidgetSpec[] = [
${widgets}
];

/** The ${catalog.catalog} widget catalog. */
export const ${catalog.catalog}Catalog: WidgetCatalog = {
  name: ${JSON.stringify(catalog.catalog)},
  priority: ${catalog.priority},
  widgets: WIDGETS,
};

/** The plugin the compiler's host loads at runtime. */
export const ${catalog.catalog}Widgets: BridgePlugin = {
  name: '@bridge/widgets-${catalog.catalog}',
  version: '0.0.0',
  widgets: ${catalog.catalog}Catalog,
};

export default ${catalog.catalog}Widgets;
`;
}
