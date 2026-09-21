// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M13 (ADR-0068): extension methods, getters and setters — compared with Flutter.
defineOracleSuite({ fixture: 'extensions' });
