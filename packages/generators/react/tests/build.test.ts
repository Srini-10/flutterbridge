import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseUirNode, type AnyUirNode } from '@bridge/uir';
import { afterAll, describe, expect, it } from 'vitest';

import { reactGenerator } from '../src/index.js';
import { harness } from './support.js';

// The build-proof (M3-D) — the whole pipeline, over a program the analyzer really produced.
//
// ## Why this used to prove nothing, and now does
//
// It once typechecked emitted code against a **hand-built** UIR — a program no analyzer run ever emitted.
// That is exactly how the child-slot mismatch (validation B1) survived: the fixture put a single child in
// `slots`, which is what the generator wants, while the real analyzer put it in `children`, which is what
// broke. A build proof over an imagined program proves the imagination is consistent, not the pipeline.
//
// So the input is now the **committed golden** `fixtures/uir/layout_proof.ndjson` — real analyzer output,
// pinned byte-for-byte by `build_proof_test.dart`, which mints it from real Flutter source. This test takes
// it the rest of the way: the real compiler (N1–N11, through the `bridge` CLI), the real generator, and
// `tsc` against the real, unmocked `@bridge/runtime-react`. Flutter source → analyzer → compiler → generator
// → tsc, with no hand-built node anywhere. Drift in either half fails a test: the analyzer half here, the
// generator half in the Dart guard.
//
// ## What is not proved here
//
// `next build` and the browser: the emitted app imports only `react` and the kit (never `next`), so `tsc`
// covers every module the generator wrote. The App Router at runtime is `just e2e` (M4-T3, Playwright).

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const repoRoot = join(packageRoot, '..', '..', '..');
const runtimeSrc = join(packageRoot, '..', '..', 'runtimes', 'react', 'src', 'index.ts');
const goldenPath = join(repoRoot, 'fixtures', 'uir', 'layout_proof.ndjson');
const cli = join(repoRoot, 'packages', 'cli', 'bin', 'bridge.mjs');

const temporaries: string[] = [];
afterAll(() => {
  for (const dir of temporaries) rmSync(dir, { recursive: true, force: true });
});

/** Parses an NDJSON document the way the loader does — validating every line, never casting. */
function parse(document: string, label: string): AnyUirNode[] {
  return document
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => parseUirNode(JSON.parse(line), `${label}:${index + 1}`));
}

/**
 * The golden run through the **real compiler** (N1–N11), via the `bridge` CLI.
 *
 * Shelled, not imported: the generator does not depend on the compiler and must not start now, even in a
 * test — `bridge normalize` is the same entrypoint an author uses, so this exercises the contract as shipped.
 */
function compiled(): AnyUirNode[] {
  const dir = mkdtempSync(join(tmpdir(), 'bridge-compile-'));
  temporaries.push(dir);
  const raw = join(dir, 'raw.ndjson');
  const out = join(dir, 'normalized.ndjson');
  writeFileSync(raw, readFileSync(goldenPath));
  execFileSync('node', [cli, 'normalize', raw, '--out', out], { stdio: 'pipe' });
  return parse(readFileSync(out, 'utf8'), 'normalized');
}

/** Writes the emitted project to a temp directory and returns its root. */
function materialise(files: readonly { path: string; contents: string }[]): string {
  const root = mkdtempSync(join(tmpdir(), 'bridge-emit-'));
  temporaries.push(root);
  for (const file of files) {
    const full = join(root, file.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, file.contents);
  }
  return root;
}

/**
 * A tsconfig for the check — not the one the app ships with.
 *
 * It maps the workspace packages by path so `tsc` resolves the *real* kit source rather than a stub, and
 * drops the `next` plugin, which is a language-server concern `tsc` ignores anyway.
 */
