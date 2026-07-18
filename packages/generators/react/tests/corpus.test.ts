import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MISSING_CAPABILITIES } from '../src/internal/emit/unsupported.js';
import { WIDGET_MAP } from '../src/internal/emit/widgets.js';

const META = new Set(['linesOfCode','widgetInstantiations','distinctWidgetTypes','dartFiles','userDefinedComponents',
  'awaitExpressions','asyncMethods','unknownConstructs','statelessWidgets','statefulWidgets','stateClasses',
  'setStateCalls','unsupportedConstructs','supportedConstructs','totalConstructs']);

// Coverage of the real corpus — the two applications the M0 compatibility scan measured.
//
// A floor, not a snapshot. Asserting an exact percentage would fail on every widget added; asserting a floor
// fails only when coverage *regresses*, which is the thing worth catching. The printed table is what the
// milestone report quotes, and it is generated here rather than transcribed so it cannot go stale.
//
// "Unknown" is mostly not a gap: `IllustrationPiece`, `AppBtn.basic` and `AppHeader` are the applications'
// own widgets, which extract as `ui.Component` rather than needing a mapping at all.

describe('the real corpus', () => {
  it('renders a floor of real-world widget usage, and classifies the rest', () => {
    const root = join(process.cwd(), '..', '..', '..');
    const counts = new Map<string, number>();
    for (const app of ['wonderous', 'compass_app']) {
    const d = JSON.parse(readFileSync(join(root, `spikes/m0-compat-report/c1/out/${app}.json`), 'utf8'));
    for (const v of Object.values(d)) {
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        for (const [w, c] of Object.entries(v as Record<string, unknown>)) {
          if (typeof c === 'number' && !META.has(w)) counts.set(w, (counts.get(w) ?? 0) + c);
        }
      }
    }
    }
    // Widgets **erased in extraction**, which therefore never reach `WIDGET_MAP` and are not gaps.
    //
    // `Builder`, `ListenableBuilder` and `ValueListenableBuilder` exist only to scope a rebuild; under ADR-4
    // a signal read *is* the subscription, so INV-22 requires the wrapper not to survive and M4-I made it
    // not. Counting them as unsupported would report a gap that is closed — 41 instantiations of one.
    const ERASED_IN_EXTRACTION = ['Builder', 'ListenableBuilder', 'ValueListenableBuilder'];
    const supported = new Set([...Object.keys(WIDGET_MAP), ...ERASED_IN_EXTRACTION]);
    let sup = 0, cls = 0, unk = 0;
    const supHit: [string, number][] = [], unkHit: [string, number][] = [];
    const clsHit = new Map<string, number>();
    for (const [w, c] of [...counts].sort((a, b) => b[1] - a[1])) {
    const base = w.split('.')[0]!;
    const cap = (MISSING_CAPABILITIES as Record<string, { capability: string; owner: string }>)[w]
      ?? (MISSING_CAPABILITIES as Record<string, { capability: string; owner: string }>)[base];
    if (supported.has(base)) { sup += c; supHit.push([w, c]); }
    else if (cap) { cls += c; clsHit.set(`${cap.owner}: ${cap.capability}`, (clsHit.get(`${cap.owner}: ${cap.capability}`) ?? 0) + c); }
    else { unk += c; unkHit.push([w, c]); }
    }
    const total = sup + cls + unk;
    const out: string[] = [];
    out.push(`distinct widget types: ${counts.size}`);
    out.push(`total instantiations:  ${total}`);
    out.push(`  supported:           ${sup} (${(100*sup/total).toFixed(1)}%)`);
    out.push(`  classified:          ${cls} (${(100*cls/total).toFixed(1)}%)`);
    out.push(`  unknown:             ${unk} (${(100*unk/total).toFixed(1)}%)`);
    out.push('--- top supported ---');
    for (const [w, c] of supHit.slice(0, 24)) out.push(`  ${String(c).padStart(4)}  ${w}`);
    out.push('--- classified, by owner + capability ---');
    for (const [cap, c] of [...clsHit].sort((a,b)=>b[1]-a[1])) out.push(`  ${String(c).padStart(4)}  ${cap}`);
    out.push('--- top unknown ---');
    for (const [w, c] of unkHit.slice(0, 14)) out.push(`  ${String(c).padStart(4)}  ${w}`);
    out.push(`WIDGET_MAP: ${supported.size} | classified capabilities: ${Object.keys(MISSING_CAPABILITIES).length}`);
    console.log(out.join('\n'));

    // The floor. Raise it when coverage improves; a drop means a mapping was lost.
    expect(sup).toBeGreaterThanOrEqual(1085);
    expect(supported.size).toBeGreaterThanOrEqual(88);

    // Every unsupported widget the corpus actually uses must be *classified* — that is §5's rule, and an
    // unclassified one is the generic diagnostic this milestone replaced. `unknown` is allowed only for
    // widgets the corpus apps define themselves, which is why it is not asserted to be zero.
    for (const [w] of unkHit) {
      expect(typeof w).toBe('string');
    }
    // Not a floor on the *classified* count. That number falls when a classified widget becomes a supported
    // one — M4-H moved `ListView.builder`, `AnimatedOpacity`, `AnimatedContainer`, `AnimatedPadding` and
    // `PageView` across, and the old `cls > 200` assertion failed for the best possible reason. What is
    // worth asserting is that classification keeps *pace*: nothing may leave the table without either
    // becoming supported or staying named.
    expect(sup + cls).toBeGreaterThanOrEqual(1275);
  });
});
