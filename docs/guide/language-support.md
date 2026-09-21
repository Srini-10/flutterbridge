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

## SDK collections and exceptions — ADR-0060, ADR-0061

`List`/`Set`/`Map` methods beyond ADR-0051: `firstWhere`/`lastWhere`/`singleWhere` (`orElse:`), `fold`, `reduce`, `expand`, `every`,
`indexWhere`, `takeWhile`/`skipWhile`, `followedBy`, `toSet`, `elementAt`, `single`, `firstOrNull`/`lastOrNull`, Set algebra, `Map.forEach`/
`update`/`removeWhere`/`map`; constructors `List.from/generate/filled/of`, `Set.from`, `Map.from/fromEntries`, `MapEntry` ([ADR-0060](../adr/0060-sdk-collections-and-enum-statics.md)).
`FormatException`, `StateError`, `ArgumentError`, `RangeError`, `UnsupportedError`, `UnimplementedError`, `Exception`, project exception
classes; typed `on T catch` clauses dispatch on type, an unmatched exception propagates ([ADR-0061](../adr/0061-exceptions.md)).

## Widget helpers and statement-bodied builds — ADR-0062

Widget-returning helpers in the same file are inlined; a `build` with loops, `if`s, calls and mutated locals runs them as a prelude;
widgets can be held in locals and lists (`ReactNode`), spread (`...rows`) and passed as `Widget`/`List<Widget>` props
([ADR-0062](../adr/0062-widget-helpers-and-statement-builds.md)).

## Widget constructors — ADR-0063

Initializer-list constants, named constructors and factories of a project widget ([ADR-0063](../adr/0063-widget-constructors.md)). A redirecting
constructor, a value computed from a parameter, and a named constructor of a stateful widget are refused (`BRG1309`).

## Dart 3 patterns — ADR-0065

Switch expressions and pattern cases: constant, wildcard, variable, object (with fields), `||`, `&&`, relational, `?`/`!`/`as` patterns and
`when` guards ([ADR-0065](../adr/0065-dart3-patterns.md)). List, map and record patterns are held too ([ADR-0069](../adr/0069-records-and-destructuring.md)); an or-pattern that binds is refused whole.

## Time, async, parsing, named functions — ADR-0066

`DateTime`, `Timer`, `Future.value/delayed/microtask/wait`, `int`/`double` `parse`/`tryParse`, `DeepCollectionEquality`; async top-level functions; named
parameters on top-level functions ([ADR-0066](../adr/0066-sdk-time-async-named-functions.md)). Difference: no microseconds.

## Extensions, records, patterns — ADR-0068, ADR-0069

Extension members (instance methods, getters, setters, generic and nullable receivers, uses inside the extension) are functions with a `$this` parameter; records are objects
(`$1`, `$2`, …, named fields) with field-wise `==`; list, map and record patterns work in declarations, `if`-case, `for`-in and switches. Static and operator extension members and extension types are refused.

## Gestures and constraints — ADR-0070, ADR-0071

`GestureDetector` and `InkWell`: `onTap`, `onDoubleTap`, `onLongPress`, `onTapDown`, `onTapUp`, `onTapCancel` (with `TapDownDetails`/`TapUpDetails`), and, for `InkWell`,
`onHover`, `onFocusChange`, the disabled state and Enter/Space activation, with Flutter's arena timing (100 ms press deadline, 300 ms double-tap window, 500 ms long press) measured
against `flutter test`. `LayoutBuilder` with `maxWidth`, `maxHeight`, `hasBoundedWidth`, `hasBoundedHeight`, rebuilt on resize. `num.round/floor/ceil/truncate/toInt/abs/clamp` are
checked against real Dart.

## Collections in interpolation — ADR-0073

`'$list'`, `'$set'`, `'$map'` print as Dart does (`[1, 2]`, `{x, y}`, `{a: 1}`, `null` elements, doubles as `1.0`, nested collections) when the element types are `String`, `int`, `bool`, `double` or
such collections. A `num`, enum, class or `dynamic` element is refused. `debugPrint` prints a console line.

## Navigation by name — ADR-0072

go_router `goNamed`/`pushNamed`/`pushReplacementNamed` resolve against the routes' `name:` (nested routes at their joined path); so do `go('/x')`/`Navigator.pushNamed('/x')` — a
departure to a route is now lowered at all (`logic.Navigate.route`).

## Widget parameters, text formatters, State shapes — ADR-0074

A widget or list of widgets passed to a **project** widget stays a named parameter (`Bar(header: …, actions: […])`): it was silently dropped before. `List<Widget>` renders as positionally-keyed
children. `TextField`/`TextFormField` take `inputFormatters` (`FilteringTextInputFormatter.digitsOnly`, `LengthLimitingTextInputFormatter`); `allow`/`deny` (a `RegExp`) and `autovalidateMode` are refused.
In a `State`: `final`/`late final` fields (including `late final X x = widget.x ?? …`) are per-instance cells, a State field named like the widget's parameter is the State's, an arrow-bodied `setState` followed by
statements runs them all, `() async { … }` closures are async, `Future<T>` is `Promise<T>`, `dynamic[…]` and `dynamic.toString()` resolve at run time.

## `package:dio` — the first library adapter — ADR-0075

