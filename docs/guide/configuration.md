# Configuration

FlutterBridge reads **`bridge.json`**, found by searching upward from the working directory — so commands
work from a subdirectory.

`bridge init` writes one with every default spelled out. A missing file is not an error: the defaults are
chosen so that a Flutter project with no configuration compiles.

## Reference

| Key | Default | Read by | Meaning |
| --- | --- | --- | --- |
| `source` | `"."` | `analyze` | the directory holding `pubspec.yaml` |
| `out` | `"build/bridge"` | `generate`, `build`, `clean` | where the emitted project is written |
| `work` | `".bridge"` | all stages | where intermediate documents go — the input to every inspection command |
| `generator` | `"@bridge/gen-react"` | `generate` | the plugin whose generator emits the project |
| `plugins` | `["@bridge/widgets-material"]` | all stages | widget catalogs. A package's catalog is how the compiler learns its widgets (ADR-18) |
| `diagnostics.level` | `"warning"` | `generate`, `build` | the lowest severity to **print** |
| `build.typecheck` | `true` | `build` | whether to typecheck the emitted project |

Paths are relative to the configuration file. Absolute paths are used as given.

## `diagnostics.level` does not suppress failures

It changes what is **shown**, and nothing else. An `error` still fails the build at every level. A filter
that could hide an error would be a filter that makes a broken build look clean.

## Plugin resolution

Specifiers resolve from **your project first**, then from the CLI's own directory. So a generator you
install wins over the bundled one, and the first-party generator works with nothing installed.

## Why JSON and not YAML

- The workspace has no YAML parser and needs none. Every authored configuration here is already JSON — the
  widget catalogs, `tsconfig`, `package.json`, the UIR schemas.
- `$schema` gives completion and validation in any editor with no plugin.

A `bridge.yaml` in your project is **not silently ignored**: `bridge doctor` reports it and says which
format is read.

## Unknown keys are reported

A typo is the common case, and being told that `outDir` is not a key — when `out` is — is the whole value
of noticing. Every problem in the file is collected and reported at once, not one per run.
