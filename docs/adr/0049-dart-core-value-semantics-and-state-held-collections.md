# ADR-49 — `dart:core` value semantics, and State-held collections

- **Status:** Accepted (M11-I, plan Phase E). Extends the M8-V numeric rule (and, from D3a, covers operators as well as methods); **clarifies** ADR-4 and ADR-20 (R3);
  amends nothing. Records one decision as **deliberately not made** (D4).
- **Date:** 2026-09-20

## Context

Phase E of the completion plan asked for the boundary between supported and unsupported State mutation to be
tested rather than assumed. Every case below was run end to end — real analyzer, real generator, strict `tsc`,
and the generated component executed in jsdom on the real runtime — and its result compared with what real
Dart/Flutter prints for the same source. 54 cases: 16 scalar, 22 collection, 16 formatting/name-coincidence.

**Scalar State (all `setState`-driven, all correct):** assignment, `++`, `+=`, several writes in one
`setState`, an equal write, two `setState`s in one callback, a write read back by the next statement, a closure
local called inside `setState`, `String` concatenation, `bool` toggle, `~/`, and Dart's floored `%` — 12 of 16
match Dart exactly. The other four: a write *without* `setState` re-renders where Flutter would not (the known
ADR-0048 D3 deviation); a `double` prints `1` where Dart prints `1.0` (×2); an uninitialised `int?` field fails
strict `tsc` (`signal(undefined)` is typed `undefined`).

**Collections (22 cases): none works.** `List.add/remove/addAll/removeAt/clear/insert/where`, `Set.add/remove`,
`Map.remove`, index assignment, spread and `Map[k] = v` all fail — loudly, in `tsc` (`Property 'add' does not
exist on type 'number[]'`) or by generator/analyzer refusal. The one that passed was reassigning an empty literal.
Even the idiomatic `final List<int> _items` mutated in `setState` fails.

**Formatting and name coincidence (16 cases): the silent ones.** The generator emitted `receiver.method(args)`
verbatim for any `dart:core` collection and `${…}` for any interpolation. Where JavaScript's name or default
happens to exist and differs, the result was wrong with no signal:

| Source | Dart | Generated JavaScript |
|---|---|---|
| `[10, 9, 1].sort()` in `setState` | `[1, 9, 10]`, screen updates | in place, string order, **screen never updates** |
| `['a', 'b'].join()` | `ab` | `a,b` |
| `'$d'` with `d = 3.0` | `3.0` | `3` |
| `'$list'` for `[10, 9, 1]` | `[10, 9, 1]` | `10,9,1` |
| `'$map'` for `{a: 1}` | `{a: 1}` | `[object Map]` |

Two committed tests pinned the wrong output: `enum_values_build.test.ts` asserted `['idle', 'ready'].join()`, and
the M9-F fixture interpolated a `List<String>` (`'$group: $entry'`) and asserted `${group}: ${entry}`. Both were
"correct" against the generator and wrong against Dart.

## Decision

**D1 — The M8-V rule applies to every `dart:core` value.** A method or interpolation is judged by the receiver's
*resolved* `dart:core` type, never by the bare name; what is provably the same in JavaScript is lowered, the rest
is refused by name (`BRG3002`) with the reason. "A different one needs its own evidence before it can be added."

**D2 — What is lowered.**

- `double` in an interpolation → `doubleToString(x)` (runtime kit): Dart and JavaScript agree on every finite
  double except integral values (Dart appends `.0`) and negative zero (`-0.0`).
- `List.join()` → `join('')` (Dart's default separator is `""`); `List.join(sep)`, `indexOf`, `lastIndexOf`,
  `forEach`, `every` pass through — same meaning, one argument.

**D3 — What is refused.** Every other method on a `List`, `Set`, `Map` or `Iterable`; and interpolating a
`List`, `Set`, `Map`, `Iterable` or `num` (an int or a double at runtime — JavaScript cannot say which). A
project class's own `add`/`join` is a different receiver type and is unaffected.

**D3a — Bit and shift operators (added M11-I, after the audit's numeric probe).** `SAFE_BINARY` had listed
`& | ^ << >>` as "the same in both languages". Twelve cases run against real Dart showed five wrong: JavaScript's
are 32-bit and Dart's `int` is 64-bit (`1 << 40` → `256` for `1099511627776`; `0xFFFFFFFF & 0xFFFF0000` →
`-65536` for `4294901760`; `1 << 31` negative; `4294967296 | 1` → `1`), and on a `bool`, `&`/`|`/`^` return a
`number` in JavaScript (`true & false` → `0`). Now: two integer literals **fold** to Dart's exact 64-bit result
when it is a safe integer (`1 << 20` flags stay usable); `bool & | ^` lowers to `Boolean(Number(a) op Number(b))`
(valid strict TypeScript, both operands still evaluated); every other `int` operand, and unary `~`, is refused by
name. **Left as known:** ordinary `+ - *` on an `int` silently loses precision beyond 2^53
(`3037000499 * 3037000499` → `…000` for `…001`); an operator cannot be refused on a value it cannot see, and the
domain is ADR-5 D2's. It is a limitation, not a decision made here.

**D4 — State-held collection mutation is not supported, and the mechanism is not decided.** Support needs a rule
for *how a State-held collection notifies*, and every candidate changes a contract:

- *Copy-on-write* (`add(x)` → `set([...items, x])`): notifies, but breaks aliasing — `final other = _items;
  _items.add(1)` no longer updates `other` — so it is only sound where no alias exists.
- *Mutate, then notify* (`items.push(x); signal.touch()`): keeps aliasing, matches `setState`, but needs a new
  runtime operation that forces notification despite `Object.is` equality — an amendment to ADR-20 R3.
- Either needs the Dart mutator names mapped (`add`→`push`, `remove`→`splice(indexOf…)`, `sort` with Dart's
  comparator, …), and typed signal initialisers, because `signal([])` infers `never[]` and `signal(undefined)`
  infers `undefined` — which is why `List<int> _items = []` and `int? _n` fail today.

This is a new semantic contract, which the plan reserves for a human/spec decision; it is not implemented here
and the refusal messages say so. Until it is decided, a State field holding a collection may be **read** and
**replaced whole** (`_items = <int>[]` works), not mutated in place.

## Alternatives considered

- *Keep the verbatim fallthrough and let `tsc` catch it.* Rejected: it catches only the names JavaScript lacks;
  `sort`, `join()` and every interpolation compile. And `bridge build` skips `tsc` when dependencies are not
  installed, so the guard is conditional.
- *Refuse every `double` interpolation.* Rejected: `Text('$price')` is ubiquitous and right except when the value
  is integral; a two-line runtime function fixes it exactly.
- *Refuse only the silent ones (`sort`, `join()`).* Rejected: an allow-list is the only policy that stays correct
  when the next coincident name appears.

## Consequences

- Programs using `Set`/`List` mutation are now refused **by name** at generation (previously: a `tsc` error, or a
  silent stale UI for `sort`). `hello_bridge`'s `FavoritesStore` (`Set.contains/add/remove`) is one; the
  generator test that pins its blocker set now includes `BRG3002` and names the three methods.
- Two committed tests and one fixture that pinned wrong output were corrected, with the reason beside them.
- **Limits of the evidence:** 54 cases, not a proof; jsdom, not a browser. `String` methods are outside this
  ADR and were only lightly probed — `toUpperCase`/`indexOf` behaved correctly, `isEmpty` and `padLeft` fail
  loudly in `tsc` — so `String` receivers remain on the verbatim path. `Map.forEach` (whose callback argument
  order differs between the languages) is refused with every other `Map` method rather than lowered.
