# CLI reference

```text
bridge <command> [options]
```

## Getting started

| Command | What it does | Exit |
| --- | --- | --- |
| `bridge init` | writes `bridge.json` with every default spelled out. `--force` overwrites | 0 |
| `bridge doctor` | checks the toolchain and says what to fix for each failure | 0 ok, 1 problems |
| `bridge build` | analyze → normalize → generate → typecheck | 0 ok, 1 refused, 3 input |
| `bridge validate` | `build`, then checks determinism and the normalization fixed point | 0 ok, 1 failed |
| `bridge version` | the tool's version, read from its own manifest | 0 |

## Stages

Each runs alone, for when a build stops somewhere.

| Command | What it does |
| --- | --- |
| `bridge analyze` | runs the analyzer over the Flutter project, writes `<work>/uir.ndjson` |
| `bridge generate` | normalizes and emits the target project into `<out>` |
| `bridge clean` | removes `<out>` and `<work>` |

## Inspection

These read a document and change nothing. They are how you find out *why* a build did what it did.

| Command | What it shows |
| --- | --- |
| `bridge inspect <doc>` | nodes by layer and kind, and the manifest |
| `bridge widget-tree <doc>` | the UI tree of every component, drawn |
| `bridge route-graph <doc>` | the routes, what each renders, and every transition |
| `bridge signal-graph <doc>` | every signal, who writes it, who reads it |
| `bridge graph <doc>` | the reference graph. `--dot` for graphviz |
| `bridge normalize <doc>` | runs N1–N11 and writes the normalized document |
| `bridge diagnostics <doc>` | runs N1–N11 and reports what the passes said |
| `bridge explain <doc> <id>` | one node in full, and its fate in each pass |
| `bridge stats <doc>` | where the time goes, pass by pass |

## Options

| Option | Applies to | Meaning |
| --- | --- | --- |
| `--json` | most | machine-readable output |
| `--config <path>` | project commands | the configuration file. Default: the nearest `bridge.json`, searching upward |
| `--quiet` | `build` | no progress reporting |
| `--force` | `init` | overwrite an existing file |
| `--normalized` | inspection | run N1–N11 before looking |
| `--out <path>` | `normalize` | where to write |
| `--plugin <spec>` | inspection | widget catalogs, comma-separated |

## Exit codes

Stable, and meant to be branched on.

| Code | Meaning |
| --- | --- |
| `0` | success |
| `1` | the program is not fit to build — the compiler refused something and said what |
| `2` | the command was wrong — a bad flag, a missing argument, an invalid `bridge.json` |
| `3` | an input was refused — a document from a foreign schema, a plugin that would not load |

`1` and `3` are deliberately different: `3` can never succeed on retry, and `1` can once the source changes.

## Output streams

Results go to **stdout**; progress and errors go to **stderr**. `bridge build --json | jq` works while a
human still sees progress.
