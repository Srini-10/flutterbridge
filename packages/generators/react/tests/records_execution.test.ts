// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M13 (ADR-0069): records and record/list/map patterns — compared with Flutter.
defineOracleSuite({ fixture: 'records' });
