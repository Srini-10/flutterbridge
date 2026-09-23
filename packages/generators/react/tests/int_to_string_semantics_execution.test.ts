// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M14: `int.toString()` and `double.toString()` — App B's real shapes (`n.truncate().toString()`, `v.round().toString()`, `v.toInt().toString()`,
// `time.hour.toString().padLeft(2, '0')`), a nullable int, and the edges (zero, negative, the largest safe integer, a whole double, `1e21`, `1e-7`,
// `-0.0`, NaN, infinity) — each result compared with what real Dart printed (`fixtures/apps/int_to_string_semantics/test/expected.json`).
defineOracleSuite({ fixture: 'int_to_string_semantics' });
