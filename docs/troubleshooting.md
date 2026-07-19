# Troubleshooting

Ordered by how often two real, unmodified production applications hit each one (M5-A measured this; the
counts are from a 113-file, 47 800-line app).

## The build says nothing was written

Generation refuses a program that carries an error, deliberately: a partial project would compile around
the holes and fail where they are. Every diagnostic names a **capability** and the **subsystem that owns
it**, so the message tells you whether it is your code or ours.

## `BRG3010` — a widget paints a role your theme does not define

**Most common cause: your app has no `ColorScheme`.** Add one:

```dart
MaterialApp(theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)))
```

That one line makes N10 derive all 46 Material roles. Without it, every themed widget is correctly
refused — INV-20 forbids inventing a colour.

## `BRG3006` — a name is "not declared in this program"

Several different causes wear this code. In descending order of frequency:

| The name | What it is | Status |
| --- | --- | --- |
| `context`, `widget`, `mounted`, `super`, `this` | framework primitives that should be erased at extraction (INV-22) | **known gap** — the largest one |
| `notifyListeners` | ADR-4 already rules that a signal write *is* the notification | **known gap** — blocks every `ChangeNotifier` store |
| a `final` field nothing mutates | a constant field of a component emits no node at all | **known gap** |
| `debugPrint`, `unawaited` | Dart SDK functions with no lowering | **known gap** |

None of these has a workaround in your source; they are compiler work.

## `BRG3004` — an opaque construct reached the generator

A Dart construct extraction does not model yet. Measured frequency:

| Construct | Uses |
| --- | --- |
| `is` checks | 131 |
| collection elements in map/set literals | 89 |
| records | 46 |
| collection-`if` outside a widget list | 31 |
| cascades (`..`) | 27 |
| adjacent string literals (`'a' 'b'`) | 25 |

Rewriting the expression is usually possible: `'a' 'b'` → `'ab'`, a cascade → separate statements.

## `BRG3013` — a capability is not built yet

The message names it and the owner. The big ones:

- **the gesture model** — `InkWell`, `onTap`, drag. No ADR needed; it is runtime work.
- **imperative navigation and overlays** — `Navigator.push`, `showDialog`, `SnackBar`. One schema
  amendment covers all of them; see [ADR-0024](../adr/0024-performing-a-navigation.md).
- **the explicit-animation family** — `AnimationController`, `AnimatedBuilder`. The *implicit* family
  (`AnimatedOpacity`, `AnimatedContainer`) works.

## `BRG3001` — a widget has no mapping

The full list of what *is* supported is [docs/guide/supported-widgets.md](guide/supported-widgets.md),
generated from the generator's own map so it cannot drift.

The message lists everything that is supported. If it is a **package** widget, the package needs a catalog
— which is one JSON file and one adapter (ADR-18). `Gap` was added that way in M4-I.

## `bridge doctor` says the analyzer was not found

The analyzer ships inside `@bridge/cli`, so this means the install is incomplete. Reinstall:

```bash
npm install -g @bridge/cli
```

To use an analyzer of your own — a checkout, or a compiled binary — point at it explicitly:

```bash
export BRIDGE_ANALYZER=/path/to/bridge_analyzer          # a native binary
export BRIDGE_ANALYZER=/path/to/dart/bridge_analyzer/bin/bridge_analyzer.dart   # or source
```

`doctor` reports which one it found and where it came from, as `(packaged, source)` or
`(BRIDGE_ANALYZER, binary)`.

## `analyzer packages` says the directory is not writable

The bundled analyzer resolves its own dependencies on first use, and `dart pub get` writes into the install
directory. Some system-wide global prefixes are read-only. Either resolve it yourself:

```bash
cd "$(npm root -g)/@bridge/cli/vendor/dart/bridge_analyzer" && dart pub get
```

…or install somewhere you own — `npm config set prefix ~/.npm-global` — and reinstall.

## The first build is slow, or fails without network

The first `bridge analyze` on a machine runs `dart pub get` for the bundled analyzer, which needs network
**once**. After that it is offline. If it failed partway, re-run it in the directory above.

Analysis is ~9 s per build and does not currently cache between runs. A native analyzer cuts it to ~3 s —
see [Installation](guide/installation.md#a-faster-analyzer-optionally).

## A document in `.bridge/` "cannot be read"

You upgraded FlutterBridge and the documents on disk were built against the previous UIR schema. This is a
deliberate refusal, not a bug — the old document would deserialize into something subtly different rather
than failing outright.

```bash
bridge clean && bridge build
```

## `npm install` in the generated app fails

Check the emitted `package.json` for a `workspace:` or `file:` range — those are workspace-only protocols
that no registry can resolve. A first-party generated project should only contain plain versions and caret
ranges. If you are using a third-party generator, this is a bug in that generator; see
[Plugins](guide/plugins.md#testing-a-plugin).

## `resolved packages` fails

Run `flutter pub get`. The analyzer reads Dart's resolved element model — types, not text — which needs
`.dart_tool/package_config.json`.

## The typecheck stage says "skipped"

The emitted project's dependencies are not installed. It is an ordinary npm project:

```bash
cd build/bridge && npm install
```

Then `bridge build` typechecks for real.

## My output differs from a colleague's, and we have the same source

Two host details can reach UIR, and both are platform differences rather than bugs in your program:

- **Line endings.** A CRLF checkout changes `span.length` — a source span counts its own line endings. Node
  ids and the emitted application are unaffected, but the documents differ and caches are not shared. Add
  `* text=auto eol=lf` to your project's `.gitattributes`.
- **A stale `.bridge/` from another machine.** Never share it; it is a build artefact. `bridge clean`.

If ids themselves differ, that is a defect — `span.file` is normalised to forward slashes precisely so they
cannot. Please report it.

## `pnpm run lint:deps` fails on Node 25

`dependency-cruiser` follows the Node release cycle and does not support 25. Use Node 22 or 24. Nothing
else in the toolchain is affected.
