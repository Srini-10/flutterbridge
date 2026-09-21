// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0055): project classes as real classes — constructors (named, initializer lists, `super`), fields, methods, getters,
// operators, inheritance, abstract classes, statics, `is` — compared with Flutter.
defineOracleSuite({ fixture: 'class_model' });
