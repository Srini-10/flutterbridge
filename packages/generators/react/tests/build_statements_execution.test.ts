// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0062): a `build` with statements, widgets as values, `ui.Nodes` — compared with Flutter.
defineOracleSuite({ fixture: 'build_statements' });
