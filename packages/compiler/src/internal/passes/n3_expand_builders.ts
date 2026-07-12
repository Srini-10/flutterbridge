// N3 — expand-builders → `ui.List`.
//
// **A verification pass with an optional rewrite** (M2-T6 ruling). Same contract as N2, same reasoning.
//
// The invariant it guards:
//
//   > repeated UI is a `ui.List` with a source, an item parameter and a template — never an opaque
//   > expression that happens to produce a list of widgets.
//
// The Flutter frontend emits `ui.List` for `for (x in xs) W(x)` and for `xs.map((x) => W(x)).toList()`
// (M1-T8). What it *cannot* do is recover a template from `ListView.builder(itemCount: n, itemBuilder:
// (c, i) => W(items[i]))`, because the collection is not named there — only indexed. That gap is real,
// and this is where it is named rather than quietly carried into a generator that will emit a loop over
// nothing.

import type { AnyUirNode } from '@bridge/uir';

import type { Program } from '../program.js';
import { walk, type Analysis, type Pass, type PassContext } from '../normalize/pass.js';

export class N3ExpandBuilders implements Pass {
  readonly id = 'N3';
  readonly name = 'expand-builders';
  readonly requires: readonly string[] = [];
  readonly requiresAnalyses: readonly Analysis[] = [];
  readonly produces: readonly Analysis[] = [];
  readonly invalidates: readonly Analysis[] = [];
  readonly implemented = true;

  run(program: Program, context: PassContext): Program {
    for (const node of walk(program)) {
      if (node.kind !== 'ui.Opaque') continue;
      if (!/builder|for-element|spread/i.test(node.reason)) continue;

      context.report({
        code: 'BRG2103',
        severity: 'warning',
        nodeId: node.id,
        message:
          `Repeated UI reached normalization un-expanded (${node.reason}). It will reach the generator ` +
          `as opaque source rather than a ui.List, so nothing downstream can reason about the ` +
          `collection it repeats over — including keying it (N9).`,
      });
    }
    return program;
  }
}

export type { AnyUirNode };