function writeCheckTsconfig(root: string): string {
  const path = join(root, 'tsconfig.check.json');
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2023', 'DOM', 'DOM.Iterable'],
          jsx: 'react-jsx',
          module: 'ESNext',
          moduleResolution: 'Bundler',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          esModuleInterop: true,
          baseUrl: '.',
          paths: {
            '@/*': ['./src/*'],
            '@bridge/runtime-react': [runtimeSrc.replace(/\.ts$/, '')],
            react: [join(packageRoot, 'node_modules', '@types', 'react', 'index.d.ts').replace(/\.d\.ts$/, '')],
            'react/jsx-runtime': [
              join(packageRoot, 'node_modules', '@types', 'react', 'jsx-runtime.d.ts').replace(/\.d\.ts$/, ''),
            ],
          },
        },
        include: ['app/**/*.ts', 'app/**/*.tsx', 'src/**/*.ts', 'src/**/*.tsx'],
      },
      null,
      2,
    )}\n`,
  );
  return path;
}

// One pass through the whole pipeline, shared by every assertion below.
const nodes = compiled();
const generated = reactGenerator.generate(harness(nodes).context);
const componentSource =
  generated.files.find((file) => file.path === 'src/components/home-screen.tsx')?.contents ?? '';

describe('the emitted project compiles against the real runtime (M3-D build-proof)', () => {
  it('the compiler preserves the analyzer’s nodes and derives the Material role set on top (N10)', () => {
    // Until M4-B the fixture was pure layout and this asserted the compiler changed *nothing* — a fair claim
    // then, and a weaker proof than it looked: a chain in which one stage is a no-op does not demonstrate the
    // stage runs. The fixture now carries `ColorScheme.fromSeed`, so N10 has work to do, and the assertion
    // says what it actually is.
    const golden = parse(readFileSync(goldenPath, 'utf8'), 'golden');
    const goldenIds = new Set(golden.map((n) => n.id));

    // Nothing the analyzer produced is dropped or rewritten: normalization is additive for this fixture.
    expect([...goldenIds].every((id) => nodes.some((n) => n.id === id))).toBe(true);

    // And what it adds is the derived palette. The seed is the analyzer's one colour token; N10 turns it into
    // the 46 Material roles (ADR-13: the compiler owns the palette, because deriving it in the kit would mean
    // re-implementing Material's algorithm in every future runtime).
    const derived = nodes.filter((n) => n.kind === 'app.Token' && !goldenIds.has(n.id));
    expect(derived).toHaveLength(46);
    const roles = new Set(derived.map((n) => (n as unknown as Record<string, unknown>)['role']));
    // The role `Divider` declares, and so the one BRG3010 checks for — the reason the theme is in the fixture.
    expect(roles.has('outlineVariant')).toBe(true);
    expect(roles.has('primary')).toBe(true);
  });

  it('Flutter → analyzer → compiler → generator → tsc', () => {
    const { context, reported } = harness(nodes);
    const { files } = reactGenerator.generate(context);

    // Nothing in the fixture is outside the supported surface, so nothing may be refused. If this fires, the
    // generator is rejecting something it claims to support — or the analyzer drifted into a shape it cannot.
    expect(reported.filter((diagnostic) => diagnostic.severity === 'error')).toEqual([]);

    const root = materialise(files);
    const tsconfig = writeCheckTsconfig(root);
    // **`node typescript/lib/tsc.js`, not the `.bin/tsc` shim.**
    //
    // The shim is a shell script on Windows, and the executable npm writes beside it is `tsc.cmd` —
    // which `execFileSync` also refuses, because Node blocks `.bat`/`.cmd` without `shell: true`
    // (the CVE-2024-27980 mitigation). Both spellings failed the same way: the spawn threw before tsc
    // started, the error carried no stdout, and the test reported "does not typecheck" with **empty**
    // compiler output — which reads as a type error and is not one.
    //
    // `tsc.js` is a plain JavaScript entry point. Running it with the Node already executing this test
    // needs no shim, no shell and no quoting, and behaves identically on every platform. Two Windows
    // rounds went into learning that; the lesson is that a launcher is the wrong thing to depend on when
    // the thing you want is a script.
    const tsc = join(packageRoot, 'node_modules', 'typescript', 'lib', 'tsc.js');
    try {
      execFileSync(process.execPath, [tsc, '-p', tsconfig], { stdio: 'pipe', cwd: root });
    } catch (error) {
      const failure = error as { stdout?: Buffer; stderr?: Buffer };
      const output = `${failure.stdout?.toString() ?? ''}${failure.stderr?.toString() ?? ''}`;
      const dump = files.map((file) => `\n──── ${file.path}\n${file.contents}`).join('');
      expect.unreachable(`the emitted project does not typecheck:\n${output}\n${dump}`);
    }
  }, 120_000);

  // ── regressions on the real output — the three defects M3-D fixed, asserted where they lived ──

  it('B1 — a single-child wrapper renders its child as a `child` prop, never JSX children', () => {
    // `Center(child: …)` → the kit's `Center`, which reads `props.child`. Emitting `<Center><X/></Center>`
    // dropped the subtree at runtime and did not typecheck; the analyzer now keeps `child` a slot, and the
    // generator a `child={…}` prop.
    expect(componentSource).toMatch(/<SafeArea top=\{false\} child=\{/);
    expect(componentSource).toMatch(/<Align alignment=\{[A-Za-z.]+\} child=\{/);
    expect(componentSource).toMatch(/<Card elevation=\{2\} child=\{/);
    // A single-child wrapper never takes JSX children — that was the B1 bug, and it dropped the subtree.
    // Asserted across every wrapper the fixture uses, since one of them regressing is the failure mode.
    // A wrapper that took JSX children would need a closing tag; every one of these is self-closing, so the
    // absence of `</Wrapper>` is the property, stated directly rather than through a brace-matching regex.
    for (const wrapper of ['SafeArea', 'Align', 'Card', 'ClipRect', 'ClipRRect', 'AspectRatio', 'Opacity']) {
      expect(componentSource, wrapper).not.toContain(`</${wrapper}>`);
    }
  });

  it('B1 — nested single-child wrappers compose', () => {
    // Four deep, in the real app: a scroll view holding a constrained, padded, fractionally-sized child.
    expect(componentSource).toMatch(
      /<ConstrainedBox constraints=\{[^}]*\}[^]*?child=\{<Container[^]*?child=\{<FractionallySizedBox[^]*?child=\{<Opacity/,
    );
  });

  it('D1 — `\'use client\'` is the first line, before every import', () => {
    expect(componentSource.startsWith("'use client';")).toBe(true);
    const firstImport = componentSource.indexOf('import ');
    expect(firstImport).toBeGreaterThan(-1);
    expect(componentSource.indexOf("'use client';")).toBeLessThan(firstImport);
  });

  it('D2 — a kit value type used in the tree is imported, not left dangling', () => {
    // Named arguments, which is the M4-B lowering: Dart's `EdgeInsets.symmetric(horizontal: 16, vertical: 8)`
    // becomes one options object, sorted so the bytes do not depend on argument order. Before M4-B this exact
    // call was a hard `BRG3002` — the kit had carried the matching signature since M3-A with no way to reach
    // it — so this line is both the D2 regression and the proof that named-arg construction works.
    expect(componentSource).toContain('EdgeInsets.symmetric({ horizontal: 16, vertical: 8 })');
    expect(componentSource).toMatch(/import \{[^}]*\bEdgeInsets\b[^}]*\} from '@bridge\/runtime-react'/);
  });

  // ── M4-B: the infrastructure, proved through the same real chain ──

  it('the alignment model reaches the output — a kit static const, imported and named', () => {
    // `Alignment.bottomRight` is a `logic.Ref` to a static member of a framework value type. It lowers to the
    // same text with an import attached, which is only possible because the kit mirrors Dart's shape.
    expect(componentSource).toContain('Alignment.center');
    expect(componentSource).toMatch(/import \{[^}]*\bAlignment\b[^}]*\} from '@bridge\/runtime-react'/);
    expect(componentSource).toMatch(/<Align alignment=\{Alignment\.center\}/);
    // `Stack(alignment:)` was dropped entirely in M4-A for want of the value type; it now forwards.
    expect(componentSource).toMatch(/<Stack alignment=\{Alignment\.center\}/);
  });

  it('the constraint model reaches the output — BoxConstraints as an options object', () => {
    expect(componentSource).toContain('new BoxConstraints({ maxWidth: 400 })');
    expect(componentSource).toMatch(/import \{[^}]*\bBoxConstraints\b[^}]*\} from '@bridge\/runtime-react'/);
    expect(componentSource).toMatch(/<AspectRatio aspectRatio=\{1\.5\}/);
    expect(componentSource).toMatch(/<FractionallySizedBox widthFactor=\{0\.5\}/);
    expect(componentSource).toMatch(/<SafeArea top=\{false\}/);
  });

  it('the theme carries `role`, so a component can ask for one (INV-20)', () => {
    const theme = generated.files.find((file) => file.path === 'src/theme/tokens.ts')?.contents ?? '';
    // 46 derived roles plus the seed the author wrote. `role` was dropped at this boundary until M4-B, which
    // was invisible only because N10 sets `name` and `role` to the same string.
    expect(theme).toContain("role: 'outlineVariant'");
    expect(theme).toContain("role: 'primary'");
    // The colour form is ADR-21's: N10's derived roles are opaque `#RRGGBB`.
    expect(theme).toMatch(/light: '#[0-9A-F]{6}'/);
  });

  // ── M4-C: assets, icons and the Material family, through the same real chain ──

  it('both spellings of Image.asset reach the output, with the catalog-named prop (ADR-0023)', () => {
    // Before M4-C the path arrived as `_positional0` and `Image` could not be rendered at all. The catalog
    // names the positional argument per constructor, so `Image.asset` gives `name` and `Image.network` `src`.
    expect(componentSource).toMatch(/<Image fit=\{BoxFit\.cover\} name=\{'images\/logo\.png'\} \/>/);
    expect(componentSource).toMatch(/<Image src=\{'https:\/\/example\.com\/a\.png'\} \/>/);
  });

  it('a constructed ImageProvider lowers as itself, imported from the kit', () => {
    // The third spelling: `Image(image: AssetImage(...))`. It needed no ADR — a provider is a `logic.New` of
    // a `package:flutter/` type, which M4-B's kit-provided path already lowered.
    expect(componentSource).toContain("new AssetImage('images/bg.png')");
    expect(componentSource).toMatch(/import \{[^}]*\bAssetImage\b[^}]*\} from '@bridge\/runtime-react'/);
  });

  it('Icons.star is folded to its codepoint, so no icon table is shipped', () => {
    // `Icons.star` is `IconData(0xe5f9, fontFamily: 'MaterialIcons')`. 0xe5f9 is 58873. Emitting the *name*
    // would oblige the kit to carry Flutter's ~2000-entry Icons table for it to resolve.
    expect(componentSource).toContain(
      "new IconData({ codePoint: 58873, fontFamily: 'MaterialIcons' })",
    );
    expect(componentSource).not.toContain('Icons.star');
  });

  it('a Dart enum member lowers as a member access, which needs the kit to export the value', () => {
    // The M4-C finding: a real enum reaches the generator as `logic.Ref BoxFit.cover`, never as
    // `bind.Const 'cover'` — so WIDGET_MAP's enum tables had only ever been exercised by hand-built UIR.
    // This asserts the path that real analyzer output actually takes.
    expect(componentSource).toContain('fit={BoxFit.cover}');
    expect(componentSource).toMatch(/import \{[^}]*\bBoxFit\b[^}]*\} from '@bridge\/runtime-react'/);
  });

  it('the Material family the metadata unlocked reaches the output', () => {
    expect(componentSource).toMatch(/<Card elevation=\{2\}/);
    expect(componentSource).toMatch(/<Opacity opacity=\{0\.8\}/);
    expect(componentSource).toMatch(/<Container alignment=\{Alignment\.center\} decoration=\{[^]*?padding=\{EdgeInsets\.all\(8\)\} width=\{200\}/);
  });

  it('the asset manifest holds every referenced asset and nothing else', () => {
    const manifest = generated.files.find((file) => file.path === 'src/assets/manifest.ts')?.contents ?? '';
    expect(manifest).toContain('"images/logo.png": "/assets/images/logo.png"');
    expect(manifest).toContain('"images/bg.png": "/assets/images/bg.png"');
    // A URL is not an asset: `Image.network` ships no file, so it has no manifest entry.
    expect(manifest).not.toContain('example.com');
    // Sorted, so the bytes do not depend on the order the tree was walked.
    const keys = [...manifest.matchAll(/"([^"]+)": "\/assets\//g)].map((match) => match[1]);
    expect(keys).toEqual([...keys].sort());
  });

  it('the scaffold provides the manifest, so an Image can resolve one', () => {
    const providers = generated.files.find((file) => file.path === 'app/providers.tsx')?.contents ?? '';
    expect(providers).toContain('<AssetProvider manifest={assetManifest}>');
    expect(providers).toMatch(/import \{[^}]*\bAssetProvider\b[^}]*\} from '@bridge\/runtime-react'/);
  });

  // ── M4-D: the widget families, through the same real chain ──

  it('the scrolling family reaches the output', () => {
    expect(componentSource).toMatch(/<SingleChildScrollView padding=\{/);
    expect(componentSource).toMatch(/<ListView shrinkWrap=\{true\}>/);
    expect(componentSource).toMatch(/<GridView crossAxisCount=\{2\} crossAxisSpacing=\{8\} mainAxisSpacing=\{8\}/);
  });

  it('the Material family reaches the output, tiles and chips and indicators', () => {
    // Slots are emitted sorted, and a leading icon's own value contains braces — so this matches the slot
    // names in order rather than trying to balance them.
    expect(componentSource).toMatch(/<ListTile leading=\{[^]*?subtitle=\{[^]*?title=\{[^]*?trailing=\{/);
    expect(componentSource).toMatch(/<ListTile title=\{<Text>\{'Second item'\}<\/Text>\} \/>/);
    expect(componentSource).toMatch(/<Chip label=\{/);
    expect(componentSource).toMatch(/<CircleAvatar radius=\{24\}/);
    expect(componentSource).toMatch(/<Badge child=\{/);
    expect(componentSource).toMatch(/<LinearProgressIndicator value=\{0\.4\} \/>/);
    expect(componentSource).toMatch(/<CircularProgressIndicator value=\{0\.75\} \/>/);
    expect(componentSource).toMatch(/<Tooltip message=\{'a hint'\}/);
  });

  it('clipping reaches the output, with the BorderRadius value type imported', () => {
    expect(componentSource).toContain('BorderRadius.circular(12)');
    expect(componentSource).toMatch(/import \{[^}]*\bBorderRadius\b[^}]*\} from '@bridge\/runtime-react'/);
    expect(componentSource).toMatch(/<ClipRect child=\{/);
  });

  it('a RichText span tree survives as a tree, not as flattened text', () => {
    // The point of a span tree is that nested runs share one paragraph's line breaking. Flattening it to a
    // string would lose the bold run; emitting a Text per run would lose the shared line box.
    expect(componentSource).toContain(
      "new TextSpan({ children: [new TextSpan({ fontWeight: 700, text: 'bold' })], text: 'a paragraph with ' })",
    );
  });

  it('SelectableText stays a SelectableText, rather than collapsing into Text', () => {
    // M4-D finding: the catalog gave it `role: 'text'`, which turns a widget into a `ui.Text` node carrying no
    // record of which widget produced it — so the one thing that distinguishes it was being dropped.
    expect(componentSource).toMatch(/<SelectableText data=\{'tap and hold to select'\}/);
  });

  // ── M4-E: colours and decoration ──

  it('every colour form becomes a token name, whatever it was written as', () => {
    // The four constant forms all hoist, and identical colours share one token — `Color(0xFF2196F3)` and
    // `Color.fromARGB(255, 33, 150, 243)` are the same colour, so they are the same token.
    expect(componentSource).toContain("<ColoredBox color={'colorFF2196F3'}");
    expect(componentSource).toContain("<ColoredBox color={'colorFFFFFFFF'}");
    // Two `ColoredBox`es, one token: the hex and the ARGB spelling converge.
    expect(componentSource.match(/colorFF2196F3/g)?.length).toBe(2);
  });

  it('a decoration lowers whole, with every nested colour a token name', () => {
    expect(componentSource).toContain(
      "new BoxDecoration({ border: Border.all({ color: 'color1F000000', width: 2 }), " +
        "borderRadius: BorderRadius.circular(8), " +
        "boxShadow: [new BoxShadow({ blurRadius: 4, color: 'color1F000000', offset: new Offset(0, 2) })], " +
        "color: 'colorFFFFFFFF' })",
    );
  });

  it('a gradient lowers as a list of token names', () => {
    expect(componentSource).toContain(
      "new LinearGradient({ colors: ['colorFFFFFFFF', 'color1F000000'] })",
    );
  });

  it('Material and Ink reach the output', () => {
    expect(componentSource).toMatch(/<Material borderRadius=\{BorderRadius\.circular\(4\)\} color=\{'colorFFFFFFFF'\} elevation=\{3\}/);
    expect(componentSource).toMatch(/<Ink decoration=\{[^]*?height=\{24\} width=\{80\}/);
  });

  it('every hoisted colour is a real token in the emitted theme', () => {
    // The other half of INV-20: the name a widget paints must resolve. A prop naming a token the theme does
    // not carry would be BRG3010 at build time, so this asserts the tokens actually arrived.
    const theme = generated.files.find((file) => file.path === 'src/theme/tokens.ts')?.contents ?? '';
    for (const token of ['colorFF2196F3', 'colorFFFFFFFF', 'color1F000000']) {
      expect(theme, token).toContain(`name: '${token}'`);
    }
    // Hoisted from a literal, so the value is the ARGB the author wrote — ADR-21's form, alpha first.
    expect(theme).toContain("light: '#FF2196F3'");
  });

  // ── M4-F: forms and input ──

  it('a TextEditingController is component state, and the field subscribes to it', () => {
    // The whole controller model, in two lines of emitted code. The controller is a `sig.Signal` because the
    // catalog lists `TextEditingController` among its `stateHolders`, so it lowers exactly as any other
    // component signal does — and the field reads the subscribed local, which is the reactivity edge.
    //
    // The spelling changed in M5-D: the subscription used to be `useSignal(_email)` inline at the read, and
    // is now hoisted to `const _email$ = useSignal(_email)` at the top of the component. Same edge, but
    // unconditional — see `declareLocalSignals`, and the defect that made it necessary.
    expect(componentSource).toContain('const [_email] = useState(() => signal(new TextEditingController()));');
    expect(componentSource).toContain('const _email$ = useSignal(_email);');
    expect(componentSource).toContain('controller={_email$}');
    expect(componentSource).toContain('const [_emailFocus] = useState(() => signal(new FocusNode()));');
  });

  it('a state-mutating callback becomes a typed local handler, not an unresolvable reference', () => {
    // The M4-F gap: normalization lifts a `setState` callback into a top-level `sig.Action`, and nothing
    // declared those in the component — so every one reached the emitter as `BRG3006`. They are now closures.
    expect(componentSource).toMatch(/const handle_[0-9a-f]{8} = \(value: string\) => \{\n\s*_note\.set\(value\);/);
    // Typed from the Dart parameter, including the nullable primitive that `bool?` is — a tristate
    // checkbox's own signature, and the case that exposed the `bool?` → `unknown` type bug.
    expect(componentSource).toMatch(/const handle_[0-9a-f]{8} = \(value: boolean \| null\) => \{/);
    // A handler is referenced, never re-created inline at the call site.
    expect(componentSource).toMatch(/onChanged=\{handle_[0-9a-f]{8}\}/);
    // And the parameter is a local, not a prop — this component has no props at all.
    expect(componentSource).not.toContain('props.value');
  });

  it('a validator lowers as a block-bodied arrow, with its parameter in scope', () => {
    // A lambda with a *statement* body — which every form validator is. Before M4-F this warned and then
    // handed the statement array to the expression emitter, which reported `<unknown>`.
    expect(componentSource).toMatch(/validator=\{\(value\) => \{/);
    expect(componentSource).toContain("return 'required';");
  });

  it('the input widgets reach the output with their decorations', () => {
    expect(componentSource).toMatch(/<TextField autofocus=\{true\} controller=\{_email\$\}/);
    expect(componentSource).toContain(
      "new InputDecoration({ hintText: 'you@example.com', labelText: 'Email' })",
    );
    expect(componentSource).toMatch(/<TextField [^>]*enabled=\{false\} obscureText=\{true\} readOnly=\{true\}/);
    expect(componentSource).toMatch(/<TextField [^>]*maxLines=\{4\} minLines=\{2\}/);
    expect(componentSource).toMatch(/keyboardType=\{TextInputType\.emailAddress\}/);
    expect(componentSource).toMatch(/textInputAction=\{TextInputAction\.next\}/);
    expect(componentSource).toMatch(/<Form child=\{/);
    expect(componentSource).toMatch(/<Checkbox onChanged=\{handle_[0-9a-f]{8}\} value=\{_accepted\$\}/);
    expect(componentSource).toMatch(/<Switch onChanged=\{handle_[0-9a-f]{8}\}/);
    expect(componentSource).toMatch(/<Slider divisions=\{10\} max=\{10\} min=\{0\}/);
  });

  it('no kit component contains a literal colour, and none is emitted (INV-20)', () => {
    // The invariant, asserted on the artefact rather than trusted: every colour in the emitted app arrives as
    // a token, so the component source names roles and holds no hex.
    expect(componentSource).not.toMatch(/#[0-9A-Fa-f]{6}/);
    expect(componentSource).not.toMatch(/rgba?\(/);
  });

  it('a component signal lives in the component and is read through the signal (ADR-15, ADR-4)', () => {
    // Declared through `useState`'s initialiser — never at module scope (INV-19) and never re-allocated each
    // render — and read through `.get()`, the reactive read, not the bare object (`[object Object]`).
    expect(componentSource).toMatch(/const \[_count\] = useState\(\(\) => signal\(3\)\)/);
    expect(componentSource).toContain('_count.get()');
  });
});

// ── M4-G: the application shell ───────────────────────────────────────────────────────────────────

describe('the application shell (M4-G)', () => {
  // Its own run, because the shared `generated` above discards the diagnostics — and "the shell reports
  // none" is half of what this block asserts.
  const shell = harness(nodes);
  const shellFiles = reactGenerator.generate(shell.context).files;
  const browseSource = shellFiles.find((f) => f.path === 'src/components/browse-screen.tsx')?.contents ?? '';
  const routesSource = shellFiles.find((f) => f.path === 'src/routes/routes.ts')?.contents ?? '';
  const pageSource = shellFiles.find((f) => f.path === 'app/page.tsx')?.contents ?? '';

  it('the app root is consumed, not rendered — no component file is emitted for it', () => {
    // The milestone's central finding. `ProofApp`'s render tree is a `MaterialApp`, and everything it carries
    // has already become an `app.Route` or an `app.Token`; the App Router project below *is* its lowering. A
    // `MaterialApp` component would mount the whole application a second time, inside itself.
    expect(shellFiles.map((f) => f.path)).not.toContain('src/components/proof-app.tsx');
    // And no emitted file mentions it at all — not as an import, not as a tag.
    for (const file of shellFiles) expect(file.contents, file.path).not.toContain('MaterialApp');
  });

  it('both routes reach the table, and `/` is what the root page renders', () => {
    expect(routesSource).toContain("{ name: 'browse', path: '/browse' }");
    expect(routesSource).toContain("{ name: 'root', path: '/' }");
    expect(routesSource).toContain("initial: 'root'");
    // The route at `/` is `HomeScreen`, and `app/page.tsx` renders it directly.
    expect(pageSource).toContain('<HomeScreen />');
  });

  it("a Scaffold's structural slots are props, and its body is a `main`", () => {
    // Seven slots, all single-child, all props — the B1 rule at the top of the tree.
    expect(componentSource).toMatch(/<Scaffold appBar=\{/);
    for (const slot of ['body', 'drawer', 'bottomNavigationBar', 'floatingActionButton']) {
      expect(componentSource, slot).toContain(`${slot}={<`);
    }
    expect(componentSource).not.toContain('</Scaffold>');
  });

  it("an AppBar's actions are JSX children and its other slots are props", () => {
    // `actions` is the catalog's `childrenProp` for AppBar — the case ADR-18 records as having cost a
    // milestone when extraction flattened it into props and "the UI structure was simply gone".
    // Not `[^>]*`: a slot's value is itself JSX and contains `>`, so the props of an AppBar span several
    // nested tags. `[^]*?` — any character including newlines, lazily — is what matches across them.
    expect(componentSource).toMatch(/<AppBar [^]*?title=\{<Text>/);
    expect(componentSource).toMatch(/<AppBar[^]*?<IconButton[^]*?<\/AppBar>/);
    expect(componentSource).toMatch(/bottom=\{<PreferredSize preferredSize=\{Size\.fromHeight\(32\)\}/);
  });

  it('a method tear-off resolves to the action it became, not to BRG3006', () => {
    // `onDestinationSelected: _select` — a method that writes state, so a `sig.Action`. Until M4-G the class
    // scope was frozen before the methods pass, so the reference carried no `target` and the generator
    // reported "`_select` is not declared in this program" while the action sat in the document, unreachable.
    expect(shell.reported.filter((d) => d.severity === 'error')).toEqual([]);
    expect(componentSource).toMatch(/onDestinationSelected=\{[A-Za-z_][A-Za-z0-9_]*\}/);
    expect(componentSource).not.toContain('undefined}');
  });

  it('a NavigationRail renders its non-Widget destinations as children (the BRG2110 fix)', () => {
    // `NavigationRailDestination` is not a Flutter `Widget`. Before the catalog named `destinations` as the
    // rail's children property, the whole list sat in `props` as a `logic.ListLit` and N8 reported BRG2110 —
    // a diagnostic whose message blamed the frontend for what was missing metadata.
    expect(browseSource).toMatch(/<NavigationRail[^]*?<NavigationRailDestination[^]*?<\/NavigationRail>/);
    expect(browseSource).toMatch(/<BottomNavigationBar[^]*?<BottomNavigationBarItem[^]*?<\/BottomNavigationBar>/);
    // The widgets *inside* those items survived as elements rather than as constructor expressions.
    expect(browseSource).toMatch(/<NavigationRailDestination icon=\{<Icon /);
  });

  it('the intrinsic-sizing pair renders, and nothing about it is refused', () => {
    // M4-D classified `IntrinsicWidth`/`IntrinsicHeight` as needing measurement, grouped with `FittedBox`.
    // M4-G separates them: CSS `max-content` *is* Flutter's maximum intrinsic dimension.
    expect(browseSource).toMatch(/<IntrinsicHeight child=\{/);
    expect(browseSource).toMatch(/<IntrinsicWidth child=\{/);
    expect(browseSource).toMatch(/<OverflowBox alignment=\{Alignment\.topLeft\} maxWidth=\{400\}/);
  });

  it('the whole shell emits no diagnostic at all', () => {
    // Not "no errors" — none. A realistic application shell is inside the supported surface now, and a
    // warning here would mean a prop was silently dropped from it.
    expect(shell.reported).toEqual([]);
  });
});

// ── M4-H: lazy lists, implicit animation, paged scrolling ─────────────────────────────────────────

describe('lazy lists and implicit animation (M4-H)', () => {
  it('a ListView.builder is a ui.List by the time the generator sees it', () => {
    // The whole M4-H scrolling result, asserted on the artefact. The builder is expanded in the *frontend*
    // — where the resolved scope is — so the generator receives the same `ui.List` a `for (x in xs)` would
    // produce and has no idea a builder was ever written.
    expect(componentSource).toMatch(/\{_wonders\$\.map\(\(item, index\) =>/);
    expect(componentSource).toContain('<ListTile title={<Text>{_wonders$[index]}</Text>} />');
  });

  it('a subscript lowers to a subscript, not to a method named `__`', () => {
    // `items[i]` is `items.operator[](i)` in Dart and `items[i]` in JavaScript — the same operator, spelled
    // the same way. Until M4-H it reached UIR as an opaque expression; the first thing the generic method
    // path did with it was emit `.__(index)`.
    //
    // The subject is the subscript, not the reactivity: this read is `_wonders$[index]` since M5-D, where it
    // was `_wonders.get()[index]` — an *unsubscribed* read that happened to work only because the enclosing
    // `.map` subscribed. Exactly B2's shape, one level in.
    expect(componentSource).toContain('_wonders$[index]');
    expect(componentSource).not.toContain('.__(');
  });

  it("N9's key lift reaches the output, and a ValueKey is unwrapped rather than constructed", () => {
    // N9's one real behaviour — lifting a key the author wrote onto the list — exercised against real
    // analyzer output for the first time. `ValueKey(x)` *is* `x`: constructing one per render would produce
    // a key that never matches itself.
    expect(componentSource).toMatch(/key=\{_wonders\$\[index\]\}/);
    expect(componentSource).not.toContain('new ValueKey');
  });

  it('the implicit-animation family emits as ordinary widgets with a duration and a curve', () => {
    // Not the animation engine. Each is a `ui.Element` whose props are ordinary bindings — `width` is a
    // `bind.Signal`, exactly as a plain Container's would be — and the kit turns duration + curve into a
    // CSS transition.
    expect(componentSource).toMatch(
      /<AnimatedOpacity curve=\{Curves\.easeInOut\} duration=\{new Duration\(\{ milliseconds: 300 \}\)\}/,
    );
    expect(componentSource).toMatch(/<AnimatedContainer [^]*?width=\{\(_expanded\$ \? 240 : 120\)\}/);
    expect(componentSource).toMatch(/<AnimatedAlign alignment=\{Alignment\.bottomRight\}/);
    // Not `[^}]*`: `new Duration({ milliseconds: 150 })` contains a brace of its own.
    expect(componentSource).toMatch(/<AnimatedPadding duration=\{[^]*?padding=\{EdgeInsets\.all\(12\)\}/);
  });

  it("a curve resolves through its holder class, which is not its value type", () => {
    // `Curves.easeInOut` has type `Curve`. The kit static-const path required the dotted prefix to *be* the
    // type's name, so it matched neither this nor `Colors.white` — and M4-E hoists every colour before it
    // gets here, which is why M4-H's fixture is the first to reach one.
    expect(componentSource).toContain('Curves.easeInOut');
    expect(componentSource).toContain('Curves.fastOutSlowIn');
  });

  it('a PageView renders its pages', () => {
    expect(componentSource).toMatch(/<PageView>/);
  });

  it('the whole proof emits no diagnostic at all', () => {
    // Restated here as well as in the shell block, because M4-H added the first `ui.List` this fixture has
    // ever carried and a keyless one would warn.
    const run = harness(nodes);
    reactGenerator.generate(run.context);
    expect(run.reported).toEqual([]);
  });
});

// ── M4-I: a package catalog, erased wrappers, and the disclosure/tab/chip families ────────────────

describe('packages, erasure and selection surfaces (M4-I)', () => {
  it('a widget from a third-party package renders, with its positional argument named', () => {
    // `Gap` is the most-used widget the M0 corpus contains that the compiler could not render — 115
    // instantiations, more than `Container`. It belongs to no framework, which is why six milestones of
    // Material triage never saw it. ADR-18's package path carries it: one catalog, one adapter, one line.
    expect(componentSource).toContain('<Gap mainAxisExtent={16} />');
  });

  it('a rebuild-scoping wrapper does not survive extraction (INV-22)', () => {
    // `ValueListenableBuilder` and `ListenableBuilder` exist only to narrow a rebuild, which under ADR-4 is
    // what the signal graph computes. INV-22: "no framework lifecycle or runtime primitive may survive
    // extraction". Asserted on the artefact — the emitted file must not mention either.
    expect(componentSource).not.toContain('ListenableBuilder');
    expect(componentSource).not.toContain('ValueListenableBuilder');
    // What survives is the body, and the notifier, which is state rather than machinery.
    expect(componentSource).toContain("<Text>{'ticks'}</Text>");
    expect(componentSource).toContain("<Text>{'listening'}</Text>");
    expect(componentSource).toMatch(/const \[_ticks\] = useState\(\(\) => signal\(new ValueNotifier\(0\)\)\)/);
  });

  it('the disclosure, tab and chip families reach the output', () => {
    expect(componentSource).toMatch(/<ExpansionTile initiallyExpanded=\{true\}/);
    expect(componentSource).toMatch(/<TabBar>[^]*?<Tab text=\{'One'\}/);
    expect(componentSource).toMatch(/<TabBarView>/);
    expect(componentSource).toMatch(/<ChoiceChip selected=\{_expanded\$\}/);
    expect(componentSource).toMatch(/<FilterChip selected=\{_accepted\$\}/);
    expect(componentSource).toMatch(/<ActionChip onPressed=\{/);
  });

  it('the whole proof still emits no diagnostic', () => {
    const run = harness(nodes);
    reactGenerator.generate(run.context);
    expect(run.reported).toEqual([]);
  });
});
