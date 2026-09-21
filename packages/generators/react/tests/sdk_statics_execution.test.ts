// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0057): the Dart SDK statics real code calls (`identical`, `Object.hash`, `unawaited`, `double.infinity`) and a package
// `const` used as an identity token — compared with Flutter.
defineOracleSuite({ fixture: 'sdk_statics' });
