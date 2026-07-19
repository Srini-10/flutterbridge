import type { AnyUirNode } from '@bridge/uir';
import { describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  MISSING_CAPABILITIES,
  OWNER_LABEL,
  missingCapabilityOf,
  type CapabilityOwner,
} from '../src/internal/emit/unsupported.js';
import { harness } from './support.js';

// M6-E — navigation diagnostics must stay true.
//
// This file exists because three separate navigation diagnostics were found saying things that were false:
//
//   * `BRG3008` told users the generator declined "on the evidence available — one push, in one fixture",
//     for three milestones after the corpus had grown past sixty;
//   * `showDialog` fell through to `BRG3006` — "is not declared in this program" — which blames valid
//     Flutter code for a gap the compiler owns;
//   * `showDialog(context: …, builder: …)` additionally drew a `BRG3002` about its named arguments, as
//     though spelling them differently might help a call that is not lowered at all.
//
// None was a lowering bug. All three were the compiler describing its own history instead of a capability,
// which is the class of defect these tests pin.

const span = { file: 'lib/main.dart', line: 1, column: 1 } as const;

/**
 * A component whose button callback calls `name(...)` — the shape a refused framework call arrives in.
 *
 * **Minted from a real `bridge_analyzer` run**, not invented: an `ElevatedButton` whose `onPressed` is a
 * `bind.Expr` wrapping a `logic.Lambda`, whose body is one `logic.Return` of the `logic.Call`. The first
 * version of this file guessed a flatter shape, every assertion silently passed nothing, and twelve tests
 * failed at once — which is the good outcome, and the fourth time this repository has recorded that a
 * hand-authored node graph is a trap. The path was read from `.bridge/uir.ndjson` for a project containing
 * exactly these calls.
 */
function appCalling(name: string, namedArgs?: Record<string, unknown>): AnyUirNode[] {
  const call = {
    id: 'call1',
    kind: 'logic.Call',
    span,
    callee: { id: 'ref1', kind: 'logic.Ref', span, name },
    args: [],
    ...(namedArgs === undefined ? {} : { namedArgs }),
  };
  return [
    { id: 'tk1', kind: 'app.Token', span, group: 'color', name: 'primary', light: '#FF3F51B5' } as unknown as AnyUirNode,
    {
      id: 'c1',
      kind: 'ui.Component',
      span,
      name: 'HomeScreen',
      localSignals: [],
      render: {
        id: 'e1',
        kind: 'ui.Element',
        span,
        component: { name: 'ElevatedButton', userDefined: false },
        props: {
          onPressed: {
            id: 'b1',
            kind: 'bind.Expr',
            span,
            expr: {
              id: 'lam1',
              kind: 'logic.Lambda',
              span,
              params: [],
              body: [{ id: 'ret1', kind: 'logic.Return', span, value: call }],
            },
          },
        },
        children: [],
      },
    } as unknown as AnyUirNode,
    { id: 'r1', kind: 'app.Route', span, path: '/', component: 'c1' } as unknown as AnyUirNode,
  ];
}

/** Every diagnostic a program produces, by code. */
function diagnose(nodes: AnyUirNode[]): { code: string; severity: string; message: string }[] {
  const { context, reported } = harness(nodes);
  reactGenerator.generate(context);
  return reported.map((d) => ({ code: d.code, severity: d.severity, message: d.message }));
}

