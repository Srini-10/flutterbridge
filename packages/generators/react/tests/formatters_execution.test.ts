// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M14 (ADR-0074): TextInputFormatters (digitsOnly, LengthLimitingTextInputFormatter) on TextField and TextFormField — compared with Flutter.
defineOracleSuite({ fixture: 'formatters', providers: true });
