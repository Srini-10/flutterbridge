# The compiler (`packages/compiler`)

The normalizer. It takes a UIR document — whatever produced it — and turns it into the one canonical
form every generator is written against.

It is **not** the analyzer, and the split is not a matter of taste. ADR-2 draws the line: `bridge_analyzer`
**extracts**, `bridge_uir` **defines the model**, this package **normalizes**. Normalization must be shared
by every frontend, and a pass that lived inside the Flutter analyzer could only ever normalize Flutter.

Everything below was verified against the implementation during the M2 hardening pass. Where a number
appears, it was measured; where an invariant appears, a test asserts it.

---

## 1. What the compiler is not allowed to know

**No framework.** No framework name appears in compiler *code* — not in a condition, not in a diagnostic
message. (`Scaffold` and `Container` appear in comments, in the prose explaining why the compiler must not
know them; that is the only place they are allowed to.) Every framework fact comes from a widget catalog,
loaded at runtime by the plugin host. A pass asks `context.widgets.slotsOf(widget)` and gets an answer, or
gets nothing and does less.

This was audited comment-stripped during the hardening pass. One violation was found and fixed: `BRG2104`
named Flutter and `snapshot.hasData` in its message text, which would be simply wrong advice for a SwiftUI
or React Native frontend feeding the same UIR.

**No analyzer.** The compiler has never seen a Dart AST, an `Element`, or a `DartType`. It reads NDJSON.

**No adapter, statically.** `compiler-no-static-plugin-import` (dependency-cruiser, plus a negative test
in `tools/verify-depcruise-negative.mjs`) forbids the compiler from importing a catalog package. It may
only receive one through `PluginHost.load(specifiers)`, which dynamic-imports at runtime.
`@bridge/widgets-material` appears in the compiler's `devDependencies` — for tests — and nowhere else.

These are checked mechanically, not by review.

---

## 2. The document, and refusing it

`load(document, manifest?)` parses NDJSON into a `Program`.

It **refuses** a document whose `schemaHash` is not this build's `UIR_SCHEMA_HASH`, and one whose record
count does not match its manifest. Both are hard failures, not warnings. A document from a foreign schema
does not *mostly* work — it works right up until a field means something else, and then the compiler is
quietly wrong, which is the one thing it may never be. (INV-5; the CLI surfaces this as exit code 3.)

A `Program` is immutable. Its nodes are:

- **deduplicated by id** — two records with one id are one node, because ids are content-addressed and an
  id denotes exactly one content;
- **sorted by `(kind, id)`** — so the output bytes do not depend on the order the frontend happened to
  emit things in;
- **serialized with `canonicalEncode`**, never `JSON.stringify` (§3).

---

## 3. Identity and canonical form

### Canonical JSON (Spec v2.3 §A15/§A16)

Keys sorted by **UTF-16 code unit**, nulls omitted, and **canonical numbers**: shortest round-trip form,
no trailing `.0`, unsigned zero, NaN and infinity prohibited, integer-typed values above 2⁵³−1 prohibited.

The encoder is *generated from the schema into both Dart and TypeScript*, so the analyzer and the compiler
produce the same bytes for the same node. They did not always: Dart wrote the double `100.0` as `100.0`
and JavaScript wrote it as `100`, and a node with two byte-forms has two ids (ISSUE-17). **Node identity
is defined by canonical serialization, not by the implementation language.**

### Two-tier node ids (ADR-17)

| | derivation | why |
|---|---|---|
| **Declaration** | `sha256('d:' + symbol)[:16]` | Editing a method body must not change the id of the signal it writes. The symbol is a source coordinate (`sig:lib/login.dart#_LoginState._email`). |
| **Tree node** | `sha256('n:' + canonicalEncode(stripIdentity(content)))[:16]` | Two identical subtrees *are* the same node. The id is a function of the content, so an unchanged subtree keeps its id across builds — which is what makes incremental compilation and stable override anchors possible. |

`stripIdentity` removes `id`, `anchor` and `span` **recursively** before hashing: a node's id must not
depend on where it appears, and a child's id carries no information the content does not already have.

