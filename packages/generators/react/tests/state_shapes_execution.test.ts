// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M14 (ADR-0074): the shapes a State takes in real code — final / late final fields (some computed from the widget), a State field named like the widget's,
// an arrow-bodied setState followed by more statements, an async closure passed to a helper — compared with Flutter.
defineOracleSuite({ fixture: 'state_shapes', providers: true });
