import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const [jsonPath, appLib, flutterLib] = process.argv.slice(2);
const j = JSON.parse(readFileSync(jsonPath, 'utf8'));
const counts = j.widgets;
const grepHas = (dir, name) => {
  try { execSync(`grep -rqE "class ${name}[ <(]" ${dir}`, {stdio:'ignore'}); return true; } catch { return false; }
};
const cat = {U1_user:[], U2_framework:[], U3_thirdparty:[], U4_unsupported:[]};
for (const raw of j.unknown) {
  const name = raw.split('.')[0];
  const n = counts[raw] ?? 0;
  if (grepHas(appLib, name))            cat.U1_user.push([raw,n]);
  else if (grepHas(flutterLib, name))   cat.U2_framework.push([raw,n]);
  else                                  cat.U3_thirdparty.push([raw,n]);
}
const sum = a => a.reduce((s,[,n])=>s+n,0);
const tot = Object.values(cat).reduce((s,a)=>s+sum(a),0);
console.log(`\n### ${j.app} — triage of ${j.unknown.length} unknown types (${tot} instantiations)`);
for (const [k,v] of Object.entries(cat)) {
  console.log(`\n${k}: ${v.length} types, ${sum(v)} instantiations (${(sum(v)/tot*100).toFixed(1)}% of unknown)`);
  console.log('  ' + v.sort((a,b)=>b[1]-a[1]).map(([w,n])=>`${w}×${n}`).join(', '));
}
console.log(`\nJSON:${JSON.stringify({app:j.app, u1:sum(cat.U1_user), u2:sum(cat.U2_framework), u3:sum(cat.U3_thirdparty), tot})}`);
