# ADR-28 amendment — catch-clause exception-parameter identity

- **Status:** Accepted and implemented (M8-S). Amends ADR-28 §3, §17.
- **Date:** 2026-08-22.

## 1. What ADR-28 left open

ADR-28 §3 gave an ordinary `final`/`var` local a real, declaration-tier symbol, and §17 was explicit
about what it did **not** cover: *"It does not authorize `for`-loop-variable or `catch`-clause-parameter
symbol minting — the same category of gap, measured only for ordinary `final`/`var` declarations here,
left for separate evidence."* This amendment supplies that evidence, for the exception-parameter half of
that gap only, and extends ADR-28's own identity scheme to cover it.

## 2. Evidence

**M8-O** (`docs/m8/m8o-transitive-action-reference-discovery.md` §17) traced a real Continuum site
(`_exportLogs`'s own `on Object catch (e)`) to exactly this gap, independently confirmed by **M8-N**
(`docs/m8/m8n-declaration-identity.md` §14) in its own real-corpus measurement — both recorded it as a
real, if narrow, adjacent gap and explicitly deferred it.

A fresh, M8-S-specific real-Continuum census (both apps, generate-stage, at `2c1fefd`) found `e` reported
`BRG3006` twice per app, and a broader source grep found **17 catch clauses** across the corpus
(`pairing_page.dart` ×2, `settings_page.dart`, `file_transfer_module.dart`, `secure_channel.dart`,
`file_system_transfer_storage.dart`), one of which (`pairing_page.dart:119`/`126`) also binds a
stack-trace parameter (`catch (e, s)`), read inside its own clause (`_log.severe('bootstrap failed', e,
s)`).

Direct inspection of the extractor (`dart/bridge_analyzer/lib/src/session/extract/statement_extractor.dart`,
`TryStatement` case) found the exception parameter was extracted as a bare `RawLiteral` string
(`exceptionName`) plus a nameless `Binding(binds: Binds.local)` — genuinely different from ordinary
locals' own pre-ADR-28 state (which at least had a `logic.VarDecl` node, merely with the wrong identity
tier). A catch-clause exception binding had **no declaration node at all**.

