// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M13 (ADR-0071): LayoutBuilder — the builder reads the size on offer, is rebuilt when it changes, nests, and reports an
// unbounded height as infinity — compared with Flutter. jsdom does no layout, so the harness installs a shim (see `execute.ts`).
defineOracleSuite({ fixture: 'layout', layout: true });
