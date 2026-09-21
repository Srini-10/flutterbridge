# Dart language support — what compiles exactly, and what is refused

FlutterBridge lowers a *subset* of Dart. For each construct below the rule is the same: it is either lowered to something that
behaves as Dart does — **verified by running both** — or the build stops and names it. None is approximated. This page is the
subset as of M11; the ADRs give the reasoning and the evidence.

How the claims were checked: a real Flutter app is analysed by the real analyzer, generated, and its generated React component is
driven in jsdom (real `react-dom`, the real runtime kit) through the same script that `flutter test` ran on the original widget;
the two are compared after every step. Fixtures under `fixtures/apps/*/test/` hold the script and Flutter's recorded answers.
Numeric and string semantics are additionally checked against thousands of results computed by `dart run`.

## Integers — [ADR-0050](../adr/0050-dart-integer-semantics.md)

`int` is the JavaScript safe-integer domain (±2⁵³−1). Inside it every operation is exact; the moment one would leave it, it
throws (`BRG4011`) — nothing is silently rounded. `%` follows Dart (never negative), `~/` and `%` by zero throw, `& | ^ << >> >>> ~`
are 64-bit through `BigInt`. Constants fold exactly or are a build error. A literal outside the domain is refused.

## Collections — [ADR-0051](../adr/0051-state-held-collection-mutation.md)

`List`, `Set` and `Map`, mutated in place, in State, through aliases, props and nesting: `add`, `addAll`, `insert`, `insertAll`,
`remove`, `removeAt`, `removeLast`, `removeWhere`, `retainWhere`, `clear`, `sort` (with and without a comparator), `shuffle`,
`list[i] = v`, `map[k] = v`, `map[k] += 1`, `putIfAbsent`, `addAll`, `Set.add/remove`. Reads: `length`, `isEmpty`, `first`, `last`,
`contains`, `map`, `where`, `take`, `skip`, `toList`, `join`, `keys`, `values`. Anything else (`fold`, `expand`, `List.from`, spread)
is refused.

**Difference from Flutter:** a mutation with no `setState` re-renders here; Flutter shows it at the next rebuild (ADR-0048).

## State lifecycle — [ADR-0052](../adr/0052-state-lifecycle-lowering.md)

`initState` (a leading run of pure assignments runs before the first render; the rest after commit), `dispose` (exactly once per
real unmount, paired with `initState` under StrictMode), `didUpdateWidget(oldWidget)` (when the parent supplies new props). Refused:
`didChangeDependencies`, `deactivate`, `activate`, and a store's `dispose`.

**Differences:** across components React runs child effects before parent effects, and a parent's cleanup before its children's
(Flutter is the reverse for both). The effectful part of `initState` runs after the first commit.

## Widget constructors — [ADR-0053](../adr/0053-widget-constructor-parameters.md)

Named and positional parameters, `required`, defaults (`this.count = 3`), optional nullable (`this.note` → `null` when omitted),
callback props (`void Function(int)`), and a field initialised in its declaration. Refused (`BRG1309`): an initializer list that
computes a field, a named constructor, a `factory`, a redirecting constructor.

## `String`, numbers, switch, enums — [ADR-0054](../adr/0054-silent-semantic-loss-audit-fixes.md)

`String`: `length`, `isEmpty`, `isNotEmpty`, `contains`, `startsWith`, `endsWith`, `indexOf`, `lastIndexOf`, `split`, `substring`,
`codeUnitAt`, `padLeft`, `padRight`, `replaceAll`, `replaceFirst`, `toUpperCase`, `toLowerCase`, `trim`, `trimLeft`, `trimRight`, `*`
(with `String` patterns; a `RegExp` is refused). Numbers: `isEven`, `isOdd`, `isNegative`, `isNaN`, `isFinite`, `isInfinite`,
`toDouble`, `toStringAsFixed`, `remainder`. `switch` statements over constants (literals, `String`s, enum values), with `default`
and grouped cases; a pattern or a `when` guard is refused. Increments and assignments used as values. `f.call(x)`. `Future.catchError`
and `whenComplete`. `?.` on a variable, a prop or a field-read chain. A plain enum is its value names: `k.name` and `'$k'` (`Kind.a`)
work; a plain enum's `k.index` is refused. An *enhanced* enum (fields, methods, constants with arguments) is emitted as a class with one
static instance per constant — fields, getters, methods, `values`, `index`, `name`, `switch` all work ([ADR-0056](../adr/0056-enhanced-enums.md)).

## Classes, statics, SDK functions, expression forms — ADR-0055, 0057, 0058, 0059

A project class that is not a plain record is emitted as a TypeScript class: constructors (named, initializer lists, `super`, redirecting,
`factory`), fields, methods, getters, operators, inheritance, abstract classes, `static` members, `is`, and **mixins**
([ADR-0055](../adr/0055-general-class-model.md), [ADR-0059](../adr/0059-mixins.md)). Static `const`/`final` fields and top-level constants
are module-level constants; a mutable static or top-level variable is refused (it would be state shared across requests).
`identical`, `unawaited`, `Object.hash`/`hashAll` (contract only, not Dart's numbers) and the `double` constants lower exactly; a package
`const` used as a sentinel is an opaque canonical token ([ADR-0057](../adr/0057-sdk-statics-and-external-constants.md)).
`throw`/`rethrow` in expressions, constructor and generic-function tear-offs, cascades, `?.` on any receiver (whole-chain null-shorting),
collection `...`/`if`/`for` in lists, sets and maps, adjacent strings, and checked `as` casts ([ADR-0058](../adr/0058-expression-forms.md)).

## Not supported (refused, by name)

Everything not listed. The census of two real applications (see the final audit report) found the blockers in practice are: freezed
and part-file classes, widget-returning helper methods, spread / `for` / `if` in widget children, members of project classes,
top-level declarations, go_router shapes beyond the simplest, and widgets such as `InkWell`, `LayoutBuilder`, `showDialog`.
