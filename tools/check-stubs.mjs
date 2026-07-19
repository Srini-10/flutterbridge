#!/usr/bin/env node
/**
 * Stub-tag discipline (Blueprint §2, "standing rule for stubs").
 *
 * Every deferred implementation must be tagged `BRIDGE-STUB(M<n>): <what the real impl adds>`.
 * A stub without a milestone tag, or with an empty rationale, fails CI. The census this prints
 * is the input to the weekly stub triage (Blueprint §10, step 18).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.turbo', 'build', '.dart_tool', 'coverage', '.next']);
const SCAN_EXT = /\.(ts|tsx|mjs|cjs|js|dart|json|yaml|yml)$|^justfile$/;
// Compared against a **separator-normalised** relative path. `relative()` returns `tools\check-stubs.mjs`
// on Windows, so a POSIX-spelled constant never matched there and this file flagged *itself* — the census
// printed correctly and the step still exited 1.
//
// The portability checker did not catch it: it looks for backslashes inside `join()`/`resolve()` calls,
// and this is the mirror image — a forward slash inside a comparison constant. Worth remembering that a
// hardcoded separator is a bug in both directions.
const EXEMPT_FILES = new Set(['tools/check-stubs.mjs']);
const posix = (path) => path.split(sep).join('/');

/** Any casing/spacing variant we must catch, so a malformed tag cannot hide from the check. */
const LOOSE = /BRIDGE[-_ ]?STUB/gi;
/** The one legal form. */
const STRICT = /BRIDGE-STUB\(M(\d+)\):\s*\S+/;

/**
 * Whether a line **declares** a stub, rather than mentioning one.
 *
 * A declaration opens its comment: `// BRIDGE-STUB(M2): …`, `# BRIDGE-STUB(M4): …`, ` * BRIDGE-STUB…`.
 * Prose *about* a stub does not — it appears mid-sentence, usually quoted:
 *
 * ```
 *  * `index.ts` carried `BRIDGE-STUB(M2): commands analyze | build | verify` from M0 to M5-A.
 * ```
 *
 * That line describes a stub this project **retired**, and counting it inflated the census by one for
 * three milestones. The census is a release-readiness number — "what deferred work remains" — so an
 * inflated one is a wrong answer to a question somebody is about to make a decision with.
 *
 * It also had a second cost, which is the reason this is a rule rather than an exemption list: a linter
 * that cannot tell a declaration from a description punishes describing things. Twice, accurate comments
 * were reworded to appease it — documentation made worse to keep a tool quiet.
 */
function declaresStub(text) {
  // Strip one leading comment marker and any indentation: `//`, `*`, `#`, `///`.
  const content = text.replace(/^\s*(\/\/+|\*|#)\s*/, '');
  return content.startsWith('BRIDGE-STUB') || content.startsWith('BRIDGE_STUB') || content.startsWith('BRIDGE STUB');
}

/**
 * Compares by UTF-16 code unit — never `localeCompare`.
 *
 * The same rule the schema generator states and for the same reason: collation depends on the host's ICU
 * data and on `LANG`/`LC_COLLATE`, so a `localeCompare` sort produces a different census order on a
 * different machine. This census is printed, diffed and pasted into reports.
 */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

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
  if (EXEMPT_FILES.has(posix(rel))) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((text, i) => {
    LOOSE.lastIndex = 0;
    if (!LOOSE.test(text)) return;
    const match = STRICT.exec(text);
    // A mention that is well-formed but not a declaration is prose about a stub — neither a census
    // entry nor a violation. A *malformed* mention still fails, wherever it appears: that check exists
    // so a typo'd tag cannot hide, and prose is no excuse for one.
    if (match && !declaresStub(text)) return;
    if (match) stubs.push({ file: posix(rel), line: i + 1, milestone: Number(match[1]), text: text.trim() });
    else violations.push({ file: posix(rel), line: i + 1, text: text.trim() });
  });
}

stubs.sort((a, b) => a.milestone - b.milestone || byCodeUnit(a.file, b.file) || a.line - b.line);

console.log(`stub census: ${stubs.length} tagged stub(s)`);
for (const s of stubs) console.log(`  M${s.milestone}  ${s.file}:${s.line}`);

if (violations.length > 0) {
  console.error(`\nERROR: ${violations.length} malformed stub tag(s). Required form: BRIDGE-STUB(M<n>): <rationale>`);
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.text}`);
  process.exit(1);
}
console.log('stub tags: OK');