**The symbol is not carried in the document.** It exists only inside the analyzer. So a declaration's id
*cannot be recomputed* from a document — a fact `bridge explain` states plainly rather than mistaking a
healthy declaration for a corrupt one.

Verified across the corpus: **all 37,449 nested nodes' ids equal the hash of their canonical content, with
zero mismatches** (`fixture_app_test.dart`, "every tree node in the emitted document is content-addressed").
`builder/validation.dart` separately checks *injectivity* — that one id never denotes two different
contents — which catches a collision but would not catch a builder that minted ids some other way.

---

## 4. The pipeline

Spec §3.3 fixes eleven passes and their order. The numbering is **permanent**.

| | pass | contract today |
|---|---|---|
| N1 | desugar-cascades | verify |
| N2 | desugar-collection-ctrl | verify |
| N3 | expand-builders | verify |
| N4 | normalize-async-ui | verify |
| N5 | lift-closures | rewrite |
| N6 | const-fold | rewrite |
| N7 | flatten-wrappers | rewrite |
| N8 | extract-slots | verify, with one lossless rewrite |
| N9 | key-inference | rewrite |
| N10 | theme-tokenize | rewrite |
| N11 | promote-cross-route-state | rewrite |

Every pass has one contract with two halves — **normalize if necessary, otherwise verify the invariant.**
N1–N4 are, today, the second half: the Flutter frontend already emits `ui.Cond`, `ui.List` and `ui.Async`,
so those passes assert that it did rather than redo it. A less canonical frontend will find them working.

A pass that a *particular* frontend makes redundant is **not deleted**, because deleting it would make the
pipeline's shape depend on which frontend fed it — and then the pass numbering means nothing across
frontends, and the IR is not universal.

### The pass contract

Pure, deterministic, idempotent — and it **returns the identical object when it changed nothing**.

Identity, not deep equality. `manifest.changed` is a pointer comparison, which is what makes "the pipeline
reached a fixed point" cheap to check and what makes a pass that finds nothing to do cost nothing.

### The pass manager

- validates the dependency graph (`requires`) and **refuses a pipeline containing an unimplemented pass**;
- computes analyses **on demand**, seeded fresh; an invalidation causes a recompute, not a fatal;
- emits a `NormalizationManifest` recording, per pass, `{id, name, changed, diagnostics}`.

### One tree rewrite

`internal/normalize/tree.ts` — `mapTree(value, visitor)`. Five passes used to hand-roll this, and five
copies of a traversal are five places for the same-object contract to break independently.

- `node(n)` — replace a node. Runs **bottom-up**: `(1 + 2) * 3` folds the sum before the product.
- `item(i)` — splice or drop an item *after* visiting it.
- `prune(i)` — drop an item **before descending into it**.

`prune` is not an optimization. A `ui.Cond` that can never render is dropped whole, and nothing inside it
is visited — because visiting it means reporting diagnostics about code that is about to stop existing. A
warning pointing inside a branch that cannot render sends someone hunting a bug that cannot fire.

**N5 deliberately does not use `mapTree`.** It is pre-order and short-circuiting: when it meets a
`bind.Expr(logic.Lambda)` it decides the fate of the whole lambda and never descends into its body. A
bottom-up walk would reach the closures nested *inside* a callback first and lift those, which is a
different program.

---

## 5. Plugins and the catalog

**One source of framework metadata.** `catalog/widgets/material.json` — 59 widgets — is generated by
`tools/catalog-codegen` into *both* Dart (for the analyzer's adapters) and TypeScript (for the compiler's
registry). Framework metadata is never authored twice (ADR-18); `just codegen-check` fails CI on drift.

**`PluginHost.load(specifiers)`** dynamic-imports each catalog. A specifier that does not resolve is a
**hard failure**, never a shrug: skipping it produces a compiler that silently knows less than it was
configured to know, and the symptom is not an error — it is a generated application missing a layout
nobody can explain. Plugins are then sorted by name, so the order they were listed in cannot matter.

