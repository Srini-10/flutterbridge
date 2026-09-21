// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0061): SDK exception classes, project exceptions, typed catch clauses dispatched on type, propagation, finally —
// compared with Flutter.
defineOracleSuite({ fixture: 'exceptions' });
