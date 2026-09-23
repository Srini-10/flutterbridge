// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M14: `dart:core` `StringBuffer` — the two real App B users verbatim (`formatRupees`, `buildCsv`) and the general behaviour (every value kind
// `write` accepts, `writeln`, initial content, a buffer shared by reference, passed to and returned from functions, argument evaluation
// order, a nullable buffer) — each result compared with what real Dart printed (`fixtures/apps/string_buffer_semantics/test/expected.json`).
defineOracleSuite({ fixture: 'string_buffer_semantics' });
