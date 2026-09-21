// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0062): widget-returning helpers inlined at the call — compared with Flutter.
defineOracleSuite({ fixture: 'widget_helpers' });
