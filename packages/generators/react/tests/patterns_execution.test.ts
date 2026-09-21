// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0065): Dart 3 patterns in switch expressions and switch statements — compared with Flutter.
defineOracleSuite({ fixture: 'patterns' });
