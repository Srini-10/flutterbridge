# Quick start

Five minutes, starting from a Flutter project.

## 1. Point FlutterBridge at it

```bash
cd path/to/your/flutter/app
bridge init
```

That writes `bridge.json` with every default spelled out, so the file is also the documentation:

```json
{
  "source": ".",
  "out": "build/bridge",
  "work": ".bridge",
  "generator": "@bridge/gen-react",
  "plugins": ["@bridge/widgets-material"],
  "diagnostics": { "level": "warning" },
  "build": { "typecheck": true }
}
```

## 2. Check the machine

```bash
bridge doctor
```

```text
  ok   configuration      bridge.json
  ok   Flutter project    pubspec.yaml
  ok   resolved packages  .dart_tool/package_config.json
  ok   Dart SDK           /usr/local/bin/dart
  ok   analyzer           dart/bridge_analyzer/bin/bridge_analyzer.dart
  ok   generator          @bridge/gen-react
  ok   catalog            @bridge/widgets-material

ready to build.
```

If `resolved packages` fails, run `flutter pub get` — the analyzer reads the resolved package graph, not
the source text.

## 3. Build

```bash
bridge build
```

```text
  ok   analyze     9631ms
  ok   normalize   15ms
       56 nodes
  ok   generate    9ms
       wrote 10 file(s) to build/bridge
  skip typecheck   dependencies are not installed. Run `npm install` in build/bridge, then build again.

build succeeded.
```

## 4. Run the result

The output is an ordinary Next.js project.

```bash
cd build/bridge
npm install
npm run dev
```

## When it does not build

`bridge build` stops at the first stage that fails and prints what the compiler refused, with the
subsystem that owns each gap. **Nothing is written when generation reports an error** — a partial project
would compile around the holes and fail where they are.

Start with [Troubleshooting](../troubleshooting.md), which lists the constructs a real application hits most
often and what each one needs.

Try [`examples/counter`](../../examples/counter) first if you want to see a build that succeeds end to end.
