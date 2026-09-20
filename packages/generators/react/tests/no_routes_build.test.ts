import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import {
  builderExpansionRaw,
  cleanupBuildProofTemporaries,
  compiledFrom,
  fileAt,
  harness,
  typecheckEmitted,
  unmodelledClassMemberRaw,
} from './support.js';

// A program with no routes — components only, no `MaterialApp(home: …)`.
//
// The generator said so ("the program declares no routes, so the generated router has none", a warning) and then
// emitted a router anyway: `routes.ts` held `{ routes: [] }`, which fails strict `tsc` (`RouterDescriptor.initial`
// is required, TS2741) and which `createRouter` rejects at startup (`BRG4004`: `initial` must be in `routes`).
// The warning promised no router; the output contained a broken one. `page.tsx` already rendered `null` for the
// same case — only the providers disagreed. Making it an error was tried and measured: it fails 38 tests across
// ten files, which are logic- and component-level programs that legitimately have no `MaterialApp`. So the mode
// stays supported, and the router that has nothing to route is not emitted.
//
// `unmodelled_class_member` is one such program, from real analyzer output.

afterAll(cleanupBuildProofTemporaries);

const emit = () => {
  const { context, reported } = harness(compiledFrom(unmodelledClassMemberRaw()));
  const { files } = reactGenerator.generate(context);
  return { reported, files };
};

describe('a program with no routes emits no router', () => {
  it('still says so, as a warning', () => {
    const warning = emit().reported.find((d) => d.message.includes('declares no routes'));
    expect(warning?.severity).toBe('warning');
  });

  it('emits no route table', () => {
    expect(fileAt(emit().files, 'src/routes/routes.ts')).toBeUndefined();
  });

  it('the providers do not import or mount a RouterProvider', () => {
    const providers = fileAt(emit().files, 'app/providers.tsx') ?? '';
    expect(providers).toContain('ThemeProvider');
    expect(providers).not.toContain('RouterProvider');
    expect(providers).not.toContain('@/routes/routes');
  });

  it('the page still renders nothing, as it always did', () => {
    expect(fileAt(emit().files, 'app/page.tsx')).toContain('return null;');
  });

  it('real `tsc --strict` accepts the whole project', () => {
    typecheckEmitted(emit().files);
  }, 120_000);
});

describe('a program with routes is unchanged (control)', () => {
  it('still emits the route table and mounts the RouterProvider', () => {
    const { context } = harness(compiledFrom(builderExpansionRaw()));
    const { files } = reactGenerator.generate(context);
    expect(fileAt(files, 'src/routes/routes.ts')).toContain('initial:');
    const providers = fileAt(files, 'app/providers.tsx') ?? '';
    expect(providers).toContain('<RouterProvider descriptor={routes}>');
    expect(providers).toContain("from '@/routes/routes'");
  });
});
