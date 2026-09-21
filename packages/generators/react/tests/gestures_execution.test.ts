// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M13 (ADR-0070): GestureDetector and InkWell — pointer, hover, focus and keyboard input, compared with Flutter.
defineOracleSuite({ fixture: 'gestures' });
