// C1 evidence: automation coverage computed FROM the analyzer's unmodified JSON output.
// No classification is changed here; this only aggregates what the tool already reported.
import { readFileSync } from 'node:fs';

const apps = process.argv.slice(2);
const rows = [];
for (const f of apps) {
  const j = JSON.parse(readFileSync(f, 'utf8'));
  const counts = j.widgets;                 // widgetKey -> instantiation count (incl. user components)
  const bucket = (k) => new Set(j[k]);
  const user = bucket('userComponents'), sup = bucket('supported'), par = bucket('partial'),
        uns = bucket('unsupported'), unk = bucket('unknown');

  let cSup=0,cPar=0,cUns=0,cUnk=0,cUser=0;
  for (const [k,n] of Object.entries(counts)) {
    if (user.has(k)) cUser+=n; else if (sup.has(k)) cSup+=n;
    else if (par.has(k)) cPar+=n; else if (uns.has(k)) cUns+=n;
    else if (unk.has(k)) cUnk+=n;
  }
  const framework = cSup+cPar+cUns+cUnk;    // framework widget instantiations (user components excluded)
  const pct = (x) => framework ? +(x/framework*100).toFixed(1) : 0;

  rows.push({
    app: j.app, project: j.project, verdict: j.compatibility.level,
    files: j.summary.dartFiles, loc: j.summary.linesOfCode,
    frameworkWidgets: framework, userComponents: cUser,
    supported: pct(cSup), partial: pct(cPar), unsupported: pct(cUns), unknown: pct(cUnk),
    mvpOnly: pct(cSup), mvpPlusPartial: pct(cSup+cPar),
    distinctUnknown: [...unk].length, distinctPartial: [...par].length, distinctUnsupported: [...uns].length,
    unknownList: [...unk].sort(), partialList: [...par].sort(), unsupportedList: [...uns].sort(),
    warnings: j.warnings.map(w=>w.code),
  });
}
console.log(JSON.stringify(rows, null, 1));