describe('M6-E — every navigation call names a capability, never the program', () => {
  // The forms the M6-D corpus measures, with how often it measures them. A call in this list that falls
  // through to BRG3006 is the compiler telling a developer their valid Flutter program is at fault.
  const CALLS: readonly (readonly [string, number])[] = [
    ['Navigator.push', 62],
    ['Navigator.pushNamed', 15],
    ['Navigator.pushReplacement', 6],
    ['Navigator.pop', 135],
    ['Navigator.popUntil', 6],
    ['Navigator.maybePop', 2],
    ['showDialog', 23],
    ['showModalBottomSheet', 21],
    ['showMenu', 0],
  ];

  for (const [name, uses] of CALLS) {
    it(`\`${name}\` (${uses} corpus uses) reports a capability, not BRG3006`, () => {
      const found = diagnose(appCalling(name));

      // BRG3006 is "not declared in this program". For a Flutter framework call it is always the wrong
      // answer: the program is correct and the compiler is the one missing something.
      expect(found.find((d) => d.code === 'BRG3006')).toBeUndefined();

      const capability = found.find((d) => d.code === 'BRG3013');
      expect(capability, `${name} produced no capability diagnostic`).toBeDefined();
      expect(capability?.severity).toBe('error');
      // Names the owning layer. Every one of these is owned by the compiler, never by the author.
      expect(capability?.message).toMatch(/the UIR schema|an architectural decision/);
    });
  }

  it('a pop is described as a pop, not as a push', () => {
    // §A17.3 rules that a pop is not an `app.RouteTransition` at all. "The edge is not linked to its call
    // site" is true of a push and false of a pop, and a developer debugging a pop should read the one that
    // is true of a pop. M6-D measured pops as the most frequent navigation verb in the corpus.
    const pop = diagnose(appCalling('Navigator.pop')).find((d) => d.code === 'BRG3013');
    expect(pop?.message).toContain('§A17.3');
    expect(pop?.message).toContain('returns along an edge that already exists');

    const push = diagnose(appCalling('Navigator.push')).find((d) => d.code === 'BRG3013');
    expect(push?.message).toContain('perform this transition here');
    // The push explanation must not be handed to a pop: there is no edge to link.
    expect(pop?.message).not.toContain('perform this transition here');
  });

  it('a refused call is refused once — its named arguments are not a second finding', () => {
    // `showDialog(context: …, builder: …)`. Before M6-E this produced BRG3013 *and* a BRG3002 saying the
    // call "passes Dart named arguments", which reads as a defect in code the author wrote correctly.
    const found = diagnose(appCalling('showDialog', { context: { id: 'x', kind: 'logic.Lit', span, value: 1 } }));

    expect(found.find((d) => d.code === 'BRG3013')).toBeDefined();
    expect(found.find((d) => d.code === 'BRG3002')).toBeUndefined();
  });

  it('named arguments are still refused where the call is not refused first', () => {
    // The other half of the rule, and the guard against having disabled BRG3002 outright. Dart named
    // arguments genuinely have no positional equivalent, so suppressing the diagnostic everywhere would
    // trade a false finding for a missing one.
    //
    // Asserted through `logic.MethodCall`, whose receiver emits and which M6-E did not touch —
    // `items.sort(compare: f)` is refused for its named argument and for nothing else.
    const nodes = appCalling('unused');
    const component = nodes[1] as unknown as Record<string, Record<string, Record<string, Record<string, unknown>>>>;
    component['render']!['props']!['onPressed']!['expr'] = {
      id: 'lam1',
      kind: 'logic.Lambda',
      span,
      params: [],
      body: [
        {
          id: 'ret1',
          kind: 'logic.Return',
          span,
          value: {
            id: 'mc1',
            kind: 'logic.MethodCall',
            span,
            receiver: { id: 'lit1', kind: 'logic.Lit', span, value: 'x', type: { name: 'String' } },
            method: 'padLeft',
            args: [],
            namedArgs: { width: { id: 'lit2', kind: 'logic.Lit', span, value: 2, type: { name: 'int' } } },
          },
        },
      ],
    };

    const found = diagnose(nodes);
    expect(found.find((d) => d.code === 'BRG3002')).toBeDefined();
  });
});

describe('M6-E — the capability registry is well formed (Phase 3)', () => {
  const entries = Object.entries(MISSING_CAPABILITIES);

  it('every entry names a capability and an owner that has a label', () => {
    for (const [key, value] of entries) {
      expect(value.capability, `${key} has an empty capability`).toBeTruthy();
      expect(OWNER_LABEL[value.owner as CapabilityOwner], `${key} has an unlabelled owner`).toBeTruthy();
    }
  });

  it('no capability describes implementation history', () => {
    // The BRG3008 defect, generalised. A capability is a thing that could be built; a count of how many
    // programs hit it is a measurement that goes stale the next time anybody measures. `unsupported.ts`
    // states this rule and this is what enforces it.
    const HISTORY = /\bone (push|fixture)\b|sample of one|evidence available|\b\d+ times\b|milestone|M\d-[A-Z]\b/i;
    for (const [key, value] of entries) {
      expect(value.capability, `${key} describes history, not a capability`).not.toMatch(HISTORY);
      if (value.workaround !== undefined) {
        expect(value.workaround, `${key}'s workaround describes history`).not.toMatch(HISTORY);
      }
    }
  });

  it('a route overlay and a messenger overlay are not the same capability', () => {
    // They had the same text and the same owner until M6-E, and they do not have the same blocker: a
    // dialog/sheet/menu pushes a `Route` (ADR-0024 cites the SDK), so ADR-0025 D2 closes it and the owner
    // is the schema. A snack bar is enqueued on a `ScaffoldMessenger` and no ADR models that yet.
    const routeOverlays = ['showDialog', 'showModalBottomSheet', 'showMenu', 'AlertDialog', 'PopupMenuButton'];
    for (const key of routeOverlays) {
      const entry = MISSING_CAPABILITIES[key];
      expect(entry, `${key} is missing from the registry`).toBeDefined();
      expect(entry?.owner, `${key} should be owned by the schema now that ADR-0025 names the construct`)
        .toBe('schema');
    }

    const messengerOverlays = ['SnackBar', 'ScaffoldMessenger', 'showSnackBar'];
    for (const key of messengerOverlays) {
      expect(MISSING_CAPABILITIES[key]?.owner, `${key} is not a route overlay`).toBe('adr');
    }

    // And the two must not collapse back into one string.
    expect(MISSING_CAPABILITIES['showDialog']?.capability)
      .not.toBe(MISSING_CAPABILITIES['showSnackBar']?.capability);
  });

  it('an `adr` owner really does mean no ADR has been written', () => {
    // `OWNER_LABEL.adr` says "an architectural decision that has not been made yet (it needs an ADR)".
    // That sentence became false for route overlays the moment ADR-0025 was written, which is why they
    // moved to `schema`. Anything still claiming it must not cite an ADR in its own capability text.
    for (const [key, value] of entries) {
      if (value.owner !== 'adr') continue;
      expect(value.capability, `${key} claims no decision exists while citing one`).not.toMatch(/ADR-\d+/);
    }
  });

  it('resolves both the bare and the qualified spelling of a navigation call', () => {
    // A program writes `Navigator.pop(context)`, never `pop`. A registry keyed only on the bare name
    // matched nothing a real program contains — the mistake `ScaffoldMessenger.of` records.
    expect(missingCapabilityOf('Navigator.pop', undefined)).toBeDefined();
    expect(missingCapabilityOf('Navigator.of', undefined)).toBeDefined();
    expect(missingCapabilityOf('ScaffoldMessenger.of', undefined)).toBeDefined();
  });
});

