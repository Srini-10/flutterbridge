# ADR-58 — Expression forms real code uses: throw, tear-offs, cascades, null-shorting, collection elements, checked casts

- **Status:** Accepted (M12, production-compatibility phase 2). Found in a real 240-file application: after the class model and SDK
  statics, the analyzer still preserved 76 function references, 67 throw expressions, 34 null-aware accesses, 27 spreads, 20 switch
  expressions, 18 constructor references, 11 collection-ifs, 8 cascades, 8 collection-fors and 4 rethrows as opaque expressions, and
  `json['id'] as int` was a type error in every generated model.
- **Date:** 2026-09-21

## Decisions

**D1 — New expression nodes** (schema additions, all in the `Expr` union): `logic.ThrowExpr`, `logic.Rethrow`, `logic.Sequence`,
`logic.Let`, `logic.Spread`, `logic.IfElement`, `logic.ForElement` (for-in and C-style), and `MapLit.entries` for a map with a spread or a
collection-if/for. A set literal with these is a `ListLit` whose type is a `Set`, as before.

**D2 — `throw` and `rethrow`** lower to `dartThrow(value)` (a call typed `never`, so `x ?? dartThrow(e)` composes) and to `dartThrow(<the
enclosing catch's binding>)`. `rethrow` outside a catch is refused.

**D3 — Tear-offs are lambdas.** A constructor reference (`Dto.fromJson`, `Dto.new`) is `(params) => Dto.fromJson(params)` with the
constructor's own positional and named parameters, so the value is called as the constructor is and the construction lowers through the
ordinary path. An explicit instantiation of a generic function (`identity<int>`) is the function itself: the type arguments are
re-inferred where the emitted code is checked.

**D4 — Cascades and null-aware receivers bind once.** `logic.Let` binds a value and evaluates a body with it in scope
(`((n) => body)(value)`; an async IIFE when the body awaits). A cascade is `Let(t = target, Sequence[section…, t])`: the target is
evaluated once and the value is the target. A null-aware access on a receiver that is not a plain variable is
`Let(n = receiver, n != null ? access : null)`. Both replace an opaque expression that dropped or duplicated evaluation.

**D5 — Null-shorting covers the chain.** `a?.b.c`, `a?.b()!.c` and `a?[i].c` return null when `a` is null; the guard wraps the whole
chain, not only the link with the `?`. Before, `(a != null ? a.b : null).c` threw where Dart yields null. A null-aware subscript
(`a?[i]`) had no case at all and silently dropped the `?`.

**D6 — Collection elements** lower to spreads of arrays: `if` → `...(c ? [a] : [b])`, for-in → `...Array.from(xs).flatMap(x => [e])`,
C-style `for` → an immediately-invoked loop with a per-iteration `let`, `...?xs` → `...(xs ?? [])`. A map's pairs are `dartEntry(k, v)`
(a typed tuple) so `new Map([...])` infers through them.

**D7 — Adjacent strings** are one interpolated string.

**D8 — `as` is a checked cast.** `dartAs<T>(value, test, name)` for a cast to a type that can be tested at runtime (the set `is` can:
`int`, `double`, `num`, `String`, `bool`, `List`, `Map`, `Set`, `Object`, a project class — nullable or not) throws a `TypeError` where
Dart does and types the result. Other casts (function types, type parameters) pass through unchanged, as before. `json['id'] as int`
now type-checks and fails loudly on bad data.

**D9 — Fully typed empty collections** (`<String>[]`, `<String, int>{}`) carry their type (`[] as string[]`); a map literal with a
`dynamic`/`Object?` part is `new Map<K, V>(…)`, so `{'id': 1, 'name': 'a'}` typed `Map<String, Object?>` is not inferred from its first
entry. An optional positional parameter with no default is `required: false` so callers may omit it.

## Not modelled (still refused, by name)

Records, `switch` expressions and patterns (ADR-0060 when written), a collection-if with a pattern, a null-aware element (`?x`).

## Evidence

`fixtures/apps/expression_forms` compared with `flutter test`: throw/rethrow and `??`-throw, constructor and generic tear-offs, `?.` on
calls and casts with a call counter proving the receiver is evaluated once, `?.items.length` chains, cascades (including nested state),
spread/`...?`/if-else/for-in/C-style for in lists, sets and maps, adjacent strings, `as int`/`as String?`/`as List<int>`/`as Dto?` in
both directions. 20 mutants across the analyzer (each pinned by `extraction_test.dart`) and the generator are killed.
