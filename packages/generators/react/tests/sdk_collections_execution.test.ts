// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M12 (ADR-0060): the List/Set/Map surface real code uses, compared with Flutter.
defineOracleSuite({ fixture: 'sdk_collections' });
