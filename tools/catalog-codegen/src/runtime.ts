// The runtime kit's Material metadata — the numbers a component is not allowed to remember.
//
// ## Why a third target
//
// ADR-18: *"Every framework catalog originates from a single declarative source and is generated into every
// runtime that needs it."* The analyzer needs slots and positional names, the compiler needs transparency —
// and the **kit** needs Material's own constants, because INV-20 (ADR-13) forbids a kit component from
// holding a literal and M4-A proved the cost of the alternative by shipping a hard-coded divider colour that
// was invisible in dark mode.
//
// Colours are not here: those resolve through the theme, from `app.Token`s the compiler derives. What is here
// is everything Material fixes and no palette can supply — state layer opacities, the elevation tint curve,
// icon geometry, per-component shape and spacing defaults.
//
// ## Why this does not make the kit depend on the workspace
//
// It does not import anything. `.dependency-cruiser.cjs` forbids a runtime kit reaching into another
// workspace package; a *generated file inside the kit* is source the kit owns, exactly as
// `packages/uir/src/generated/` is source that package owns. `codegen-check` fails CI if it drifts from the
// JSON, which is what keeps the single source single.

import type { Catalog } from './model.js';

const num = (value: number): string => (Number.isInteger(value) ? value.toFixed(1) : String(value));

/** One `key: value` line of a record, sorted so the emitted bytes do not depend on JSON key order. */
function entries(record: Readonly<Record<string, number | string>>, indent: string): string {
  return Object.entries(record)
    .filter(([key]) => !key.startsWith('$'))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => {
      const text = typeof value === 'number' ? num(value) : JSON.stringify(value);
      return `${indent}${JSON.stringify(key)}: ${text},`;
    })
    .join('\n');
}

export function generateRuntime(catalog: Catalog): string {
  const curves = Object.entries(catalog.curves ?? {})
    .filter(([name]) => !name.startsWith('$'))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, css]) => `  ${JSON.stringify(name)}: ${JSON.stringify(css)},`)
    .join('\n');

  const material = catalog.material;
  if (material === undefined) {
    throw new Error(`${catalog.catalog}: no "material" section; the runtime kit target needs one`);
  }

  const stops = material.elevationOverlay.stops
    .map((stop) => `  { elevation: ${num(stop.elevation)}, opacity: ${num(stop.opacity)} },`)
    .join('\n');

  const components = Object.entries(material.components)
    .filter(([name]) => !name.startsWith('$'))
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([name, fields]) => `    ${JSON.stringify(name)}: {\n${entries(fields, '      ')}\n    },`)
    .join('\n');

  return `// GENERATED CODE — DO NOT EDIT.
//
// Generated from catalog/widgets/${catalog.catalog}.json by tools/catalog-codegen.
//
// Material's own constants, transcribed from the Flutter SDK (${material.flutterVersion}) into the catalog and
// generated here. INV-20 (ADR-13) forbids a kit component holding a literal; this is where the numbers live
// instead. To change one, change the JSON — and cite the SDK line it came from, as every value there does.

/** One stop on M3's elevation → surface-tint-opacity curve. */
export interface ElevationStop {
  /** The elevation, in logical pixels. */
  readonly elevation: number;
  /** The surface tint's opacity at that elevation, 0–1. */
  readonly opacity: number;
}

/**
 * State layer opacities, by interaction.
 *
 * \`dragged\` is absent, and its absence is a fact rather than an omission: \`WidgetState.dragged\` exists in
 * Flutter, but no M3 defaults class assigns it an opacity, so the framework states no value to transcribe.
 */
export const STATE_LAYER_OPACITY: Readonly<Record<string, number>> = Object.freeze({
${entries(material.stateLayerOpacity, '  ')}
});

/** Disabled-state opacities, for a component's container and its content. */
export const DISABLED_OPACITY: Readonly<Record<string, number>> = Object.freeze({
${entries(material.disabledOpacity, '  ')}
});

/**
 * M3's elevation → surface-tint-opacity curve, as interpolation stops.
 *
 * Material 3 renders elevation as a *tint* rather than a shadow alone. Values between stops interpolate
 * linearly and values outside the range clamp, which is what Flutter's own
 * \`ElevationOverlay._surfaceTintOpacityForElevation\` does.
 */
export const ELEVATION_STOPS: readonly ElevationStop[] = Object.freeze([
${stops}
]);

/** Icon geometry and the icon font's family. */
export const ICON_DEFAULTS: Readonly<Record<string, number | string>> = Object.freeze({
${entries(material.icon, '  ')}
});

/** Per-component M3 defaults. A \`colorRole\` names a role the theme resolves, never a literal colour. */
export const COMPONENT_DEFAULTS: Readonly<Record<string, Readonly<Record<string, number | string>>>> =
  Object.freeze({
${components}
  });

/**
 * The surface tint opacity for an elevation, interpolated across {@link ELEVATION_STOPS}.
 *
 * Linear between stops, clamped outside the range — Flutter's algorithm, not an approximation of it.
 *
 * @param elevation - the elevation, in logical pixels.
 * @returns the tint opacity, 0–1.
 */
export function surfaceTintOpacity(elevation: number): number {
  const first = ELEVATION_STOPS[0]!;
  const last = ELEVATION_STOPS[ELEVATION_STOPS.length - 1]!;
  if (elevation <= first.elevation) return first.opacity;
  if (elevation >= last.elevation) return last.opacity;
  for (let index = 1; index < ELEVATION_STOPS.length; index++) {
    const upper = ELEVATION_STOPS[index]!;
    if (elevation > upper.elevation) continue;
    if (elevation === upper.elevation) return upper.opacity;
    const lower = ELEVATION_STOPS[index - 1]!;
    const t = (elevation - lower.elevation) / (upper.elevation - lower.elevation);
    return lower.opacity + t * (upper.opacity - lower.opacity);
  }
  return last.opacity;
}

/**
 * A component's default, or \`undefined\` if the catalog states none.
 *
 * @param component - the Material component's name, e.g. \`Card\`.
 * @param field - the default's name, e.g. \`elevation\`.
 * @returns the value.
 */
export function componentDefault(component: string, field: string): number | string | undefined {
  return COMPONENT_DEFAULTS[component]?.[field];
}

/**
 * Flutter's easing curves → their CSS timing function.
 *
 * Flutter declares most of its curves as \`Cubic(x1, y1, x2, y2)\` (animation/curves.dart), which **is**
 * CSS's \`cubic-bezier(x1, y1, x2, y2)\`: the same four control points of the same unit cubic Bezier. That
 * correspondence is what lets the implicit-animation family be implemented with no animation engine — the
 * browser interpolates, on exactly the curve the Flutter source named.
 *
 * A curve with no CSS equivalent is **absent rather than approximated**: \`decelerate\`, the two
 * \`ThreePointCubic\`s, and the bounce and elastic families. A generator that meets one refuses it by name.
 */
export const CURVES: Readonly<Record<string, string>> = Object.freeze({
${curves}
});

/**
 * The CSS timing function for a Flutter curve, or \`undefined\` if it has none.
 *
 * @param curve - the curve's name, e.g. \`easeInOut\`.
 * @returns the CSS \`transition-timing-function\` value.
 */
export function timingFunction(curve: string): string | undefined {
  return CURVES[curve];
}
`;
}
