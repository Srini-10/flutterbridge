// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M14 (ADR-0076): identifiers that are members of Object.prototype (constructor, toString, valueOf, hasOwnProperty, prototype, __proto__, length) as State
// fields, parameters, locals, methods, enum values and map keys — compared with Flutter. A generator that indexes a table by a name used to crash on one.
defineOracleSuite({ fixture: 'prototype_names', providers: true });
