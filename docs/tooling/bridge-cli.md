# `bridge` — the debugging surface

Nine read-only commands for looking at what the compiler did.

```
bridge <command> <document.ndjson> [options]
```

## The one rule

**These tools never compute a compiler fact themselves.**

`route-graph` *is* `navGraph()` — the same analysis N11 consumes. `graph` *is* `referencesOf()` — the same
edge set the loader links against. `normalize` runs the real `normalizationPipeline()` through the real
`PassManager`, and a test asserts its output is **byte-identical** to the compiler's own.

This is not fastidiousness. A debugger that computes its own answer will eventually disagree with the
compiler, and on that day it will send someone hunting a bug that does not exist while the real one goes
unnoticed. These tools are a window, not a second opinion.

**None of them changes how anything compiles.** `normalize` is the only command that writes at all, and it
writes a new file.

## Commands

| command | shows |
|---|---|
| `inspect` | what the document contains: nodes by layer and kind, and its manifest |
| `graph` | the reference graph — every node and every id it points at (`--dot` for graphviz) |
| `widget-tree` | the UI tree of every component, drawn |
| `route-graph` | the routes, what each renders, and every transition between them |
| `signal-graph` | every signal, who writes it, and who reads it |
| `normalize` | run N1..N11 and write the normalized document |
| `diagnostics` | run N1..N11 and report everything the passes said |
| `explain <node-id>` | one node in full: source, identity, edges, and its fate in each pass |
| `stats` | where the time goes, pass by pass |

## Options

| flag | |
|---|---|
| `--normalized` | run N1..N11 before looking. **Default: the document as the analyzer emitted it** — the honest default for a debugger is what is actually on disk. |
| `--json` | machine-readable output |
| `--dot` | graphviz (`graph` only) |
| `--verbose` | list every node a diagnostic fired on (`diagnostics` only) |
| `--out <path>` | where to write (`normalize` only; default stdout) |
| `--manifest <path>` | default `<document>.manifest.json` |
| `--plugin <spec>` | widget catalogs, comma-separated (default `@bridge/widgets-material`) |

## Exit codes

| | |
|---|---|
| `0` | fine |
| `1` | `diagnostics` found an error — the program is not fit to generate from |
| `2` | the command was wrong: no such file, unknown command, no such node |
| `3` | **the input was unfit** (INV-5): a foreign schema hash, a catalog that would not resolve |

`2` and `3` are not the same thing, and conflating them would teach a script to retry something that can
never work.

## `explain`, and what it will not claim

`explain` recomputes a node's id and checks it against the stored one. For a **tree node** that is a real
check — the id *is* `sha256('n:' + canonical content)`, and a mismatch is the most dangerous corruption
possible in this compiler, because every anchor, cache key and incremental decision rests on it.

For a **declaration** it is not a check at all, and `explain` says so:

```
  identity  declaration — sha256('d:' + symbol)
  id check  — symbol-addressed; the symbol is not carried in the document, so it cannot be
              recomputed here. Only the analyzer that minted it can check this one.
```

The symbol is a source coordinate that lives only inside the analyzer. A tool that called that "corrupt"
would call every healthy declaration in every document this compiler has ever produced corrupt.

## Example

```
$ bridge widget-tree app.ndjson
ui.Component LoginScreen dc12930f5139e6fc
└─ ui.Element Scaffold f11e9696460755dc
   ├─ appBar: ui.Element AppBar 278e55d7e1096c5f
   │  └─ title: ui.Text "Sign in" 997601895481774d
   └─ body: ui.Element Center e72a819780537503
      └─ ui.Element Column b666740c401b37a5
         ├─ ui.Text "Hello Bridge" da624709d914c751
         └─ ui.Cond d9b658b9a8ba1e0b
            └─ then: ui.Text d8952ce1c581320a

$ bridge explain app.ndjson b0f0296b
ui.Element b0f0296bb128d2f5

  source    lib/ui/wonder_illustration.dart:41:12
  identity  tree node — sha256('n:' + canonical content)
  id check  ✓ content hashes to b0f0296bb128d2f5 — the id is a function of the content

through the pipeline
  N6  const-fold                 ·
  N7  flatten-wrappers           removed
  N8  extract-slots              ·
```