**`WidgetRegistry.from(plugins)`** merges catalogs by `(priority, name)`. A widget described by two
catalogs at the *same* priority is `BRG2108`, an error: which one won would depend on the order of a list,
and the meaning of a user's program may never depend on that. A widget's `library` **matches as a prefix**
(`package:flutter/` matches `package:flutter/src/material/scaffold.dart`).

A widget the registry has never heard of is a **gap, not a violation**. The compiler does less, and says
so; it never guesses.

---

## 6. Determinism

The same input produces the same bytes, on every machine, in every locale. Every ordering source, and how
it is pinned:

| source | how |
|---|---|
| node order | sorted by `(kind, id)` |
| object keys | `canonicalEncode` sorts recursively, by code unit |
| numbers | canonical form (§A15) — identical in Dart and TypeScript |
| plugin order | sorted by name |
| catalog merge | sorted by `(priority, name)`; same-priority conflict is an error |
| nav-graph transitions | sorted by id — "a set has no traversal order" |
| filesystem traversal | `sortedPaths(...)` over `listSync` (analyzer) |
| cache eviction | sorted by `(lastAccessed, path)` — never by directory iteration order |
| codegen sorts | **code-unit comparison, never `localeCompare`** |
| diagnostics | pass order, then traversal order — both deterministic |

`localeCompare` was removed during the hardening pass. Collation is an ambient property of the host: it
depends on ICU data and on `LANG`/`LC_COLLATE`, neither of which is an input to this compiler. Under
`tr_TR` the dotted and dotless `i` do not sort where an English locale puts them, and
`'a'.localeCompare('B')` is negative in every locale while code-unit order says positive. A compiler that
promises byte-identical output cannot sort by a rule the machine chooses.

There is **no** time, randomness, PID, environment variable, or hash-order iteration anywhere in the
compiler. Dart's default `Map` is insertion-ordered, and no `HashMap`/`HashSet` is used.

Verified: program bytes, diagnostics **and** the normalization manifest are identical across repeated runs
on all three corpus applications.

---

## 7. Diagnostics

Codes are ranged: `BRG0xxx` environment, `BRG1xxx` extraction, `BRG2xxx` normalization, `BRG3xxx`
generation, `BRG4xxx` verification.

Normalization owns **BRG2101–BRG2116** and **BRG2301–BRG2303**. A pass reports through
`context.report(...)`; the manager attaches each diagnostic to the pass that raised it and to the node id
it concerns. Order is deterministic (pass order, then traversal order).

Severity is a claim about what a generator would have to do:

- **error** — the program is not fit to generate from. Something would have to be invented.
- **warning** — a generator *can* proceed, but will have to guess at something the frontend should have
  stated.
- **info** — the compiler changed something, and is telling you what and why.

A diagnostic is never emitted for a node the pipeline is about to delete (§4, `prune`).

---

## 8. Performance

Measured on the corpus (M2 hardening pass; `wonderous` is 7.1 MiB, 726 top-level nodes, 30,103 nodes in
total):

| | hello_bridge | compass_app | wonderous |
|---|---|---|---|
| load (parse + validate + sort) | 0.9 ms | 15.8 ms | 52.2 ms |
| full pipeline N1..N11 | 2.5 ms | 25.6 ms | **90.0 ms** |
| canonical encode (`toNdjson`) | 1.1 ms | 21.5 ms | 83.8 ms |

The pipeline was **169 ms** on `wonderous` before the hardening pass. `walk`/`walkNode` were generators,
and `yield*` delegation costs O(depth) *per yielded node* — every value is re-yielded up through the whole
generator stack it came from. On the deepest corpus app one traversal cost 31.8 ms where the identical
visit set costs 3.5 ms eagerly: a **9× tax, paid eleven times**, once per pass. They are now eager. Same
visit set, same order, byte-identical output.

Nothing else was optimized, because nothing else measured.

---

## 9. Tooling

`bridge` (`packages/cli`) — nine read-only commands for looking at what the compiler did. It contains no
compilation logic (INV-17): `route-graph` *is* `navGraph()`, `graph` *is* `referencesOf()`, and
`bridge normalize` writes bytes **identical** to the compiler's own, asserted by a test.

See [`docs/tooling/bridge-cli.md`](../tooling/bridge-cli.md).
