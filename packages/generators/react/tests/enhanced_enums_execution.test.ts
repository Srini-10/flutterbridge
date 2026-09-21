// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0056): enhanced enums — constants with constructor arguments, fields, getters, methods, `values`, `index`, `name`,
// `switch` over them — compared with Flutter.
defineOracleSuite({ fixture: 'enhanced_enums' });
