#!/usr/bin/env node
/**
 * Stub-tag discipline (Blueprint §2, "standing rule for stubs").
 *
 * Every deferred implementation must be tagged `BRIDGE-STUB(M<n>): <what the real impl adds>`.
 * A stub without a milestone tag, or with an empty rationale, fails CI. The census this prints
 * is the input to the weekly stub triage (Blueprint §10, step 18).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.turbo', 'build', '.dart_tool', 'coverage', '.next']);
const SCAN_EXT = /\.(ts|tsx|mjs|cjs|js|dart|json|yaml|yml)$|^justfile$/;
const EXEMPT_FILES = new Set(['tools/check-stubs.mjs']);

/** Any casing/spacing variant we must catch, so a malformed tag cannot hide from the check. */
const LOOSE = /BRIDGE[-_ ]?STUB/gi;
/** The one legal form. */
const STRICT = /BRIDGE-STUB\(M(\d+)\):\s*\S+/;

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  /** @type {string[]} */
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (SCAN_EXT.test(entry)) out.push(full);
  }
  return out;
}

/** @type {{file: string, line: number, milestone: number, text: string}[]} */
const stubs = [];
/** @type {{file: string, line: number, text: string}[]} */
const violations = [];

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (EXEMPT_FILES.has(rel)) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, i) => {
    LOOSE.lastIndex = 0;
    if (!LOOSE.test(text)) return;
    const match = STRICT.exec(text);
    if (match) stubs.push({ file: rel, line: i + 1, milestone: Number(match[1]), text: text.trim() });
    else violations.push({ file: rel, line: i + 1, text: text.trim() });
  });
}

stubs.sort((a, b) => a.milestone - b.milestone || a.file.localeCompare(b.file) || a.line - b.line);

console.log(`stub census: ${stubs.length} tagged stub(s)`);
for (const s of stubs) console.log(`  M${s.milestone}  ${s.file}:${s.line}`);

if (violations.length > 0) {
  console.error(`\nERROR: ${violations.length} malformed stub tag(s). Required form: BRIDGE-STUB(M<n>): <rationale>`);
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.text}`);
  process.exit(1);
}
console.log('stub tags: OK');
