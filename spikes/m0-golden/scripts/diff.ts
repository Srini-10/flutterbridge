// M0-T5 SPIKE — pixel diff.
//
// Produces the numbers the M0-T7 go/no-go gate is scored on: mismatched pixels, percentage, and a
// heatmap PNG. Records; never fixes.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

import { PIXELMATCH_OPTIONS } from '../playwright.config.js';

const HERE = fileURLToPath(new URL('..', import.meta.url));
export const DIFF_DIR = join(HERE, 'diffs');

export interface DiffResult {
  screen: string;
  width: number;
  height: number;
  totalPixels: number;
  mismatchedPixels: number;
  mismatchPercent: number;
  diffImage: string;
}

export function diffPair(screen: string, expectedPath: string, actualPath: string): DiffResult {
  if (!existsSync(expectedPath)) throw new Error(`missing baseline: ${expectedPath}`);
  if (!existsSync(actualPath)) throw new Error(`missing baseline: ${actualPath}`);

  const expected = PNG.sync.read(readFileSync(expectedPath));
  const actual = PNG.sync.read(readFileSync(actualPath));

  if (expected.width !== actual.width || expected.height !== actual.height) {
    throw new Error(
      `dimension mismatch for "${screen}": ${basename(expectedPath)} is ${expected.width}x${expected.height}, ` +
        `${basename(actualPath)} is ${actual.width}x${actual.height}. The determinism contract is broken — ` +
        `identical viewport and DPR are preconditions, not results.`,
    );
  }

  const { width, height } = expected;
  const diff = new PNG({ width, height });
  const mismatchedPixels = pixelmatch(expected.data, actual.data, diff.data, width, height, PIXELMATCH_OPTIONS);

  mkdirSync(DIFF_DIR, { recursive: true });
  const diffImage = join(DIFF_DIR, `${screen}.diff.png`);
  writeFileSync(diffImage, PNG.sync.write(diff));

  const totalPixels = width * height;
  return {
    screen,
    width,
    height,
    totalPixels,
    mismatchedPixels,
    mismatchPercent: Number(((mismatchedPixels / totalPixels) * 100).toFixed(2)),
    diffImage,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = diffPair(
    'login',
    join(HERE, 'baselines/flutter/login.png'),
    join(HERE, 'baselines/react/login.png'),
  );
  console.log(result);
}
