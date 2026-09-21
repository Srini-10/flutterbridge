import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { cleanupBuildProofTemporaries, compiledFrom, fileAt, harness, inlinePushDynamicRaw, typecheckEmitted } from './support.js';

// ADR-0077: an inline push whose arguments only the call site can compute. Real analyzer output in, real `bridge normalize`, real
// generator, real `tsc` — and `e2e/tests/dynamic-push.spec.ts` runs the same fixture in a browser.

afterAll(cleanupBuildProofTemporaries);

const nodes = compiledFrom(inlinePushDynamicRaw());

describe('a push that carries live values', () => {
  it('N11 refuses nothing: an in-memory destination has no URL to fail to fit', () => {
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);
    expect(reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(files.length).toBeGreaterThan(0);
  });

  it('the push carries what only it can compute, in the component’s own prop names', () => {
    const { context } = harness(nodes);
    const home = fileAt(reactGenerator.generate(context).files, 'src/components/home-screen.tsx') ?? '';
    const push = home.match(/router\.push\(\{[^\n]*\}\);/)?.[0] ?? '';

    expect(push).toContain("kind: 'component'");
    expect(push).toContain('owner: props.owner'); // the caller's own constructor parameter
    expect(push).toContain('label: label'); // a local
    expect(push).toContain('item: item'); // a live object, not a string
    expect(push).toMatch(/header: <Text>\{`Header for \$\{label\}`\}<\/Text>/); // a widget, as JSX
    expect(push).not.toContain('heading'); // the constant is the page module's
  });

  it('the page module binds only the constant, and lets the push supply the rest', () => {
    const { context } = harness(nodes);
    const page = fileAt(reactGenerator.generate(context).files, 'app/page.tsx') ?? '';

    expect(page).toContain('function DetailScreenRoute(passed: ComponentProps<typeof DetailScreen>)');
    expect(page).toContain("<DetailScreen {...passed} heading={'Details'} />");
    const wrapper = page.match(/function DetailScreenRoute[\s\S]*?\n}\n/)?.[0] ?? '';
    expect(wrapper).not.toMatch(/owner=|label=|item=|header=|onPick=/); // nothing the page module cannot know
  });

  it('typechecks', () => {
    const { context } = harness(nodes);
    typecheckEmitted(reactGenerator.generate(context).files);
  });
});
