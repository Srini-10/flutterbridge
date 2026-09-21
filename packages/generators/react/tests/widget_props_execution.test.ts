// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M14 (ADR-0074): widgets and lists of widgets passed to a project widget as named parameters — compared with Flutter.
defineOracleSuite({ fixture: 'widget_props' });
