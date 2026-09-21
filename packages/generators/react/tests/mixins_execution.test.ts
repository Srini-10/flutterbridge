// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0059): mixins — fields, methods, getters, `on` with `super`, order of application, class members over mixin members,
// `is` against a mixin — compared with Flutter.
defineOracleSuite({ fixture: 'mixins' });
