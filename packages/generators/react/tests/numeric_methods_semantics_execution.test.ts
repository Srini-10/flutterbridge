// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M14: `roundToDouble`, `floorToDouble`, `truncateToDouble` and `int.toRadixString` — App B's money, formatting and hashing shapes, verbatim, and the edges
// (halves of both signs, a zero result that keeps its sign, NaN, infinity, `1e21`, radix 2 and 36, negative ints) — each result compared with what real Dart
// printed (`fixtures/apps/numeric_methods_semantics/test/expected.json`).
defineOracleSuite({ fixture: 'numeric_methods_semantics' });
