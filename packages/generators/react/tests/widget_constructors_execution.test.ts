// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0063): widget constructors — initializer-list constants, named constructors, factories — compared with Flutter.
defineOracleSuite({ fixture: 'widget_constructors' });
