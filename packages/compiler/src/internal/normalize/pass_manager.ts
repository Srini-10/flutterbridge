// The pass manager.
//
// Runs the normalization pipeline in the order Spec §3.3 fixes, checks that order actually satisfies
// every pass's declared dependencies, and refuses to run a pipeline with a hole in it.
//
// ## Why the dependency graph is checked rather than trusted
//
// Spec §3.3 records that **N11 depends on N5** (a closure must be lifted into a named `sig.Action`
// before promotion can move it into a store), and that N11 `requires: nav-graph`. Those are not
// documentation. A pipeline that runs N11 before N5 does not crash — it finds no named actions to
// promote, promotes nothing, and produces a program that looks fine and loses state on navigation.
//
// So the manager validates the order it is given, against the dependencies the passes declare, before
// running any of them. An unsatisfiable pipeline is a compiler bug and fails loudly at startup.

import { WidgetRegistry } from '../plugins/widget_registry.js';
import type { Program } from '../program.js';
import type { Analysis, Diagnostic, Pass, PassContext } from './pass.js';

/** What a normalization run produced. */
export interface NormalizeResult {
  /** The normalized program. */
  readonly program: Program;

  /** Every diagnostic, in the order the passes reported them. */
  readonly diagnostics: readonly Diagnostic[];

  /** What ran, in order, and what each pass did. */
  readonly manifest: NormalizationManifest;
}

/** The record of a normalization run. Replayable: same input, same manifest. */
export interface NormalizationManifest {
  readonly uirVersion: string;
  readonly schemaHash: string;
  readonly passes: readonly PassRecord[];
}

/** What one pass did. */
export interface PassRecord {
  readonly id: string;
  readonly name: string;
  /** Whether the pass changed the program at all. */
  readonly changed: boolean;
  /** How many diagnostics it reported. */
  readonly diagnostics: number;
}

/** A pipeline that cannot be run, and why. */
export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineError';
  }
}

/** Runs normalization passes, in order. */
export class PassManager {
  readonly passes: readonly Pass[];

  constructor(passes: readonly Pass[]) {
    validate(passes);
    this.passes = passes;
  }

  /**
   * Runs every pass, in order.
   *
   * Refuses a pipeline containing a pass this build has not implemented. The alternative — skipping it
   * — produces a program that claims to be normalized and is not, and every stage downstream is
   * written against the assumption that it is.
   */
  run(
    program: Program,
    options: {
      readonly uirVersion: string;
      readonly schemaHash: string;
      /** The loaded adapters' widget metadata. Empty when none are loaded. */
      readonly widgets?: WidgetRegistry;
    },
  ): NormalizeResult {
    const pending = this.passes.filter((p) => !p.implemented);
    if (pending.length > 0) {
      throw new PipelineError(
        `the normalization pipeline is incomplete: ${pending.map((p) => `${p.id} (${p.name})`).join(', ')} ` +
          `${pending.length === 1 ? 'is' : 'are'} not implemented in this build. Running the pipeline ` +
          `anyway would produce a program that claims to be normalized and is not.`,
      );
    }

    const widgets = options.widgets ?? WidgetRegistry.empty;

    // A catalog conflict is reported once, before any pass runs. It is a defect in the build's
    // configuration, not in the user's program, and it must not be attributed to whichever pass happened
    // to ask a question first.
    const diagnostics: Diagnostic[] = [...widgets.conflicts];
    const records: PassRecord[] = [];
    let current = program;

    for (const pass of this.passes) {
      const before = diagnostics.length;
      const context: PassContext = {
        widgets,
        report(diagnostic) {
          diagnostics.push(diagnostic);
        },
      };

      const next = pass.run(current, context);

      records.push({
        id: pass.id,
        name: pass.name,
        // Identity, not deep equality: a pass that changed nothing returns the *same object*. That is
        // a contract, and it is what makes "the pipeline reached a fixed point" cheap to check.
        changed: next !== current,
        diagnostics: diagnostics.length - before,
      });

      current = next;
    }

    return {
      program: current,
      diagnostics,
      manifest: { uirVersion: options.uirVersion, schemaHash: options.schemaHash, passes: records },
    };
  }
}

/** Rejects a pipeline whose order cannot satisfy its own declared dependencies. */
function validate(passes: readonly Pass[]): void {
  const seen = new Set<string>();

  // Analyses the manager computes on demand (Spec §3.2). A pass declaring `requiresAnalyses` does not
  // have to name the pass that produces it — the manager knows how, and recomputes it after anything
  // invalidates it. `nav-graph` depends only on L3 route declarations and navigation sites, both of
  // which exist from the moment the program is loaded.
  const fresh = new Set<Analysis>(['nav-graph', 'reactivity-graph', 'layout-boundedness']);

  for (const pass of passes) {
    if (seen.has(pass.id)) {
      throw new PipelineError(`pass ${pass.id} appears twice`);
    }

    for (const required of pass.requires) {
      if (!seen.has(required)) {
        throw new PipelineError(
          `${pass.id} (${pass.name}) requires ${required}, which has not run. Spec §3.3 fixes this ` +
            `dependency, and a pipeline that violates it does not crash — it silently does nothing.`,
        );
      }
    }

    // An analysis a previous pass invalidated is **recomputed**, not fatal (Spec §3.2, ADR-11): the
    // manager computes it on demand. `invalidates` says the cached answer is stale — which is exactly
    // what N11 does to the nav-graph and the reactivity-graph by moving state across a boundary — and
    // the pass that next requires it gets a fresh one.
    for (const analysis of pass.requiresAnalyses) fresh.add(analysis);
    for (const analysis of pass.invalidates) fresh.delete(analysis);
    for (const analysis of pass.produces) fresh.add(analysis);
    seen.add(pass.id);
  }
}
