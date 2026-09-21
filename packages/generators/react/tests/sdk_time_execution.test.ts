// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0066): DateTime, Timer, Future factories, DeepCollectionEquality — compared with Flutter.
defineOracleSuite({ fixture: 'sdk_time' });