describe('M7-A — logic.Navigate is lowered (ADR-0025 D2)', () => {
  /** A component whose button pops. The `logic.Navigate` shape is the analyzer's, read from a real run. */
  function appPopping(action: string): AnyUirNode[] {
    return [
      { id: 'tk1', kind: 'app.Token', span, group: 'color', name: 'primary', light: '#FF3F51B5' } as unknown as AnyUirNode,
      {
        id: 'c1',
        kind: 'ui.Component',
        span,
        name: 'HomeScreen',
        localSignals: [],
        render: {
          id: 'e1',
          kind: 'ui.Element',
          span,
          component: { name: 'ElevatedButton', userDefined: false },
          props: {
            onPressed: {
              id: 'b1',
              kind: 'bind.Expr',
              span,
              expr: {
                id: 'lam1',
                kind: 'logic.Lambda',
                span,
                params: [],
                body: [{ id: 'nav1', kind: 'logic.Navigate', span, action }],
              },
            },
          },
          children: [],
        },
      } as unknown as AnyUirNode,
      { id: 'r1', kind: 'app.Route', span, path: '/', component: 'c1' } as unknown as AnyUirNode,
    ];
  }

  it('a pop becomes router.pop(), with useRouter hoisted to the component body', () => {
    const { context, reported } = harness(appPopping('pop'));
    const files = reactGenerator.generate(context).files;

    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    const component = files.find((f) => f.path.endsWith('home-screen.tsx'));
    expect(component).toBeDefined();

    // The lowering.
    expect(component?.contents).toContain('router.pop();');
    // Hoisted — a hook inside the callback would be a rules-of-hooks violation React throws on at
    // runtime, which `tsc` would not catch and a unit test asserting only `router.pop()` would miss.
    expect(component?.contents).toMatch(/const router = useRouter\(\);[\s\S]*router\.pop\(\)/);
    expect(component?.contents).toContain("from '@bridge/runtime-react'");
  });

  it('a component that does not navigate declares no router', () => {
    // The emitted file should say what the component does. An unconditional `useRouter()` would also
    // make every component require a RouterProvider, which is a runtime failure (BRG4005) for a screen
    // that never navigates.
    const { context } = harness(appCalling('doNothing'));
    const files = reactGenerator.generate(context).files;
    for (const file of files) expect(file.contents).not.toContain('useRouter');
  });

  it('an action ADR-0025 models but the generator cannot lower yet names the capability', () => {
    // `push` needs its transition resolved to a destination. Refused specifically — never the generic
    // statement refusal, which is the M6-E rule and which a new node kind does not suspend.
    const { context, reported } = harness(appPopping('push'));
    reactGenerator.generate(context);

    expect(reported.find((d) => d.code === 'BRG3003')).toBeUndefined();
    const capability = reported.find((d) => d.code === 'BRG3013');
    expect(capability?.message).toContain('ADR-0025');
    expect(capability?.message).toContain('belongs to this generator');
  });
});
