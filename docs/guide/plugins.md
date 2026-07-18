# Plugins: generators and widget catalogs

FlutterBridge has two extension points, both loaded **by name at runtime**. Neither the compiler nor the CLI
imports a plugin statically, and the first-party ones load exactly the way a third-party one does — which is
the guarantee that a Vue, Angular or Svelte generator can be added without touching the compiler
(Spec §1.2 rule 3).

| Extension | Answers | Default |
| --- | --- | --- |
| **Generator** | what target code looks like | `@bridge/gen-react` |
| **Widget catalog** | what a widget *is* — which parameters are slots, which hold ordered children | `@bridge/widgets-material` |

## Installing one

Install it in your Flutter project and name it in `bridge.json`:

```bash
cd my-flutter-app
npm install --save-dev @someone/bridge-gen-vue
```

```json
{
  "generator": "@someone/bridge-gen-vue",
  "plugins": ["@bridge/widgets-material", "@someone/widgets-cupertino"]
}
```

```bash
bridge doctor    # reports each plugin by name, and says where it looked if one is missing
```

`plugins` is a list because catalogs compose: a project using Material *and* a design-system package needs
both, and each contributes the widgets it knows about.

## How a specifier is resolved

In order:

1. **Your project directory** — so a package you install wins.
2. **The `@bridge/cli` install directory** — so the defaults work with nothing installed.

That order is the whole design. It means you can replace even a first-party plugin by installing your own
version locally, and it means `bridge init && bridge build` works out of the box without pretending the
defaults are built in.

When a plugin cannot be loaded, `doctor` prints every directory it searched:

```text
fail generator   plugin "@bridge/gen-vue" could not be loaded. Looked in:
                 /Users/me/my-flutter-app, /usr/local/lib/node_modules/@bridge/cli/
   → install @bridge/gen-vue, or change `generator`
```

> Before `0.1.0`, specifiers resolved relative to `@bridge/compiler` instead — which meant a plugin had to be
> a dependency *of the compiler*, and nobody outside this repository can add one of those. The rule was
> enforced on import statements and defeated by resolution.

## Writing a generator

A plugin is a package whose default export is a `BridgePlugin`:

```ts
import type { BridgePlugin, GeneratorContext, GeneratorOutput } from '@bridge/plugin-sdk';

const plugin: BridgePlugin = {
  name: '@someone/bridge-gen-vue',
  version: '1.0.0',
  generator: {
    target: 'vue',
    runtimeRange: '^1.0.0',
    generate(context: GeneratorContext): GeneratorOutput {
      return { files: [{ path: 'src/App.vue', contents: '…' }] };
    },
  },
};

export default plugin;
```

Three rules the SPI enforces, each for a reason worth knowing:

- **`generate` is pure and synchronous.** No filesystem, no clock, no randomness (ADR-22). It returns
  `EmittedFile[]`; the *CLI* writes them. This is what makes determinism testable by calling it twice — and
  `bridge validate` does exactly that, on your project.
- **`runtimeRange` declares which runtime kit your output is written against** (INV-12/INV-13). Emit the
  same range into your generated `package.json`, from one constant rather than two.
- **Depend only on `@bridge/uir` and `@bridge/plugin-sdk`.** A plugin that reaches into `@bridge/compiler`
  is coupled to compiler internals that are not API.

Report problems through `context.report` rather than throwing. A thrown error stops everything at the first
problem; a reported diagnostic lets the user see all of them at once, with a code and a source span.

## Writing a widget catalog

A catalog is framework metadata — authored once, generated into every domain (ADR-18):

```ts
const plugin: BridgePlugin = {
  name: '@someone/widgets-cupertino',
  version: '1.0.0',
  widgets: {
    name: 'cupertino',
    priority: 10,          // higher wins when two catalogs describe the same widget
    widgets: [ /* … */ ],
  },
};
```

What a catalog entry says is *structural*: which named parameter holds ordered children, which parameters
are slots, which are positional. Not what the widget looks like — that is the generator's business.

If your widgets come from a Dart package, the analyzer also needs an adapter to recognise them, and
recognition is **by resolved supertype, never by name** — C1 found 18 widgets misclassified by name. See
`dart/bridge_analyzer/lib/src/session/adapters/` and `catalog/widgets/gap.json`, which exists specifically
as a worked example of adding one package end to end.

## Testing a plugin

`@bridge/plugin-sdk` ships a conformance runner. At minimum, assert what the host will:

```ts
import { describe, expect, it } from 'vitest';
import plugin from '../src/index.js';

it('is loadable by the host', () => {
  expect(plugin.name).toBeTypeOf('string');
  expect(plugin.version).toBeTypeOf('string');
});

it('is deterministic', () => {
  const a = plugin.generator!.generate(context());
  const b = plugin.generator!.generate(context());
  expect(a.files).toEqual(b.files);
});
```

And check the thing that only shows from outside a workspace: **that your emitted `package.json` uses
registry-resolvable ranges**. `workspace:*` in generated output makes every generated app uninstallable with
`npm` — a real `0.1.0` defect, caught only by installing one for the first time.

## Publishing

Nothing registers a plugin anywhere. Publish it to npm; users install it and name it in `bridge.json`.

Name it so people can find it — `bridge-gen-<target>` or `bridge-widgets-<package>` — and declare
`@bridge/plugin-sdk` as a peer dependency so your plugin and the CLI agree on the interface.
