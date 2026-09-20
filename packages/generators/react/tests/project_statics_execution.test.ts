// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0055): static const/final fields of a class and top-level const/final variables, across files — emitted as
// module-level constants, compared with Flutter.
defineOracleSuite({ fixture: 'project_statics' });