A second, independent, load-bearing defect was found in the same investigation, in the generator
(`packages/generators/react/src/internal/emit/statement.ts`'s `logic.TryCatch` case): the emitted JS catch
parameter was read from a field named `exception`, which has never existed in the schema (the real field
is `exceptionName`) — so the emitted binding was, unconditionally, the hardcoded fallback `error`,
regardless of the source's own name. This was masked until now: every read of the exception variable
already failed as `BRG3006` before the mismatch could matter. Fixing identity resolution alone, without
also fixing this, would have created exactly the silent-wrong-code hazard this project's own discipline
exists to prevent — a read that resolves successfully under one identifier while the actual `catch (...)`
binds a different one.

## 3. Declaration-tier identity rule

The identical shape ADR-28 §3 already defines for an ordinary local applies to a catch clause's own
exception binding, using the *same* symbol scheme, unmodified:

```
Symbols.local(name, {required String owner, required int ordinal})
  → 'local:$path#$owner.$ordinal.$name'
```

**The ordinal sequence is shared with ordinary locals, not separate.** `scope.dart`'s
`_OrdinalVisitor` — the single, deterministic, pre-order pass ADR-28 §3 already requires — now also
visits `CatchClause.exceptionParameter`, numbering it in the *same* monotonic count as every
`VariableDeclarationStatement` it already numbers. A separate, independent counter for catch bindings
was considered and rejected: since the symbol string includes both `ordinal` and `name`, two
independently-zeroed counters could produce the identical `(ordinal, name)` pair for an ordinary local and
a catch binding sharing a name in the same owning body (e.g. `final total = 1;` followed by
`catch (total)`) — a real, avoidable collision a shared counter makes structurally impossible, proven
directly by a dedicated test (`extraction_test.dart`, "an ordinary local and a catch exception binding
share one ordinal sequence") and by the real fixture's own `_mixed` action (§7).

## 4. What this amendment authorizes, and what it does not

**Authorized and implemented:** the exception parameter only (`catch (e)`'s own `e`, or the first binding
of `catch (e, s)`).

**Not authorized:** the stack-trace parameter (`catch (e, s)`'s own `s`). This is a materially different
mapping question, not merely a smaller instance of the same one: JavaScript's `catch` has exactly one
binding slot. The nearest analogue to Dart's stack trace, `error.stack`, is a *property read* on the
caught value, not a second declared parameter — giving `s` a `logic.VarDecl` and a real target would still
leave the generator with no principled place to bind it. Left exactly where it already was (an untargeted
`logic.Ref`, `BRG3006` on any read) — a real, separate, narrower gap for a future milestone, not silently
folded into this one. `for`-loop variables remain out of scope too, unchanged from ADR-28 §17 — no new
evidence was gathered for that case this milestone.

## 5. Schema

**Additive only.** `CatchClause` (`packages/uir/schema/l1.json`) gains one new optional field,
`exceptionDecl: VarDecl` — a real, declaration-tier `logic.VarDecl` with no `initializer` (already an
optional field on `VarDecl`; the runtime binds this value, not an expression). `exceptionName` (the
existing plain string) is retained, unchanged, for description; nothing currently reads it besides the
generator's own now-corrected fallback path (§2). No `x-uir-breaking` marker: no existing field's shape or
requiredness changes, and no committed fixture or corpus document contained a `logic.TryCatch` node before
this milestone (confirmed by direct search) — there is nothing for an additive field to break.

## 6. Normalization (N5) — no change required, and this is itself evidence

ADR-28 §11 already generalised N5's own closure-capture check from a name-based to a target-based,
`logic.VarDecl`-id-based test, walking the **whole** program (`walk(program)`, not `program.ofKind`, which
only scans top-level nodes) to build its "known local ids" set. A catch clause's own `exceptionDecl` is a
`logic.VarDecl`, nested inside `TryCatch.catches[].exceptionDecl` rather than a bare statement — but
`walk`'s own `collect()` visits every nested node generically, by structure, not by field name. Proven
directly: two new N5 tests (`n5.test.ts`) — a closure capturing a catch-bound exception declared *outside*
it is refused (`BRG2105`), and a closure that catches and reads its *own* exception lifts correctly —
both pass against the **unmodified** N5 pass. Zero lines of `n5_lift_closures.ts` changed this milestone.

## 7. Generator — one function corrected, one already-generic function needed nothing

`statement.ts`'s `logic.TryCatch` case now reads `exceptionDecl.name` when present (falling back to the
corrected `exceptionName` field, then `'error'`, for a clause with no exception parameter at all — the
first fallback step also fixes the pre-existing `exception`-vs-`exceptionName` field-name bug, §2).
`expression.ts`'s `localBindingsIn` — already a generic, recursive walk over an action body finding every
`logic.VarDecl` with a real id — needed no change at all: it already picks up an `exceptionDecl` wherever
it is nested, the same way it already picks up an ordinary local. Confirmed live on real, analyzer-produced
Dart: `fixtures/apps/catch_clause`'s own `_mixed` action emits

```ts
const total = 1;
try {
  _log.set(`total is ${total}`);
} catch (total) {
  _log.set(`mixed failed: ${total}`);
}
```

— the inner `catch (total)` correctly shadowing the outer `const total = 1`, exactly reproducing Dart's
own lexical scoping, with the two `total`s never confused (`catch_clause_build.test.ts`).

## 8. Rejected alternative — a second, independent symbol scheme (`Symbols.catchException`)

Considered and rejected. A separate scheme would need its own collision-freedom proof against ordinary
locals sharing a name (exactly the case §3 shows a shared counter already handles for free) and would add
a second declaration-tier identity concept for no benefit ADR-28's own scheme does not already provide —
a catch-bound exception is, architecturally, no different from an ordinary local once given a real
`Element` and an ordinal: both are values bound once, read from a fixed lexical position, never
referenced outside the one body that declares them (ADR-28 §14's own reasoning applies unchanged).

## 9. Rename/edit stability, cross-file behaviour

Not claimed, not required — identical reasoning to ADR-28 §13/§14, unchanged: a catch-bound exception's
own `Element` never resolves outside the one function it is declared in, and nothing outside the single
extraction pass that mints its symbol and consumes it (the same pass, via `_reference`) ever looks it up
again.

## 10. Migration / schema-version consequences

None beyond ADR-28 §16's own precedent, applied to one more, newly-introduced field: `exceptionDecl` did
not exist before this milestone, so no existing document's id values change — this is a wholly new,
additive capability, not a re-derivation of an existing one.
