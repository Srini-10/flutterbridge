// N4 — normalize-async-ui → `ui.Async`.
//
// **A verification pass with an optional rewrite** (M2-T6 ruling).
//
// The invariant:
//
//   > asynchronous UI is a `ui.Async` with a source and — where the frontend could recover them —
//   > `loading`, `error` and `data` branches. Never a builder closure the generator must interpret.
//
// The Flutter frontend emits `ui.Async` for `FutureBuilder`/`StreamBuilder`, but only *partially*: a
// Flutter builder expresses the three branches as `if (snapshot.hasData)` **inside one closure**, and
// recovering them from that body is a normalization, not an extraction. Extraction therefore records
// what is written — the source, the data parameter, the body — and leaves the branch split to here.
//
// That split is genuine future work (it needs the `ui.Cond` tree inside the body, which N2 guarantees
// exists). What this pass does today is **verify the invariant and name what is missing**: a `ui.Async`
// with no `loading` or `error` branch is one whose spinner and whose failure state the generator will
// have to invent, and inventing them is exactly what the compiler must not do.

import type { Program } from '../program.js';
import { walk, type Analysis, type Pass, type PassContext } from '../normalize/pass.js';

export class N4NormalizeAsyncUi implements Pass {
  readonly id = 'N4';
  readonly name = 'normalize-async-ui';
  readonly requires: readonly string[] = ['N2'];
  readonly requiresAnalyses: readonly Analysis[] = [];
  readonly produces: readonly Analysis[] = [];
  readonly invalidates: readonly Analysis[] = [];
  readonly implemented = true;

  run(program: Program, context: PassContext): Program {
    for (const node of walk(program)) {
      if (node.kind !== 'ui.Async') continue;
      if (node.loading !== undefined || node.error !== undefined) continue;

      context.report({
        code: 'BRG2104',
        severity: 'warning',
        nodeId: node.id,
        message:
          `This ui.Async has neither a loading branch nor an error branch. A frontend that states them ` +
          `inside the builder — as a test on the snapshot, rather than as separate branches — has left ` +
          `normalization work this build has not done. A generator will have to invent a spinner and a ` +
          `failure state, which is precisely what it must never do.`,
      });
    }
    return program;
  }
}
