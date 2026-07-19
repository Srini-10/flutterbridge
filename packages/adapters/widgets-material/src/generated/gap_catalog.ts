// GENERATED CODE — DO NOT EDIT.
//
// Generated from catalog/widgets/gap.json by tools/catalog-codegen.
//
// Framework metadata is authored **once** and generated into both language domains (ADR-18). To change
// what the compiler knows about a widget, change the JSON.

import type { BridgePlugin, WidgetCatalog, WidgetSpec } from '@bridge/plugin-sdk';

const LIBRARY = "package:gap/";

const WIDGETS: readonly WidgetSpec[] = [
  { name: "Gap", library: LIBRARY },
  { name: "SliverGap", library: LIBRARY },
  { name: "MaxGap", library: LIBRARY },
];

/** The gap widget catalog. */
export const gapCatalog: WidgetCatalog = {
  name: "gap",
  priority: 30,
  widgets: WIDGETS,
};

/** The plugin the compiler's host loads at runtime. */
export const gapWidgets: BridgePlugin = {
  name: '@bridge/widgets-gap',
  version: '0.0.0',
  widgets: gapCatalog,
};

export default gapWidgets;
