import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { compiledFrom, harness } from './support.js';

// M13 (ADR-0070, ADR-0071): what the gesture and constraint models refuse, by name. Real analyzer output for
// `fixtures/apps/gesture_refusals`. A callback that renders and is never delivered is the silent loss these exist to prevent, and a
// `BoxConstraints` member a browser cannot state must not be answered with a guess.

const raw = readFileSync(fileURLToPath(new URL('../../../../fixtures/uir/gesture_refusals.ndjson', import.meta.url)), 'utf8');

describe('gesture and constraint refusals', () => {
  const { context, reported } = harness(compiledFrom(raw));
  const { files } = reactGenerator.generate(context);
  const errors = reported.filter((d) => d.severity === 'error');
  const say = (needle: string): boolean => errors.some((d) => d.message.includes(needle));

  it('emits nothing (all or nothing)', () => {
    expect(files).toEqual([]);
  });

  it.each([
    ['GestureDetector.onPanUpdate', '`onPanUpdate`', 'not built yet'],
    ['GestureDetector.onSecondaryTap', '`onSecondaryTap`', 'not built yet'],
    ['InkWell.onHighlightChanged', '`onHighlightChanged`', 'not built yet'],
    ['GestureDetector.onForcePressStart', '`onForcePressStart`', 'no browser equivalent'],
  ])('refuses %s, saying whether it is "not built yet" or has "no browser equivalent"', (_name, parameter, kind) => {
    expect(errors.some((d) => d.code === 'BRG3017' && d.message.includes(parameter) && d.message.includes(kind.split(' ').slice(0, 2).join(' ')))).toBe(true);
  });

  it('distinguishes "no browser equivalent" from "not implemented yet"', () => {
    const force = errors.find((d) => d.message.includes('onForcePressStart'))?.message ?? '';
    const pan = errors.find((d) => d.message.includes('onPanUpdate'))?.message ?? '';
    expect(force).toContain('no browser equivalent');
    expect(force).not.toContain('not built yet');
    expect(pan).toContain('not built yet');
    expect(pan).not.toContain('no browser equivalent');
  });

  it('refuses the BoxConstraints members a browser cannot state, by name', () => {
    expect(say('`BoxConstraints.minWidth` has no browser equivalent')).toBe(true);
    expect(say('`BoxConstraints.isTight` has no browser equivalent')).toBe(true);
  });
});

// M14 (ADR-0076): a member named `constructor` cannot be declared by a JavaScript class; the generator names it rather than emitting a syntax error.
describe('a class member named `constructor`', () => {
  const golden = readFileSync(fileURLToPath(new URL('../../../../fixtures/uir/constructor_member_refusal.ndjson', import.meta.url)), 'utf8');
  it('is refused by name, and nothing is emitted', () => {
    const { context, reported } = harness(compiledFrom(golden));
    const { files } = reactGenerator.generate(context);
    expect(reported.some((d) => d.severity === 'error' && d.message.includes('declares a member named `constructor`'))).toBe(true);
    expect(files).toEqual([]);
  });
});
