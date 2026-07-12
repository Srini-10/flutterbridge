#!/usr/bin/env node
/**
 * M0-T1 acceptance criterion: "dep-cruiser fails a deliberately-wrong import."
 *
 * A rule set that has never been observed failing is not a rule set. This writes a violating file
 * (@bridge/uir importing @bridge/core — forbidden by Spec §1.2 rule 1), then asserts BOTH:
 *
 *   1. the violation is reported, with the expected rule name and `error` severity; and
 *   2. the command CI actually runs (`lint:deps`, text reporter) exits non-zero because of it.
 *
 * Both checks are needed: dependency-cruiser's JSON reporter always exits 0 regardless of
 * violations, so an exit-code assertion against the JSON reporter would silently pass forever.
 *
 * The violating file is always removed again.
 */
import { execFileSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VIOLATION = new URL('../packages/uir/src/__depcruise_violation__.ts', import.meta.url);
const EXPECTED_RULE = 'uir-imports-nothing';

const SOURCE = `// Temporary file written by tools/verify-depcruise-negative.mjs. Never commit this.
// It violates Spec §1.2 rule 1 on purpose: @bridge/uir must import nothing from the workspace.
import { createHost } from '@bridge/core';
export const illegal = createHost;
`;

/**
 * @param {string[]} extraArgs
 * @returns {{ code: number, stdout: string }}
 */
function depcruise(extraArgs) {
  const args = ['exec', 'depcruise', 'packages', '--config', '.dependency-cruiser.cjs', ...extraArgs];
  try {
    const stdout = execFileSync('pnpm', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout };
  } catch (/** @type {any} */ err) {
    return { code: err.status ?? 1, stdout: `${err.stdout ?? ''}` };
  }
}

/** @type {string[]} */
const failures = [];

try {
  writeFileSync(VIOLATION, SOURCE, 'utf8');

  // (1) The violation is reported, by the expected rule, at error severity.
  const json = depcruise(['--output-type', 'json']);
  /** @type {{ summary: { error: number, violations: { rule: { name: string, severity: string }, from: string, to: string }[] } }} */
  const report = JSON.parse(json.stdout);
  const hit = report.summary.violations.find((v) => v.rule.name === EXPECTED_RULE);

  if (!hit) {
    failures.push(
      `rule "${EXPECTED_RULE}" did not fire on a forbidden import. Violations seen: ` +
        `${JSON.stringify(report.summary.violations.map((v) => v.rule.name))}`,
    );
  } else if (hit.rule.severity !== 'error') {
    failures.push(`rule "${EXPECTED_RULE}" fired at severity "${hit.rule.severity}", expected "error".`);
  } else {
    console.log(`OK: "${EXPECTED_RULE}" fired (error) on ${hit.from} -> ${hit.to}`);
  }

  // (2) The command CI runs must actually fail the build.
  const text = depcruise([]);
  if (text.code === 0) {
    failures.push('`lint:deps` (text reporter) exited 0 despite a forbidden import — CI would not catch this.');
  } else {
    console.log(`OK: lint:deps exits ${text.code} on a forbidden import`);
  }
} catch (/** @type {any} */ err) {
  failures.push(`negative test crashed: ${err.message}`);
} finally {
  rmSync(VIOLATION, { force: true });
}

if (failures.length > 0) {
  console.error('\nFAIL: the architecture rules did not reject a forbidden import.');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('architecture rules reject forbidden imports: OK');
