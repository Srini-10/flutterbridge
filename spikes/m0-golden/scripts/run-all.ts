// M0-T5 SPIKE — orchestrator.
//
//   1. capture Flutter (twice)  -> repeatability check
//   2. capture React   (twice)  -> repeatability check
//   3. diff the one comparable screen (login)
//   4. write reports/summary.json
//
// A golden that is not repeatable is not evidence (risk R5), so repeatability is *measured*, not
// assumed: each app is captured twice and the two PNGs must be byte-identical.

import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { captureFlutter } from './capture_flutter.js';
import { captureNext } from './capture_next.js';
import { diffPair, type DiffResult } from './diff.js';
import { DEVICE_SCALE_FACTOR, VIEWPORT } from '../playwright.config.js';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const REPORTS = join(HERE, 'reports');

const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

async function main(): Promise<void> {
  mkdirSync(REPORTS, { recursive: true });

  console.log('\n── pass 1 ────────────────────────────────────────────');
  const flutter1 = await captureFlutter();
  const react1 = await captureNext();

  const snapshot1 = {
    flutterLogin: sha(flutter1.login),
    reactLogin: sha(react1.login),
    flutterHome: flutter1.home ? sha(flutter1.home) : null,
  };

  // Keep pass 1 aside so pass 2 cannot overwrite the evidence before we compare.
  const keep = join(HERE, 'baselines/.pass1');
  mkdirSync(keep, { recursive: true });
  copyFileSync(flutter1.login, join(keep, 'flutter-login.png'));
  copyFileSync(react1.login, join(keep, 'react-login.png'));

  console.log('\n── pass 2 (repeatability) ────────────────────────────');
  const flutter2 = await captureFlutter();
  const react2 = await captureNext();

  const snapshot2 = {
    flutterLogin: sha(flutter2.login),
    reactLogin: sha(react2.login),
    flutterHome: flutter2.home ? sha(flutter2.home) : null,
  };

  const repeatable = {
    flutterLogin: snapshot1.flutterLogin === snapshot2.flutterLogin,
    reactLogin: snapshot1.reactLogin === snapshot2.reactLogin,
    flutterHome:
      snapshot1.flutterHome !== null && snapshot1.flutterHome === snapshot2.flutterHome,
  };

  console.log('\n── diff (comparable screens only) ────────────────────');
  const diffs: DiffResult[] = [diffPair('login', flutter1.login, react1.login)];

  const summary = {
    spike: 'M0-T5',
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    browser: 'playwright-chromium',
    repeatable,
    hashes: { pass1: snapshot1, pass2: snapshot2 },
    diffs,
    notComparable: [
      {
        screen: 'home',
        reason:
          'The React reference implements the login screen only (M0-T4); its /home is an acknowledged ' +
          'placeholder. Diffing a real screen against a placeholder would produce a meaningless number. ' +
          'The Flutter home baseline is captured for information and will become comparable at M2.',
        flutterBaseline: flutter1.home,
      },
    ],
  };

  writeFileSync(join(REPORTS, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

  console.log('\n══ SUMMARY ═══════════════════════════════════════════');
  console.log(`viewport            ${VIEWPORT.width}x${VIEWPORT.height} @${DEVICE_SCALE_FACTOR}x, playwright-chromium`);
  console.log(`repeatable flutter  ${repeatable.flutterLogin ? 'YES (byte-identical)' : 'NO'}`);
  console.log(`repeatable react    ${repeatable.reactLogin ? 'YES (byte-identical)' : 'NO'}`);
  for (const d of diffs) {
    console.log(
      `diff ${d.screen.padEnd(14)} ${d.mismatchedPixels}/${d.totalPixels} px  ${d.mismatchPercent}%  -> ${d.diffImage}`,
    );
  }
  console.log('report              reports/summary.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
