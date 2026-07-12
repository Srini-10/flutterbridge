// @bridge/widgets-material — the Material widget catalog.
//
// **There is nothing hand-written here.** Every fact about every widget comes from
// `catalog/widgets/material.json`, generated into this package and into the Dart analyzer's extraction
// adapter by `tools/catalog-codegen` (ADR-18).
//
// That is not tidiness. This package and the analyzer's adapter used to state the same facts twice, in
// two languages, and they disagreed: Dart had a flat set of 14 slot names applied to *every* widget and
// a hardcoded `children`; TypeScript had a per-widget catalog. The disagreement was not theoretical —
// it buried `AppBar.actions` and `CustomScrollView.slivers` inside expressions, where no pass and no
// generator could see them as UI.

export {
  materialCatalog,
  materialWidgets,
  default,
} from './generated/material_catalog.js';
