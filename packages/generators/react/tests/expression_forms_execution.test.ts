// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0058): throw/rethrow in expressions, constructor and generic-function tear-offs, null-aware access on any receiver,
// cascades, collection spread/if/for, adjacent strings — compared with Flutter.
defineOracleSuite({ fixture: 'expression_forms' });
