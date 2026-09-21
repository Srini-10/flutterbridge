// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0067): the code shape freezed generates — mixin members, a callable copyWith object, sentinel defaults, `==`/`hashCode`/`toString`,
// a redirecting const factory, sealed unions — compared with Flutter.
defineOracleSuite({ fixture: 'freezed_shape' });