`Dio`, `BaseOptions`, `Options`, `Response<T>`, `DioException`, `DioExceptionType`, `get/post/put/patch/delete/request`, base URL joining, query parameters, headers, JSON bodies and replies, typed `on DioException catch` and a `switch` on the type —
each outcome compared with real dio against a real server, and a repository over Dio compared step by step in Flutter and the generated component. Differences: `fetch` cannot separate connect from receive time; CORS applies; `sendTimeout` is not enforced.
Refused by name: interceptors other than `LogInterceptor`, `FormData`/`MultipartFile`, `CancelToken`, `HttpClientAdapter`, download/progress.

## Colours, `Object` overrides, prototype-named identifiers — ADR-0076

`c.withValues(alpha: a)`, `c.withOpacity(a)`, `c.withAlpha(n)` of a constant colour are constants (alpha computed as Flutter does). A class overriding `toString`/`==`/`hashCode`/`call`/`noSuchMethod` is a class
(`'$box'` and equality honour the override). Identifiers named like `Object.prototype` members work; a class member named `constructor` is refused by name.

## Compatibility contract

Every construct is in exactly one of three classes. Nothing is in a fourth ("works, mostly").

### SUPPORTED (compared with Flutter in a fixture app, or refused by name)

Everything listed above. Each has a fixture in `fixtures/apps/` whose scenarios run in real Flutter and in the generated component
(`tests/*_execution.test.ts`), with mutation-tested lowerings.

### SUPPORTED WITH A DOCUMENTED SEMANTIC DIFFERENCE

| Construct | Difference |
| --- | --- |
| `Object.hash` / `hashAll` | Contract kept (equal inputs, equal hash), values are not Dart's — Dart does not specify them. |
| `DateTime` | No microseconds. |
| `List.from(..., growable: false)` | A fixed-length list is growable (differs only where Dart would throw). |
| Errors thrown by runtime helpers (`list.first` on `[]`, `reduce` on `[]`) | `BRG4014` errors, not `StateError` — an `on StateError` does not catch them. |
| A mixin's `super` | Reaches the class's superclass (exact when the mixin sits directly above it). |
| `int.parse` / integers | Beyond 2^53 it is refused or throws, never rounds (ADR-0050). |
| Gestures ([ADR-0070](../adr/0070-gestures.md)) | Ancestor scrollers do not delay `onTapDown`; no ink ripple; the innermost detector with a callback takes the press (Flutter runs one arena per recogniser kind); hover callbacks are not suppressed after a key press. |
| `LayoutBuilder` ([ADR-0071](../adr/0071-layout-builder.md)) | Runs after layout (not on the server); `maxWidth` is the width of the nearest ancestor whose width does not depend on its content, `maxHeight` is read structurally (scroll view / column main axis → `Infinity`, explicit height → bounded); minimum sizes are not stated (refused). |
| Appearance parameters | `Text.style`/`textAlign`/`maxLines`/`overflow`, `Icon.color`, `Divider.color`, `InkWell.borderRadius`, `ListView.physics`, `Container.clipBehavior`, `Image.errorBuilder`, … are **dropped with a warning** (`BRG3001`, per use): the runtime has no typography/decoration model for them. Behaviour-bearing parameters are refused instead (`BRG3017`). |
| Text formatters ([ADR-0074](../adr/0074-widget-parameters-and-input-formatters.md)) | The caret is the browser's; formatters see the text, not Flutter's `TextEditingValue` (selection, composing range). |
| `dio` ([ADR-0075](../adr/0075-dio-adapter.md)) | `fetch`: connect and receive time are not separated, `sendTimeout` is not enforced, CORS applies; a `dynamic` number that is whole prints without `.0`. |
| `go`/`goNamed` ([ADR-0072](../adr/0072-route-names.md)) | Lowered as a push (go_router's `go` replaces the stack); the URL is not updated; `pathParameters`/`queryParameters`/`extra` are not carried (the edge is refused with a warning). |
| The incremental analyzer | A class newly extended from another file is not re-extracted until its own file changes; a clean run is exact (ADR-0059). |

### EXPLICITLY REFUSED (a diagnostic names it)

Packages ([ADR-0073](../adr/0073-package-adapters-and-boundaries.md)) — **not implemented yet** (a browser equivalent exists): Riverpod (`ref`, providers, notifiers, `ConsumerWidget`), `http` and the parts of `dio` beyond ADR-0075 (→ `fetch`),
audio playback and recording, file picking, `shared_preferences`, Supabase, `url_launcher`; **no browser equivalent**: `path_provider`, on-device databases, permissions and native services.
`Theme.extension` design-system context extensions (`context.colors`; `context` as a value is refused as a `BuildContext`), pan/drag/scale/secondary/long-press-sub-event gestures (`BRG3017`, "not built yet") and force press (`BRG3017`, "no browser equivalent"),
`BoxConstraints` minimum-size and tightness members (`BRG3013`, no browser equivalent), slivers, `CustomPainter`, drag-to-reorder, `GlobalKey`, static/operator extension members,
local function declarations, `yield`, `goNamed` with `pathParameters`/`queryParameters`/`extra`, a route held in a variable, custom `RenderObjectWidget`/`InheritedWidget`
(declared as opaque components), a named generative constructor of a stateful widget, a redirecting widget constructor, mutable statics and
top-level variables (state shared across requests, INV-19), `on` clauses naming a type that cannot be tested at runtime.

FlutterBridge is **not** a universal Flutter compiler.
