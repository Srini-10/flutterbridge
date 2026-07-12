// N10 — theme-tokenize.
//
// **This is the only place in the compiler where a colour the user did not write comes into existence**
// — and it is compile time, not runtime (ADR-13, Spec v2.1 §A2).
//
// Extraction records only what the source *states*: a seed (`ColorScheme.fromSeed(seedColor: …)`) and
// any role written out by hand. N10 derives the other 45 Material 3 roles from that seed, using
// `material-color-utilities` — the same algorithm Flutter itself uses.
//
// ## The ownership split, and why it is not negotiable
//
// | | owner | why |
// | --- | --- | --- |
// | colour **palette** (roles from a seed) | **compile time — here** | it is *data*, and three realms consume it. Deriving it in each runtime kit would duplicate Material's tonal-palette algorithm N times, and the N copies would drift. |
// | colour **composition** (elevation overlays, state layers, opacity blends) | **runtime kit** | these are functions of *component state*, which the compiler cannot know. Composed from tokens. |
//
// ## Why this is not framework knowledge in the compiler
//
// `MaterialRole` — all 46 of them — is **frozen UIR vocabulary** (`shared.json`, `app.Token.role`). The
// IR already standardizes on Material 3's role names, because a design-token vocabulary that every
// target shares has to be *some* vocabulary. Deriving values for names the schema itself defines is IR
// work. No widget name appears here, and none can: the pass reads a token and writes tokens.
//
// ## What it will not do
//
// **It never overwrites a role the user wrote.** An explicit `ColorScheme(primary: Color(0xFF…))` is the
// author saying what `primary` is, and a derived value replacing it would be the compiler overruling
// them silently. Derived roles fill the gaps; they never win an argument.
//
// **It derives nothing without a seed.** No seed, no derivation — the tokens stay exactly as extracted.

import {
  argbFromHex,
  Hct,
  hexFromArgb,
  MaterialDynamicColors,
  SchemeTonalSpot,
} from '@material/material-color-utilities';
import type { AnyUirNode, NodeId } from '@bridge/uir';
import { nodeIdOfContent } from '@bridge/uir';

import { Program } from '../program.js';
import type { Analysis, Pass, PassContext } from '../normalize/pass.js';

/**
 * The 46 Material roles, in the order the UIR schema declares them.
 *
 * Not a list we invented and not a list we may reorder: it is `MaterialRole`, generated into the models
 * from `shared.json`. A role here that the schema does not have would fail validation at the emit
 * boundary, which is exactly where it should fail.
 */
const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'onPrimaryFixedVariant',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'secondaryFixed', 'secondaryFixedDim', 'onSecondaryFixed', 'onSecondaryFixedVariant',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'tertiaryFixed', 'tertiaryFixedDim', 'onTertiaryFixed', 'onTertiaryFixedVariant',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'onSurface', 'surfaceDim', 'surfaceBright',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest', 'onSurfaceVariant',
  'surfaceTint', 'outline', 'outlineVariant', 'shadow', 'scrim',
  'inverseSurface', 'onInverseSurface', 'inversePrimary',
] as const;

/**
 * Roles whose name in `material-color-utilities` differs from the name in the UIR schema.
 *
 * Exactly one, and it is a naming difference rather than a missing role: MCU calls it
 * `inverseOnSurface`; the schema — like Flutter's own `ColorScheme` — calls it `onInverseSurface`. A
 * table rather than a guess: a role we silently failed to look up would be a role that quietly never
 * gets derived, and a theme with a hole in it looks like a theme.
 */
const MCU_ALIASES: Readonly<Record<string, string>> = {
  onInverseSurface: 'inverseOnSurface',
};

export class N10ThemeTokenize implements Pass {
  readonly id = 'N10';
  readonly name = 'theme-tokenize';
  readonly requires: readonly string[] = [];
  readonly requiresAnalyses: readonly Analysis[] = [];
  readonly produces: readonly Analysis[] = [];
  readonly invalidates: readonly Analysis[] = [];
  readonly implemented = true;

  run(program: Program, context: PassContext): Program {
    const tokens = program.ofKind('app.Token');
    const seed = tokens.find((t) => t.group === 'color' && t.name === 'seed');
    if (seed === undefined) return program;

    const light = argbFromHex(String(seed.light));
    if (Number.isNaN(light)) return program;

    // Roles the author wrote. They are not derived over: an explicit `primary` is the author saying what
    // `primary` is, and replacing it would be the compiler overruling them silently.
    const stated = new Set<string>(
      tokens.flatMap((t) => (typeof t.role === 'string' ? [t.role] : [])),
    );

    const source = Hct.fromInt(light);
    const schemeLight = new SchemeTonalSpot(source, false, 0);
    const schemeDark = new SchemeTonalSpot(source, true, 0);

    const derived: AnyUirNode[] = [];
    let count = 0;

    // ROLES is a *fixed* list in a *fixed* order. Two runs derive the same roles, in the same order,
    // to the same bytes — and the canonical program order (kind, id) makes even that irrelevant.
    for (const role of ROLES) {
      if (stated.has(role)) continue;

      const property = MCU_ALIASES[role] ?? role;
      const dynamic = (
        MaterialDynamicColors as unknown as Record<string, { getArgb(s: unknown): number } | undefined>
      )[property];

      // Every role the schema declares must derive. A role we could not look up would be a hole in the
      // theme — and a theme with a hole in it still looks like a theme.
      if (dynamic === undefined) {
        context.report({
          code: 'BRG2116',
          severity: 'error',
          nodeId: seed.id as NodeId,
          message:
            `The Material role \`${role}\` could not be derived: material-color-utilities has no ` +
            `\`${property}\`. This is a compiler bug, not a problem with your theme.`,
        });
        continue;
      }

      const content = {
        kind: 'app.Token',
        group: 'color',
        name: role,
        role,
        light: hexFromArgb(dynamic.getArgb(schemeLight)).toUpperCase(),
        dark: hexFromArgb(dynamic.getArgb(schemeDark)).toUpperCase(),
      };

      derived.push({
        ...content,
        id: nodeIdOfContent(content),
        span: seed.span,
      } as unknown as AnyUirNode);
      count++;
    }

    if (count === 0) return program;

    context.report({
      code: 'BRG2115',
      severity: 'info',
      nodeId: seed.id as NodeId,
      message:
        `Derived ${count} Material colour roles from the seed \`${String(seed.light)}\`, light and dark. ` +
        `They are computed here, once, rather than in every runtime kit — which would duplicate ` +
        `Material's tonal-palette algorithm, and the copies would drift (ADR-13).`,
    });

    return Program.of([...program.nodes, ...derived]);
  }
}
