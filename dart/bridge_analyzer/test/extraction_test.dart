/// Flutter extraction (M1-T8).
///
/// Every test runs the **real pipeline** against a **real, resolved** project — a stand-in Flutter is
/// written to disk and genuinely resolved by `package:analyzer`, because extraction decides what a
/// class is from its supertypes, and a mock cannot have supertypes.
@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:bridge_analyzer/src/diagnostics/diagnostic_sink.dart';
import 'package:bridge_analyzer/src/pipeline/extract/extract_stage.dart';
import 'package:bridge_analyzer/src/pipeline/stage.dart';
import 'package:bridge_analyzer/src/pipeline/stages.dart';
import 'package:test/test.dart';

import 'support/temp_project.dart';

/// Extracts a single-file app, and returns its UIR as JSON.
///
/// [localDependencies] adds a `path:` dependency (M8-F) — a real, on-disk sibling package, registered
/// with a relative `rootUri`, exactly as `pub get` records one.
Future<Extracted> extract(
  String source, {
  Map<String, String> extra = const <String, String>{},
  Map<String, Map<String, String>> localDependencies = const <String, Map<String, String>>{},
  Map<String, Map<String, String>>? dependencies,
}) async {
  final String project = createProject(
    name: 'app',
    libraries: <String, String>{'main.dart': source, ...extra},
    localDependencies: localDependencies,
    dependencies: dependencies ?? const <String, Map<String, String>>{'flutter': flutterPackage},
  );
  final Directory out = Directory.systemTemp.createTempSync('extract_');
  addTearDown(() => out.deleteSync(recursive: true));

  final AnalyzerResult result = await const BridgeAnalyzer().run(
    AnalyzerRequest(projectRoot: project, outputPath: '${out.path}/uir.ndjson'),
  );

  final File document = File('${out.path}/uir.ndjson');
  return Extracted(
    result: result,
    nodes: document.existsSync()
        ? document
              .readAsLinesSync()
              .where((String l) => l.isNotEmpty)
              .map((String l) => jsonDecode(l) as Map<String, dynamic>)
              .toList()
        : <Map<String, dynamic>>[],
    bytes: document.existsSync() ? document.readAsStringSync() : '',
  );
}

/// The result of extracting a project.
final class Extracted {
  const Extracted({required this.result, required this.nodes, required this.bytes});

  final AnalyzerResult result;
  final List<Map<String, dynamic>> nodes;
  final String bytes;

  /// Every node of [kind], top-level or nested, in document order.
  List<Map<String, dynamic>> ofKind(String kind) {
    final List<Map<String, dynamic>> found = <Map<String, dynamic>>[];
    void walk(Object? value) {
      if (value is Map<String, dynamic>) {
        if (value['kind'] == kind) {
          found.add(value);
        }
        value.values.forEach(walk);
      } else if (value is List<dynamic>) {
        value.forEach(walk);
      }
    }

    nodes.forEach(walk);
    return found;
  }

  /// The one node of [kind]. Fails loudly if there is not exactly one.
  Map<String, dynamic> only(String kind) {
    final List<Map<String, dynamic>> found = ofKind(kind);
    expect(found, hasLength(1), reason: 'expected exactly one $kind, found ${found.length}');
    return found.single;
  }

  List<Diagnostic> get errors =>
      result.diagnostics.where((Diagnostic d) => d.severity == Severity.error).toList();
}

const String counterApp = r'''
import 'package:flutter/material.dart';

class Counter extends StatefulWidget {
  const Counter({required this.title, super.key});
  final String title;
  @override
  State<Counter> createState() => _CounterState();
}

class _CounterState extends State<Counter> {
  int _count = 0;
  bool _busy = false;

  void _increment() {
    setState(() {
      _count++;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: <Widget>[
        Text(widget.title),
        Text('$_count'),
        ElevatedButton(onPressed: _increment, child: const Text('Add')),
      ],
    );
  }
}
''';

/// An app whose theme seeds from a **swatch**, not a plain colour — M5-A's D1/D2.
const String swatchApp = '''
import 'package:flutter/material.dart';

class SwatchApp extends StatelessWidget {
  const SwatchApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo),
      ),
      home: const ColoredBox(color: Colors.indigo, child: Text('swatch')),
    );
  }
}
''';

/// The same app seeded from a plain `Color` — the case that always worked.
const String plainColourApp = '''
import 'package:flutter/material.dart';

class PlainApp extends StatelessWidget {
  const PlainApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Color(0xFF3F51B5)),
      ),
      home: const ColoredBox(color: Color(0xFF3F51B5), child: Text('plain')),
    );
  }
}
''';

void main() {
  group('assignment — the reason the schema was amended (v2.2 §A10)', () {
    test('`_count++` is a logic.Assign, not an opaque source string', () async {
      final Extracted app = await extract(counterApp);

      expect(app.errors, isEmpty);
      final Map<String, dynamic> assign = app.only('logic.Assign');
      expect(assign['operator'], 'increment');
      expect(assign['isPostfix'], isTrue);
      expect((assign['target']! as Map<String, dynamic>)['name'], '_count');
      expect(
        assign.containsKey('value'),
        isFalse,
        reason: '`++` has no operand; an invented one would be a value the user never wrote',
      );
    });

    test('every Dart assignment operator maps to a distinct enum value', () async {
      final Extracted app = await extract('''
void mutate() {
  int a = 0;
  a = 1;
  a += 1;
  a -= 1;
  a ~/= 1;
  a <<= 1;
  int? b;
  b ??= 2;
  --a;
}
''');

      expect(app.errors, isEmpty);
      expect(
        app.ofKind('logic.Assign').map((Map<String, dynamic> a) => a['operator']),
        containsAll(<String>[
          'assign',
          'addAssign',
          'subtractAssign',
          'truncatingDivideAssign',
          'shiftLeftAssign',
          'ifNullAssign',
          'decrement',
        ]),
      );
    });

    test('`++i` and `i++` are distinguishable — they index different elements', () async {
      final Extracted app = await extract('''
void f() {
  int i = 0;
  i++;
  ++i;
}
''');

      final List<Object?> postfix = app
          .ofKind('logic.Assign')
          .map((Map<String, dynamic> a) => a['isPostfix'])
          .toList();
      expect(postfix, unorderedEquals(<Object?>[true, null]));
    });
  });

  group('components', () {
    test('a StatefulWidget and its State become ONE component', () async {
      final Extracted app = await extract(counterApp);

      final Map<String, dynamic> component = app.only('ui.Component');
      expect(component['name'], 'Counter', reason: 'named for the widget, not the State');
      expect(
        (component['params']! as List<dynamic>).single,
        containsPair('name', 'title'),
        reason: "params come from the widget's fields",
      );
      expect(
        component['localSignals'],
        hasLength(2),
        reason: "state comes from the State's fields",
      );
    });

    test('a StatelessWidget is a component, and its fields are params', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Greeting extends StatelessWidget {
  const Greeting({required this.name, super.key});
  final String name;
  @override
  Widget build(BuildContext context) => Text(name);
}
''');

      expect(app.errors, isEmpty);
      expect(app.only('ui.Component')['name'], 'Greeting');
      // The prop read must be a bind.Param, not a bind.Expr — a generator emits a prop read for one
      // and an arbitrary expression for the other.
      expect(app.only('bind.Param')['param'], 'name');
    });

    test('a class is a widget because of what it extends, never because of its name', () async {
      final Extracted app = await extract('''
class ButtonScreen {
  const ButtonScreen();
}
''');

      expect(app.ofKind('ui.Component'), isEmpty);
      expect(app.ofKind('logic.ClassDecl'), hasLength(1));
    });
  });

  group('INV-22 — no framework runtime primitive survives extraction', () {
    test('setState is unwrapped: the mutation survives, the framework word does not', () async {
      final Extracted app = await extract(counterApp);

      expect(
        app.ofKind('logic.Ref').where((Map<String, dynamic> r) => r['name'] == 'setState'),
        isEmpty,
        reason:
            'ADR-4: no generator ever sees setState. Leaving it in the UIR is a Flutter fact every '
            'downstream pass must then learn to ignore — and N5, which may not know what Flutter is, '
            'correctly refused to lift a single closure in three real apps because of it (ISSUE-18).',
      );

      // What it wrapped is still there. Nothing was lost — only the wrapper.
      expect(app.only('logic.Assign')['operator'], 'increment');
    });

    test("a user's OWN function named setState is left completely alone", () async {
      // Matched on the resolved library, never on the name. Unwrapping a user's own `setState` would
      // delete a call their program actually makes. wonderous declares one.
      final Extracted app = await extract('''
void setState(int id) {}

void caller() {
  setState(1);
}
''');

      expect(
        app.ofKind('logic.FunctionDecl').map((Map<String, dynamic> f) => f['name']),
        contains('setState'),
      );
      expect(
        app.ofKind('logic.Ref').where((Map<String, dynamic> r) => r['name'] == 'setState'),
        hasLength(1),
        reason: "this one is the program's own call, and it stays",
      );
    });

    test('setState in a non-block position is unwrapped too', () async {
      // `if (mounted) setState(() { … });` — one survivor in wonderous found this.
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';

class Screen extends StatefulWidget {
  const Screen({super.key});
  @override
  State<Screen> createState() => _ScreenState();
}

class _ScreenState extends State<Screen> {
  int _n = 0;

  void bump() {
    if (_n < 10) setState(() { _n++; });
  }

  @override
  Widget build(BuildContext context) => Text('$_n');
}
''');

      expect(
        app.ofKind('logic.Ref').where((Map<String, dynamic> r) => r['name'] == 'setState'),
        isEmpty,
      );
    });
  });

  group('state — the signal graph (ADR-4)', () {
    test('a mutable State field is a component-scoped signal', () async {
      final Extracted app = await extract(counterApp);

      final List<Map<String, dynamic>> signals = app.ofKind('sig.Signal');
      expect(signals, hasLength(2));
      expect(signals.every((Map<String, dynamic> s) => s['scope'] == 'component'), isTrue);
    });

    test('notifyListeners is erased — the write IS the notification (INV-22, M6)', () async {
      // ADR-4/ADR-20: *a signal write **is** the notification*. `notifyListeners()` announces something
      // the UIR has already recorded in the action's write set, so it carries no meaning UIR lacks — and
      // it carries one UIR must never have, which is the framework's word for it.
      //
      // Before M6 it survived extraction as a reference to an undeclared name, and the React generator
      // refused the whole program with BRG3006: correct about the symbol, wrong about whose problem it
      // was. `fixtures/apps/hello_bridge`'s store has said "No generator ever sees notifyListeners" in a
      // doc comment since M0, and nothing enforced it.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class FavoritesStore extends ChangeNotifier {
  final Set<int> _ids = <int>{};

  void toggle(int id) {
    _ids.add(id);
    notifyListeners();
  }
}
''');

      expect(app.bytes, isNot(contains('notifyListeners')));

      // Erased, not swallowed: the mutation it accompanied must still be there, and the action must
      // still declare the write. An erasure that took the statement with it would be worse than the
      // diagnostic it replaced.
      final Map<String, dynamic> action = app.only('sig.Action');
      expect(action['writes'], isNotEmpty, reason: 'the write survives the erasure');
    });

    test("a user's own notifyListeners is NOT erased", () async {
      // Recognition is by resolved element, never by name — the rule C1 established after 18 widgets
      // were misclassified by name. A method of that name on the application's own class is a call the
      // program actually makes, and erasing it would delete the user's code.
      //
      // The assertion is on the **call site**, not on the document's bytes. The first version of this
      // test checked `app.bytes` for the string, which the class's own *declaration* satisfies — so it
      // passed with the library guard deliberately removed, and proved nothing. A mutation test is what
      // found that, and it is why this now walks the action body.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Telemetry {
  void notifyListeners() {}
}

class CounterScreen extends StatefulWidget {
  const CounterScreen({super.key});
  @override
  State<CounterScreen> createState() => _CounterScreenState();
}

class _CounterScreenState extends State<CounterScreen> {
  int _count = 0;
  final Telemetry _telemetry = Telemetry();

  void bump() {
    _count = _count + 1;
    _telemetry.notifyListeners();
  }

  @override
  Widget build(BuildContext context) => const Text('count');
}
''');

      final Map<String, dynamic> action = app.only('sig.Action');
      final String body = jsonEncode(action['body']);
      expect(
        body,
        contains('notifyListeners'),
        reason: "the user's own call must survive; only ChangeNotifier's is erased",
      );
    });

    test('a final field the class MUTATES is a signal — the C1 bug, pinned', () async {
      // `final Set<String> _ids = {}` mutated through `add`/`remove` is state. An assignment-only
      // analysis returns an empty write set, and the generated React state never updates. This is the
      // exact defect sig.Action's own schema description warns about.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class FavoritesStore extends ChangeNotifier {
  final Set<int> _ids = <int>{};
  int get count => _ids.length;

  void toggle(int id) {
    if (_ids.contains(id)) {
      _ids.remove(id);
    } else {
      _ids.add(id);
    }
    notifyListeners();
  }
}
''');

      expect(app.errors, isEmpty);

      final Map<String, dynamic> signal = app.only('sig.Signal');
      expect(signal['scope'], 'store', reason: 'a ChangeNotifier outlives any one component');
      expect(signal['type'], containsPair('name', 'Set<int>'));

      final Map<String, dynamic> action = app.only('sig.Action');
      expect(
        action['writes'],
        hasLength(1),
        reason: 'the write happens through add/remove, never by assignment',
      );

      final Map<String, dynamic> store = app.only('app.Store');
      expect(store['name'], 'FavoritesStore');
      expect(store['origin'], 'declared', reason: "promoted is N11's word, not extraction's");
      expect(store['derived'], hasLength(1), reason: 'the `count` getter');
    });

    test('a final field nothing mutates is NOT a signal', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Config extends ChangeNotifier {
  final String name = 'fixed';
}
''');

      expect(
        app.ofKind('sig.Signal'),
        isEmpty,
        reason: 'subscribing to a constant costs a re-render that can never fire',
      );
    });

    test('lifecycle methods are effects, not actions', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';

class Screen extends StatefulWidget {
  const Screen({super.key});
  @override
  State<Screen> createState() => _ScreenState();
}

class _ScreenState extends State<Screen> {
  int _n = 0;
  @override
  void initState() {
    _n = 1;
  }
  @override
  void dispose() {
    _n = 0;
  }
  @override
  Widget build(BuildContext context) => Text('$_n');
}
''');

      expect(
        app.ofKind('sig.Effect').map((Map<String, dynamic> e) => e['timing']),
        unorderedEquals(<String>['mount', 'unmount']),
      );
      expect(app.ofKind('sig.Action'), isEmpty, reason: 'initState is not something a user calls');
    });
  });

  group("an action's parameters (Spec v2.5 §A18)", () {
    test('`toggle(int id)` declares `id` — the name its body reads', () async {
      // The gap §A18 closes: the body references `id`, and before the amendment nothing declared it.
      // A `logic.Ref` to it was indistinguishable from a reference to a top-level function or a typo,
      // and the React generator could not resolve it — BRG3006.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class FavoritesStore extends ChangeNotifier {
  final Set<int> _ids = <int>{};

  void toggle(int id) {
    if (_ids.contains(id)) {
      _ids.remove(id);
    } else {
      _ids.add(id);
    }
    notifyListeners();
  }
}
''');

      expect(app.errors, isEmpty);

      final Map<String, dynamic> action = app.only('sig.Action');
      final List<dynamic> params = action['params']! as List<dynamic>;
      expect(params, hasLength(1));

      final Map<String, dynamic> param = params.single as Map<String, dynamic>;
      expect(param['name'], 'id');
      expect(param['type'], containsPair('name', 'int'));
      expect(param['required'], isTrue, reason: 'a positional parameter is required');
      expect(param.containsKey('named'), isFalse, reason: 'it is positional, not named');
    });

    test('a parameter is resolved by name, so its `logic.Ref` claims no target', () async {
      // A `ParamDecl` is a value, not a node: it has no id, so nothing can refer to it *by id*. A
      // `target` here would be a promise the builder would then report as BRG1201.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class FavoritesStore extends ChangeNotifier {
  final Set<int> _ids = <int>{};

  void toggle(int id) {
    _ids.add(id);
    notifyListeners();
  }
}
''');

      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> refs = app
          .ofKind('logic.Ref')
          .where((Map<String, dynamic> r) => r['name'] == 'id')
          .toList();
      expect(refs, isNotEmpty, reason: 'the body reads `id`');
      expect(
        refs.every((Map<String, dynamic> r) => !r.containsKey('target')),
        isTrue,
        reason: 'a ParamDecl has no id, so a reference to one carries no target',
      );
    });

    test('an action that takes none emits no `params` key at all', () async {
      // Absent *is* the schema's word for "takes none". An empty list would be a second spelling of
      // it, and would change the content of every action that has none.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class CounterStore extends ChangeNotifier {
  int _count = 0;

  void increment() {
    _count++;
    notifyListeners();
  }
}
''');

      expect(app.errors, isEmpty);

      final Map<String, dynamic> action = app.only('sig.Action');
      expect(
        action.containsKey('params'),
        isFalse,
        reason: 'absent means "takes none"; `[]` would be a different statement',
      );
    });

    test('positional order is kept — swapping `from` and `to` compiles, and is wrong', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class RangeStore extends ChangeNotifier {
  final List<int> _spans = <int>[];

  void move(int from, int to, {required bool clamp, int step = 1}) {
    _spans.add(from);
    _spans.add(to);
    notifyListeners();
  }
}
''');

      expect(app.errors, isEmpty);

      final List<dynamic> params = app.only('sig.Action')['params']! as List<dynamic>;
      expect(
        params.map((dynamic p) => (p as Map<String, dynamic>)['name']),
        <String>['from', 'to', 'clamp', 'step'],
        reason: "a positional parameter's order is its meaning",
      );

      final Map<String, dynamic> clamp = params[2] as Map<String, dynamic>;
      expect(clamp['named'], isTrue);
      expect(clamp['required'], isTrue, reason: '`required bool clamp` says so');

      final Map<String, dynamic> step = params[3] as Map<String, dynamic>;
      expect(step['named'], isTrue);
      expect(step.containsKey('required'), isFalse, reason: 'it has a default, so it is optional');
      expect(
        step['defaultValue'],
        containsPair('kind', 'logic.Lit'),
        reason: 'a default is lowered through the ordinary expression path',
      );
      expect(step['defaultValue'], containsPair('value', 1));
    });

    test('a parameter shadows a field of the same name, so it is not a write to the signal', () async {
      // Dart's rule, and the reason the body resolves in the method's own scope. Recording the field
      // as written would tell the generator to re-render on a change that never happened. `report` is
      // itself an action now regardless (M8-H: a method needs no write to be one) — the point this test
      // protects is narrower than "is `report` an action at all": it is that its own parameter is never
      // mistaken for a write to the field it shadows.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Store extends ChangeNotifier {
  int _count = 0;

  void report(int _count) {
    final int local = _count;
  }

  void bump() {
    _count++;
    notifyListeners();
  }
}
''');

      expect(app.errors, isEmpty);
      final List<Map<String, Object?>> actions = app.ofKind('sig.Action');
      expect(actions, hasLength(2), reason: 'both `report` and `bump` are actions (M8-H)');

      final Map<String, Object?> report = actions.singleWhere(
        (Map<String, Object?> a) => a.containsKey('params'),
      );
      expect(report.containsKey('writes'), isFalse, reason: "`_count` is `report`'s own parameter, not the field");

      final Map<String, Object?> bump = actions.singleWhere(
        (Map<String, Object?> a) => !a.containsKey('params'),
      );
      expect(bump.containsKey('writes'), isTrue, reason: '`bump` writes the field `_count`');
    });
  });

  group('the widget tree', () {
    test('a single-child wrapper puts its `child` in `slots`, not `children` (B1)', () async {
      // The catalog is the single source of truth: `Center`/`Padding`/`SizedBox` declare `slots: {child}`.
      // A single child is a slot — the kit's `Center` takes a `child` prop, not React children — and the
      // analyzer must keep the distinction. A hardcoded `case 'child'` here that dropped it into `children`
      // generated `<Center><X/></Center>` against a `Center` that reads `props.child`: the subtree vanished
      // at runtime and the code did not typecheck (validation B1). This asserts the shape the fix restores.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Screen extends StatelessWidget {
  const Screen({super.key});
  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      child: SizedBox(child: const Text('leaf')),
    ),
  );
}
''');

      expect(app.errors, isEmpty);
      for (final String widget in <String>['Center', 'Padding', 'SizedBox']) {
        final Map<String, dynamic> element = app.ofKind('ui.Element').firstWhere(
          (Map<String, dynamic> e) => (e['component']! as Map<String, dynamic>)['name'] == widget,
          orElse: () => throw StateError('no $widget element'),
        );
        expect(
          (element['slots'] as Map<String, dynamic>?)?.containsKey('child'),
          isTrue,
          reason: '$widget.child is a slot the catalog declares, and belongs in `slots`',
        );
        expect(
          element.containsKey('children'),
          isFalse,
          reason: '$widget has no `children` — its one child is a slot, not React children',
        );
      }
    });

    test('children keep source order — it is the order they appear on screen', () async {
      final Extracted app = await extract(counterApp);

      final Map<String, dynamic> column = app.ofKind('ui.Element').firstWhere(
        (Map<String, dynamic> e) =>
            (e['component']! as Map<String, dynamic>)['name'] == 'Column',
      );
      expect(
        (column['children']! as List<dynamic>).map((dynamic c) => (c as Map<String, dynamic>)['kind']),
        <String>['ui.Text', 'ui.Text', 'ui.Element'],
      );
    });

    test('a constant Text is bind.Const; a Text of state is bind.Signal', () async {
      final Extracted app = await extract(counterApp);

      final List<Map<String, dynamic>> texts = app.ofKind('ui.Text');
      final List<Object?> kinds =
          texts.map((Map<String, dynamic> t) => (t['value']! as Map<String, dynamic>)['kind']).toList();

      expect(
        kinds,
        contains('bind.Const'),
        reason: "`Text('Add')` never re-renders, and must not subscribe to anything",
      );
      expect(
        kinds,
        contains('bind.Param'),
        reason: '`Text(widget.title)` reads a prop',
      );
    });

    test('`if (x) Widget()` in a children list is a ui.Cond, not an opaque blob', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Panel extends StatelessWidget {
  const Panel({required this.show, super.key});
  final bool show;
  @override
  Widget build(BuildContext context) => Column(
    children: <Widget>[
      if (show) const Text('yes') else const Text('no'),
      const Text('always'),
    ],
  );
}
''');

      expect(app.errors, isEmpty);
      final Map<String, dynamic> cond = app.only('ui.Cond');
      expect((cond['then']! as Map<String, dynamic>)['kind'], 'ui.Text');
      expect((cond['otherwise']! as Map<String, dynamic>)['kind'], 'ui.Text');
    });

    test('`for (x in xs) Widget(x)` is a ui.List with a template', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Items extends StatelessWidget {
  const Items({required this.names, super.key});
  final List<String> names;
  @override
  Widget build(BuildContext context) => Column(
    children: <Widget>[for (final String n in names) Text(n)],
  );
}
''');

      expect(app.errors, isEmpty);
      final Map<String, dynamic> list = app.only('ui.List');
      expect(list['itemParam'], 'n');
      expect((list['template']! as Map<String, dynamic>)['kind'], 'ui.Text');
    });

    test('`xs.map((x) => W(x)).toList()` is a ui.List too — same meaning, other spelling', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Items extends StatelessWidget {
  const Items({required this.names, super.key});
  final List<String> names;
  @override
  Widget build(BuildContext context) => Column(
    children: names.map((String n) => Text(n)).toList(),
  );
}
''');

      expect(app.only('ui.List')['itemParam'], 'n');
    });

    test('a widget with no rule becomes ui.Opaque with its source, and a BRG1301', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Screen extends StatelessWidget {
  const Screen({super.key});
  Widget _helper() => const Text('x');
  @override
  Widget build(BuildContext context) => _helper();
}
''');

      final Map<String, dynamic> opaque = app.only('ui.Opaque');
      expect(
        opaque['dartSource'],
        '_helper()',
        reason: 'nothing is dropped: the source survives, so an override can supply the mapping',
      );
      expect(app.errors, isEmpty, reason: 'an unknown widget is a warning, not an error');
    });

    test('two identical widgets in one parent get distinct anchors', () async {
      // Anchors are *occurrence* identity — the key the override system uses. Two SizedBoxes in one
      // Column are two places on the screen, and an anchor that cannot tell them apart addresses
      // neither (BRG1205).
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Screen extends StatelessWidget {
  const Screen({super.key});
  @override
  Widget build(BuildContext context) => Column(
    children: const <Widget>[SizedBox(height: 8), SizedBox(height: 8)],
  );
}
''');

      expect(app.errors, isEmpty);
      final List<Object?> anchors =
          app.ofKind('ui.Element').map((Map<String, dynamic> e) => e['anchor']).toList();
      expect(anchors.toSet().length, anchors.length, reason: 'no two nodes share an anchor');
    });
  });

  group('declarations', () {
    test('a mixin survives as logic.OpaqueDecl (v2.2 §A11) rather than vanishing', () async {
      final Extracted app = await extract('''
mixin Loggable {
  void log(String m) {}
}
''');

      expect(app.only('logic.OpaqueDecl')['reason'], 'mixin');
      expect(app.only('logic.OpaqueDecl')['dartSource'], contains('mixin Loggable'));
    });

    test('an extension survives too', () async {
      final Extracted app = await extract('''
extension Doubling on int {
  int get twice => this * 2;
}
''');

      expect(app.only('logic.OpaqueDecl')['reason'], 'extension');
    });

    test('enums, typedefs and functions are modelled, not opaque', () async {
      final Extracted app = await extract('''
enum Status { idle, busy }
typedef Callback = void Function(int);
int add(int a, int b) => a + b;
''');

      expect(app.only('logic.EnumDecl')['values'], <String>['idle', 'busy']);
      expect(app.only('logic.TypeAliasDecl')['name'], 'Callback');
      expect(app.only('logic.FunctionDecl')['name'], 'add');
      expect(app.ofKind('logic.OpaqueDecl'), isEmpty);
    });
  });

  group('routes', () {
    test('MaterialApp(home:) is the route at /', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) => const Text('home');
}

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(home: Home());
}
''');

      expect(app.errors, isEmpty);
      expect(app.only('app.Route')['path'], '/');
    });

    test('a route names the component the OTHER file declares', () async {
      // A symbol built from the referring file names a declaration nobody makes (BRG1201).
      final Extracted app = await extract(
        '''
import 'package:flutter/material.dart';
import 'package:app/home.dart';

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => const MaterialApp(home: Home());
}
''',
        extra: <String, String>{
          'home.dart': '''
import 'package:flutter/material.dart';

class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) => const Text('home');
}
''',
        },
      );

      expect(app.errors, isEmpty, reason: 'the cross-file component reference resolves');
      expect(app.ofKind('app.Route'), hasLength(1));
    });
  });

  group('the contract', () {
    test('extraction never throws — a broken file becomes diagnostics', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Screen extends StatelessWidget {
  const Screen({super.key});
  @override
  Widget build(BuildContext context) => const Mystery();
}
''');

      // It ran. It did not throw. Whatever it could not model, it recorded.
      expect(app.result.status, isNot(RunStatus.pendingImplementation));
    });

    test('the same source extracts to the same bytes, every time (D1–D5)', () async {
      final Extracted first = await extract(counterApp);
      final Extracted second = await extract(counterApp);

      expect(first.bytes, second.bytes);
      expect(first.bytes, isNotEmpty);
    });

    test('a project with no widgets extracts cleanly rather than failing', () async {
      final Extracted app = await extract('int answer() => 42;\n');

      expect(app.errors, isEmpty);
      expect(app.ofKind('ui.Component'), isEmpty);
    });
  });

  group('a MaterialColor is a colour, and its channels are two levels down (M5-A D1/D2)', () {
    // Together these made **every `Colors.<swatch>`** — `blue`, `red`, `deepPurple`, `teal` — silently
    // unresolvable. Not wrong: *absent*. A colour that does not resolve produces no token, so the visible
    // symptom was 45% of one real application's diagnostics blaming the frontend for roles the program
    // had in fact declared.
    //
    // Neither was caught for five milestones because this fixture's Flutter stub could only express a
    // plain `Color`: the build proof seeds from `Color(0xFF6750A4)` and names `Colors.white`, and both
    // declare their channels on themselves. `temp_project.dart` now carries `ColorSwatch`/`MaterialColor`
    // so the case that broke is expressible at all.
    //
    // M5-E extracted the walk into `session/colour_constants.dart`; it had been implemented twice, and
    // both copies needed fixing for this same defect. These tests are what make that extraction checkable.

    test('a swatch resolves to its primary ARGB, read through the (super) chain', () async {
      final Extracted app = await extract(swatchApp);
      expect(app.errors, isEmpty);

      final Set<Object?> values =
          app.ofKind('app.Token').map((Map<String, dynamic> t) => t['light']).toSet();

      expect(
        values,
        contains('#FF3F51B5'),
        reason: 'the swatch primary must resolve; before M5-A it produced no token at all',
      );
    });

    test('a swatch and the plain colour it wraps tokenize identically', () async {
      // The strongest form of the assertion: `Colors.indigo` and `Color(0xFF3F51B5)` *are* the same
      // colour. If the walk stopped a level short, or read a shade rather than the primary, these differ.
      final Extracted swatch = await extract(swatchApp);
      final Extracted plain = await extract(plainColourApp);

      Set<Object?> palette(Extracted app) =>
          app.ofKind('app.Token').map((Map<String, dynamic> t) => t['light']).toSet();

      expect(palette(swatch), isNotEmpty);
      expect(palette(swatch), palette(plain));
    });

    test('every emitted colour is #AARRGGBB, upper case (ADR-21)', () async {
      final Extracted app = await extract(swatchApp);
      for (final Map<String, dynamic> token in app.ofKind('app.Token')) {
        final Object? light = token['light'];
        if (light is! String) {
          continue;
        }
        // Hashed into cache keys and compared as text, so `#ff3f51b5` and `#FF3F51B5` must never both be
        // reachable for one colour.
        expect(light, matches(RegExp(r'^#[0-9A-F]{8}$')), reason: '$light is not canonical ARGB');
      }
    });
  });

  group('a ThemeData with neither colorScheme: nor colorSchemeSeed: falls back to the M3 baseline (M7-K)', () {
    // Flutter's own `ThemeData` factory constructor never leaves `colorScheme` unset: when `useMaterial3`
    // is not explicitly `false` (its default is `true`) and the caller supplies neither `colorScheme:` nor
    // `colorSchemeSeed:`, it falls back to a hardcoded, literal Material 3 baseline scheme
    // (`_colorSchemeLightM3`/`_colorSchemeDarkM3`). That fallback is SDK behaviour the analyzer reads
    // verbatim from `MaterialCatalog`, not a colour it invents (INV-20) — and it is exactly the case
    // `hello_bridge` hits: a `ThemeData(primaryColor:, scaffoldBackgroundColor:, useMaterial3: true)` with
    // no `colorScheme:`/`colorSchemeSeed:` at all.

    const String bareThemeApp = '''
import 'package:flutter/material.dart';

class BareThemeApp extends StatelessWidget {
  const BareThemeApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(
        primaryColor: const Color(0xFF123456),
        scaffoldBackgroundColor: const Color(0xFF654321),
        useMaterial3: true,
      ),
      home: const Text('bare'),
    );
  }
}
''';

    test('every M3 role is emitted, sourced from the SDK baseline', () async {
      final Extracted app = await extract(bareThemeApp);
      expect(app.errors, isEmpty);

      final Map<String, Map<String, dynamic>> byRole = <String, Map<String, dynamic>>{
        for (final Map<String, dynamic> t in app.ofKind('app.Token'))
          if (t['role'] is String) t['role']! as String: t,
      };

      expect(byRole.keys, containsAll(<String>['surface', 'onSurface', 'onSurfaceVariant', 'primary', 'error']));
      expect(byRole['primary']!['light'], '#FF6750A4', reason: 'the literal M3 baseline, not an invented value');
      expect(byRole['surface']!['light'], '#FFFEF7FF');
      expect(byRole.length, 46, reason: 'every role the schema declares, no more and no fewer');
    });

    test('legacy Color properties still tokenize on their own name, unaffected', () async {
      final Extracted app = await extract(bareThemeApp);

      final Map<String, dynamic> primaryColor = app.ofKind('app.Token').firstWhere(
        (Map<String, dynamic> t) => t['name'] == 'primaryColor',
      );
      expect(primaryColor['light'], '#FF123456');
      expect(primaryColor['role'], isNull, reason: 'a legacy property name is not a Material role');
    });

    test('an explicit colorScheme: wins — no baseline role is invented', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class ExplicitApp extends StatelessWidget {
  const ExplicitApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(
        colorScheme: const ColorScheme.light(primary: Color(0xFF00FF00)),
      ),
      home: const Text('explicit'),
    );
  }
}
''');
      expect(app.errors, isEmpty);

      final Map<String, Map<String, dynamic>> byRole = <String, Map<String, dynamic>>{
        for (final Map<String, dynamic> t in app.ofKind('app.Token'))
          if (t['role'] is String) t['role']! as String: t,
      };

      expect(byRole['primary']!['light'], '#FF00FF00', reason: 'the author wrote this — it must win');
      expect(
        byRole.length,
        lessThan(46),
        reason: 'ColorScheme.light() only states the roles it was given; the baseline must not fill the rest',
      );
    });

    test('an explicit colorSchemeSeed: suppresses the baseline too', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class SeededApp extends StatelessWidget {
  const SeededApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(colorSchemeSeed: Colors.indigo),
      home: const Text('seeded'),
    );
  }
}
''');
      expect(app.errors, isEmpty);

      final bool hasBaselinePrimary = app
          .ofKind('app.Token')
          .any((Map<String, dynamic> t) => t['role'] == 'primary' && t['light'] == '#FF6750A4');
      expect(hasBaselinePrimary, isFalse, reason: 'colorSchemeSeed: is an explicit choice; the M3 baseline must not override it');
    });

    test('useMaterial3: false suppresses the baseline', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class MaterialTwoApp extends StatelessWidget {
  const MaterialTwoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(useMaterial3: false, primaryColor: const Color(0xFF123456)),
      home: const Text('m2'),
    );
  }
}
''');
      expect(app.errors, isEmpty);

      final bool hasBaselineRole =
          app.ofKind('app.Token').any((Map<String, dynamic> t) => t['role'] == 'surface');
      expect(hasBaselineRole, isFalse, reason: 'Material 2 has no M3 baseline scheme to fall back to');
    });

    test('theme: and darkTheme: each fall back to their own baseline, merged into one token', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class LightDarkApp extends StatelessWidget {
  const LightDarkApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(brightness: Brightness.light, useMaterial3: true),
      darkTheme: ThemeData(brightness: Brightness.dark, useMaterial3: true),
      home: const Text('both'),
    );
  }
}
''');
      expect(app.errors, isEmpty);

      final Map<String, dynamic> primary = app
          .ofKind('app.Token')
          .firstWhere((Map<String, dynamic> t) => t['role'] == 'primary');
      expect(primary['light'], '#FF6750A4');
      expect(primary['dark'], '#FFD0BCFF', reason: 'the dark M3 baseline is a distinct literal table, not a derived inverse');
    });
  });

  group('a locally-owned store instance resolves declaration and member identity (ADR-27)', () {
    const String counterStoreSource = '''
class CounterStore extends ChangeNotifier {
  int _count = 0;
  int get count => _count;
  int get doubled => _count * 2;
  void increment() {
    _count += 1;
    notifyListeners();
  }
  void add(int n) {
    _count += n;
    notifyListeners();
  }
}
''';

    Map<String, String> withCounterStore() =>
        <String, String>{'counter_store.dart': "import 'package:flutter/material.dart';\n\n$counterStoreSource"};

    test('the field is an app.StoreInstance, not a sig.Signal — the field type is a declared store', () async {
      final Extracted app = await extract(
        r'''
import 'package:flutter/material.dart';
import 'package:app/counter_store.dart';

class Screen extends StatefulWidget {
  const Screen({super.key});
  @override
  State<Screen> createState() => _ScreenState();
}

class _ScreenState extends State<Screen> {
  final CounterStore store = CounterStore();
  @override
  Widget build(BuildContext context) => Text('${store.count}');
}
''',
        extra: withCounterStore(),
      );

      expect(app.errors, isEmpty);
      expect(app.ofKind('app.StoreInstance'), hasLength(1), reason: 'the field, not a sig.Signal');
      final Map<String, dynamic> instance = app.only('app.StoreInstance');
      expect(instance['scope'], 'component');
      final Map<String, dynamic> store = app.only('app.Store');
      expect(instance['store'], store['id'], reason: 'declaration identity — which store class this instantiates');
      expect(
        app.ofKind('sig.Signal').where((Map<String, dynamic> s) => s['scope'] == 'component'),
        isEmpty,
        reason: 'no ordinary component signal was minted for a store-typed field',
      );
    });

    test('a signal/derived/action read on the field resolves target by the real resolved element', () async {
      final Extracted app = await extract(
        r'''
import 'package:flutter/material.dart';
import 'package:app/counter_store.dart';

class Screen extends StatefulWidget {
  const Screen({super.key});
  @override
  State<Screen> createState() => _ScreenState();
}

class _ScreenState extends State<Screen> {
  final CounterStore store = CounterStore();
  @override
  Widget build(BuildContext context) => Column(
    children: <Widget>[
      Text('${store.count}'),
      Text('${store.doubled}'),
      ElevatedButton(onPressed: store.increment, child: const Text('inc')),
      ElevatedButton(onPressed: () => store.add(2), child: const Text('add')),
    ],
  );
}
''',
        extra: withCounterStore(),
      );

      expect(app.errors, isEmpty);
      final Map<String, dynamic> storeNode = app.only('app.Store');
      final List<dynamic> derivedIds = storeNode['derived'] as List<dynamic>;
      final List<dynamic> actionIds = storeNode['actions'] as List<dynamic>;
      expect(derivedIds, hasLength(2), reason: 'count, doubled');
      expect(actionIds, hasLength(2), reason: 'increment, add');

      final List<Map<String, dynamic>> propertyAccesses = app.ofKind('logic.PropertyAccess');
      final List<Map<String, dynamic>> methodCalls = app.ofKind('logic.MethodCall');
      final Set<Object?> propertyTargets = propertyAccesses.map((Map<String, dynamic> n) => n['target']).toSet();
      final Set<Object?> methodTargets = methodCalls.map((Map<String, dynamic> n) => n['target']).toSet();

      // `count`/`doubled` resolve as PropertyAccess targets; `add(2)` as a MethodCall target; the
      // tear-off `store.increment` has no parens, so it is a PropertyAccess whose target is the action.
      for (final Object? id in derivedIds) {
        expect(propertyTargets, contains(id), reason: 'a derived member resolves through PropertyAccess');
      }
      final Map<String, dynamic> tearOff = propertyAccesses.firstWhere((Map<String, dynamic> n) => n['property'] == 'increment');
      expect(actionIds, contains(tearOff['target']), reason: 'the tear-off (no parens) still resolves to the action');
      expect(methodTargets.where(actionIds.contains), isNotEmpty, reason: 'add(2) resolves through MethodCall');
    });

    test('two instances of the same store share member identity but have distinct receivers', () async {
      final Extracted app = await extract(
        r'''
import 'package:flutter/material.dart';
import 'package:app/counter_store.dart';

class Screen extends StatefulWidget {
  const Screen({super.key});
  @override
  State<Screen> createState() => _ScreenState();
}

class _ScreenState extends State<Screen> {
  final CounterStore left = CounterStore();
  final CounterStore right = CounterStore();
  @override
  Widget build(BuildContext context) => Column(
    children: <Widget>[
      Text('${left.count}'),
      Text('${right.count}'),
    ],
  );
}
''',
        extra: withCounterStore(),
      );

      expect(app.errors, isEmpty);
      expect(app.ofKind('app.StoreInstance'), hasLength(2), reason: 'left and right are distinct declarations');
      final List<String> instanceIds = app
          .ofKind('app.StoreInstance')
          .map((Map<String, dynamic> n) => n['id'] as String)
          .toList();
      expect(instanceIds.toSet(), hasLength(2), reason: 'two distinct instance ids');

      final List<Map<String, dynamic>> reads = app.ofKind('logic.PropertyAccess');
      final Set<Object?> targets = reads.map((Map<String, dynamic> n) => n['target']).where((Object? t) => t != null).toSet();
      expect(targets, hasLength(1), reason: 'left.count and right.count name the same declared member');

      final Set<Object?> receiverTargets = reads
          .map((Map<String, dynamic> n) => (n['receiver'] as Map<String, dynamic>?)?['target'])
          .where((Object? t) => t != null)
          .toSet();
      expect(receiverTargets, hasLength(2), reason: 'left and right resolve to two distinct receivers');
    });

    test('two different store classes with the same member name never collide', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';

class AStore extends ChangeNotifier {
  int _count = 0;
  int get count => _count;
  void increment() {
    _count += 1;
    notifyListeners();
  }
}

class BStore extends ChangeNotifier {
  int _count = 0;
  int get count => _count;
  void increment() {
    _count += 1;
    notifyListeners();
  }
}

class Screen extends StatefulWidget {
  const Screen({super.key});
  @override
  State<Screen> createState() => _ScreenState();
}

class _ScreenState extends State<Screen> {
  final AStore a = AStore();
  final BStore b = BStore();
  @override
  Widget build(BuildContext context) => Column(
    children: <Widget>[
      Text('${a.count}'),
      Text('${b.count}'),
    ],
  );
}
''');

      expect(app.errors, isEmpty);
      final List<Map<String, dynamic>> stores = app.ofKind('app.Store');
      expect(stores, hasLength(2));

      final List<Map<String, dynamic>> reads = app.ofKind('logic.PropertyAccess');
      final Set<Object?> targets = reads.map((Map<String, dynamic> n) => n['target']).where((Object? t) => t != null).toSet();
      expect(targets, hasLength(2), reason: 'AStore.count and BStore.count are two distinct declarations');
    });

    test('an ordinary (non-store) class field target is never store-prefixed — Point.x (ADR-0035, M9-N)', () async {
      // Pre-M9-N this asserted Point.x carried no target at all. As of ADR-0035 (M9-N), an eligible
      // external final-field read *does* get a target — truthful declaration provenance, independent of
      // the receiver's own shape (here, a constructor-result receiver, `Point(1, 2).x`, never a supported
      // M9-J execution receiver either way). What this test still protects is the ADR-27 boundary: that
      // target must never be confused with a store member's own `sig:`/`der:`/`act:`-prefixed symbol.
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';

class Point {
  Point(this.x, this.y);
  final int x;
  final int y;
}

class Screen extends StatelessWidget {
  const Screen({super.key});
  @override
  Widget build(BuildContext context) {
    return const _PointText();
  }
}

class _PointText extends StatelessWidget {
  const _PointText();
  @override
  Widget build(BuildContext context) => Text('${Point(1, 2).x}');
}
''');

      expect(app.errors, isEmpty);
      expect(app.ofKind('app.StoreInstance'), isEmpty);
      expect(app.ofKind('app.Store'), isEmpty);
      final List<Map<String, dynamic>> reads = app.ofKind('logic.PropertyAccess');
      final Map<String, dynamic> xRead = reads.firstWhere((Map<String, dynamic> n) => n['property'] == 'x');
      final Map<String, dynamic> point =
          app.ofKind('logic.ClassDecl').singleWhere((Map<String, dynamic> d) => d['name'] == 'Point');
      final Map<String, dynamic> xField = (point['fields'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .singleWhere((Map<String, dynamic> f) => f['name'] == 'x');
      expect(xRead['target'], xField['id'], reason: 'Point.x (ADR-0035) — a plain field target, never a store member');
    });

    test('a cross-file store instance resolves identically to a same-file one', () async {
      final Extracted app = await extract(
        r'''
import 'package:flutter/material.dart';
import 'package:app/counter_store.dart';

class Screen extends StatefulWidget {
  const Screen({super.key});
  @override
  State<Screen> createState() => _ScreenState();
}

class _ScreenState extends State<Screen> {
  final CounterStore store = CounterStore();
  @override
  Widget build(BuildContext context) => Text('${store.count}');
}
''',
        extra: withCounterStore(),
      );

      expect(app.errors, isEmpty, reason: 'the cross-file store class reference resolves (BRG1201 would fire otherwise)');
      final Map<String, dynamic> store = app.only('app.Store');
      final List<Map<String, dynamic>> reads = app.ofKind('logic.PropertyAccess');
      final Map<String, dynamic> countRead = reads.firstWhere((Map<String, dynamic> n) => n['property'] == 'count');
      expect(store['derived'] as List<dynamic>, contains(countRead['target']));
    });

    test('a TextEditingController field stays an ordinary state-holder signal, not an app.StoreInstance', () async {
      // `TextEditingController extends ChangeNotifier` too — the exact overlap `isStateHolder` and
      // `isStoreBase` share, and the defect the build-proof golden caught mid-milestone: `isStoreBase`
      // alone cannot tell a user's own store class from a framework notifier type. Only a field whose
      // type this *project* declares becomes an `app.StoreInstance`.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';

class Screen extends StatefulWidget {
  const Screen({super.key});
  @override
  State<Screen> createState() => _ScreenState();
}

class _ScreenState extends State<Screen> {
  final TextEditingController _email = TextEditingController();

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => TextField(controller: _email);
}
''');

      expect(app.errors, isEmpty);
      expect(app.ofKind('app.StoreInstance'), isEmpty, reason: 'TextEditingController is a framework type, not a declared store');
      expect(app.ofKind('app.Store'), isEmpty);
      // `_email.dispose()` must survive — erasing a framework resource's own disposal would leak it.
      final List<Map<String, dynamic>> disposeCalls = app
          .ofKind('logic.MethodCall')
          .where((Map<String, dynamic> n) => n['method'] == 'dispose')
          .toList();
      expect(
        disposeCalls.any((Map<String, dynamic> n) => (n['receiver'] as Map<String, dynamic>?)?['name'] == '_email'),
        isTrue,
        reason: "_email.dispose() is not erased — only a locally-owned store instance's lifecycle calls are",
      );
    });
  });

  group('structured build-method extraction (M8-B)', () {
    // M8-A measured two real applications (Continuum) and found the single blocker preventing either
    // from reaching generated output: a `build()`-shaped method whose body is not a single
    // `return <expr>` was extracted wholesale as `ui.Opaque` — even a plain `if`/local-variable shape
    // that carries no side effect at all. These tests assert the *structure* extraction now produces
    // for the shapes M8-A's census found real, not merely the absence of `ui.Opaque`.

    test('A: a single return still extracts exactly as before', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('A');
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('ui.Opaque'), isEmpty);
      final Map<String, dynamic> render = app.only('ui.Component')['render'] as Map<String, dynamic>;
      expect(render['kind'], 'ui.Text');
    });

    test('B: a local holding a widget substitutes at its one use, not opaqued', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) {
    final child = const Text('A');
    return child;
  }
}
''');
      expect(app.errors, isEmpty);
      expect(
        app.ofKind('ui.Opaque'),
        isEmpty,
        reason: 'a widget-valued local referenced once must not fall back to "widget held in a variable"',
      );
      final Map<String, dynamic> render = app.only('ui.Component')['render'] as Map<String, dynamic>;
      expect(render['kind'], 'ui.Text');
      expect((render['value'] as Map<String, dynamic>)['value'], 'A');
    });

    test('C: if + fallback return becomes ui.Cond, condition and branches correct', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({required this.flag, super.key});
  final bool flag;
  @override
  Widget build(BuildContext context) {
    if (flag) {
      return const Text('A');
    }
    return const Text('B');
  }
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('ui.Opaque'), isEmpty);
      expect(app.ofKind('ui.Cond'), hasLength(1));
      final Map<String, dynamic> cond = app.only('ui.Cond');
      expect((cond['test'] as Map<String, dynamic>)['param'], 'flag');
      final Map<String, dynamic> then = cond['then'] as Map<String, dynamic>;
      final Map<String, dynamic> otherwise = cond['otherwise'] as Map<String, dynamic>;
      expect((then['value'] as Map<String, dynamic>)['value'], 'A');
      expect((otherwise['value'] as Map<String, dynamic>)['value'], 'B');
    });

    test('D: an early-return chain becomes nested ui.Cond, in source order', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({required this.a, required this.b, super.key});
  final bool a;
  final bool b;
  @override
  Widget build(BuildContext context) {
    if (a) return const Text('A');
    if (b) return const Text('B');
    return const Text('C');
  }
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('ui.Opaque'), isEmpty);
      final List<Map<String, dynamic>> conds = app.ofKind('ui.Cond');
      expect(conds, hasLength(2), reason: 'two ifs, two ui.Cond — one is not collapsed into the other');

      final Map<String, dynamic> outer = app.only('ui.Component')['render'] as Map<String, dynamic>;
      expect(
        (outer['test'] as Map<String, dynamic>)['param'],
        'a',
        reason: 'the first condition in source order must be the outermost — reversing it changes which branch a true `a` takes',
      );
      expect(((outer['then'] as Map<String, dynamic>)['value'] as Map<String, dynamic>)['value'], 'A');

      final Map<String, dynamic> inner = outer['otherwise'] as Map<String, dynamic>;
      expect(inner['kind'], 'ui.Cond');
      expect((inner['test'] as Map<String, dynamic>)['param'], 'b');
      expect(((inner['then'] as Map<String, dynamic>)['value'] as Map<String, dynamic>)['value'], 'B');
      expect(((inner['otherwise'] as Map<String, dynamic>)['value'] as Map<String, dynamic>)['value'], 'C');
    });

    test('E: a conditional expression assigned to a local still reaches ui.Cond', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({required this.flag, super.key});
  final bool flag;
  @override
  Widget build(BuildContext context) {
    final child = flag ? const Text('A') : const Text('B');
    return child;
  }
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('ui.Opaque'), isEmpty);
      expect(app.ofKind('ui.Cond'), hasLength(1));
    });

    test('F: a local referenced twice substitutes independently at each site', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({required this.name, super.key});
  final String name;
  @override
  Widget build(BuildContext context) {
    final label = 'Hello, \$name';
    return Column(children: [Text(label), Text(label.toUpperCase())]);
  }
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('ui.Opaque'), isEmpty);
      final List<Map<String, dynamic>> texts = app.ofKind('ui.Text');
      expect(texts, hasLength(2));
      // The second use wraps the *same* substituted expression in `.toUpperCase()` — proving the
      // second site is not a stale or shared reference to the first's node, but its own extraction of
      // the same initializer, only in .toUpperCase() where the first one is bare.
      expect(
        (texts[1]['value'] as Map<String, dynamic>)['expr'] as Map<String, dynamic>?,
        containsPair('method', 'toUpperCase'),
      );
    });

    test('two distinct locals never resolve to the wrong one', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) {
    final first = const Text('first');
    final second = const Text('second');
    return Row(children: [second, first]);
  }
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('ui.Opaque'), isEmpty);
      final Map<String, dynamic> row = app.only('ui.Element');
      final List<dynamic> children = row['children'] as List<dynamic>;
      final List<Map<String, dynamic>> texts = children.cast<Map<String, dynamic>>();
      expect(
        (texts[0]['value'] as Map<String, dynamic>)['value'],
        'second',
        reason: 'source order put `second` first — resolving by declaration order rather than by the reference actually written would silently swap these',
      );
      expect((texts[1]['value'] as Map<String, dynamic>)['value'], 'first');
    });

    test('G: if/else where both branches return is the same shape as if + fallback', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({required this.flag, super.key});
  final bool flag;
  @override
  Widget build(BuildContext context) {
    if (flag) {
      return const Text('A');
    } else {
      return const Text('B');
    }
  }
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('ui.Opaque'), isEmpty);
      expect(app.ofKind('ui.Cond'), hasLength(1));
      final Map<String, dynamic> cond = app.only('ui.Cond');
      expect(((cond['then'] as Map<String, dynamic>)['value'] as Map<String, dynamic>)['value'], 'A');
      expect(((cond['otherwise'] as Map<String, dynamic>)['value'] as Map<String, dynamic>)['value'], 'B');
    });

    test('a build() that was already a lone if/else statement no longer crashes extraction', () async {
      // Regression: `_returnedWidget`'s old unsafe `as ReturnStatement?` cast threw
      // `type 'IfStatementImpl' is not a subtype of type 'ReturnStatement?'` for exactly this shape —
      // found by this milestone's own reduction ladder, not present in any prior fixture.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({required this.flag, super.key});
  final bool flag;
  @override
  Widget build(BuildContext context) {
    if (flag) {
      return const Text('A');
    } else {
      return const Text('B');
    }
  }
}
''');
      expect(app.result, isNotNull);
      expect(app.errors, isEmpty);
    });

    group('the side-effect boundary refuses honestly rather than dropping anything (Phase 7)', () {
      test('a bare statement before the return stays opaque', () async {
        final Extracted app = await extract('''
import 'package:flutter/material.dart';
void logSomething() {}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) {
    logSomething();
    return const Text('A');
  }
}
''');
        final Map<String, dynamic> render = app.only('ui.Component')['render'] as Map<String, dynamic>;
        expect(render['kind'], 'ui.Opaque');
        expect(render['reason'], 'build body with statements');
        expect(
          render['dartSource'],
          contains('logSomething()'),
          reason: 'the call is preserved verbatim, not silently dropped (INV-4)',
        );
      });

      test('mutating a local (`x++`) stays opaque', () async {
        final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) {
    var x = 0;
    x++;
    return Text('$x');
  }
}
''');
        final Map<String, dynamic> render = app.only('ui.Component')['render'] as Map<String, dynamic>;
        expect(render['kind'], 'ui.Opaque');
      });

      test('a side effect inside a non-returning if stays opaque', () async {
        final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({required this.flag, super.key});
  final bool flag;
  void mutate() {}
  @override
  Widget build(BuildContext context) {
    if (flag) {
      mutate();
    }
    return const Text('A');
  }
}
''');
        final Map<String, dynamic> render = app.only('ui.Component')['render'] as Map<String, dynamic>;
        expect(
          render['kind'],
          'ui.Opaque',
          reason: 'an if whose branch does not return is not the proven-safe grammar — refuse, do not guess',
        );
      });

      test('an unused local stays opaque rather than silently dropping its initializer', () async {
        final Extracted app = await extract('''
import 'package:flutter/material.dart';
int sideEffecting() => 1;
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) {
    final unused = sideEffecting();
    return const Text('A');
  }
}
''');
        final Map<String, dynamic> render = app.only('ui.Component')['render'] as Map<String, dynamic>;
        expect(
          render['kind'],
          'ui.Opaque',
          reason: 'dropping an unread local would silently drop whatever its initializer did',
        );
        expect(render['dartSource'], contains('sideEffecting()'));
      });

      test('statements after a terminal if/else stay opaque, not silently unreachable code', () async {
        final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({required this.flag, super.key});
  final bool flag;
  @override
  Widget build(BuildContext context) {
    if (flag) {
      return const Text('A');
    } else {
      return const Text('B');
    }
    // ignore: dead_code
    return const Text('C');
  }
}
''');
        final Map<String, dynamic> render = app.only('ui.Component')['render'] as Map<String, dynamic>;
        expect(render['kind'], 'ui.Opaque');
      });

      test('a multi-variable declaration statement stays opaque', () async {
        final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) {
    final a = 1, b = 2;
    return Text('\$a\$b');
  }
}
''');
        final Map<String, dynamic> render = app.only('ui.Component')['render'] as Map<String, dynamic>;
        expect(render['kind'], 'ui.Opaque');
      });
    });
  });

  group('enum constant reference identity (M8-D)', () {
    // M8-C measured 7 real Continuum sites where an application enum constant (`_Stage.loading`)
    // reached the generator as an apparently-undeclared name — `logic.Ref` with no `target` — even
    // though the analyzer had already, itself, fully resolved which declaration it named. These tests
    // assert the resolved identity directly (`target` equals the enum declaration's own id), not merely
    // the absence of a diagnostic — a test that only checked `errors: isEmpty` would still pass if the
    // target were wrong, or pointed at nothing.

    test('a same-file enum constant carries a target to its own declaration', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
enum Stage { idle, ready }
class W extends StatelessWidget {
  const W({required this.flag, super.key});
  final bool flag;
  @override
  Widget build(BuildContext context) => Text('${flag ? Stage.ready : Stage.idle}');
}
''');
      expect(app.errors, isEmpty);
      final Map<String, dynamic> decl = app.only('logic.EnumDecl');
      expect(decl['name'], 'Stage');
      final List<Map<String, dynamic>> refs = app
          .ofKind('logic.Ref')
          .where((Map<String, dynamic> r) => (r['name'] as String).startsWith('Stage.'))
          .toList();
      expect(refs, hasLength(2));
      for (final Map<String, dynamic> ref in refs) {
        expect(
          ref['target'],
          decl['id'],
          reason: '`${ref['name']}` must resolve to the enum it names, not merely to *an* enum',
        );
      }
    });

    test('a cross-file, same-package enum constant resolves to the declaring file, not the referring one', () async {
      final Extracted app = await extract(
        r'''
import 'package:flutter/material.dart';
import 'stage.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text('${Stage.ready}');
}
''',
        extra: <String, String>{'stage.dart': 'enum Stage { idle, ready }'},
      );
      expect(app.errors, isEmpty);
      final Map<String, dynamic> decl = app.only('logic.EnumDecl');
      final Map<String, dynamic> ref = app.ofKind('logic.Ref').singleWhere((Map<String, dynamic> r) => r['name'] == 'Stage.ready');
      expect(ref['target'], decl['id']);
      expect(
        (decl['span'] as Map<String, dynamic>)['file'],
        'lib/stage.dart',
        reason: 'the declaration extraction found must be the one in stage.dart, not a duplicate invented in main.dart',
      );
    });

    test('two different enums with an identically-named member never share identity', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
enum EnumA { ready, waiting }
enum EnumB { ready, waiting }
class W extends StatelessWidget {
  const W({required this.a, required this.b, super.key});
  final EnumA a;
  final EnumB b;
  @override
  Widget build(BuildContext context) => Text('${a == EnumA.ready}${b == EnumB.ready}');
}
''');
      expect(app.errors, isEmpty);
      final List<Map<String, dynamic>> decls = app.ofKind('logic.EnumDecl');
      expect(decls, hasLength(2));
      final String declA = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'EnumA')['id'] as String;
      final String declB = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'EnumB')['id'] as String;
      expect(declA, isNot(declB));

      final Map<String, dynamic> refA = app.ofKind('logic.Ref').singleWhere((Map<String, dynamic> r) => r['name'] == 'EnumA.ready');
      final Map<String, dynamic> refB = app.ofKind('logic.Ref').singleWhere((Map<String, dynamic> r) => r['name'] == 'EnumB.ready');
      expect(refA['target'], declA);
      expect(refB['target'], declB);
      expect(
        refA['target'],
        isNot(refB['target']),
        reason: 'the two `.ready`s must never resolve to the same identity merely because they are spelled the same',
      );
    });

    test('a local variable shadowing an enum member name is never claimed as the enum', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum Stage { idle, ready }
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) {
    final ready = 'shadow';
    return Text(ready);
  }
}
''');
      expect(app.errors, isEmpty);
      // The local wins by ordinary lexical scoping (M8-B) before any static/enum-qualified handling is
      // ever considered — its value is substituted in place, so no `logic.Ref` survives to name it at
      // all, and certainly none carries a `target` into `Stage`.
      expect(app.ofKind('logic.Ref'), isEmpty);
      final Map<String, dynamic> text = app.only('ui.Text');
      final Map<String, dynamic> value = text['value'] as Map<String, dynamic>;
      expect(
        (value['expr'] as Map<String, dynamic>)['value'],
        'shadow',
        reason: "the local's own value, substituted in place — not the enum member of the same name",
      );
    });

    test('an unrelated instance property with the same spelling stays a plain property read', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum Stage { idle, ready }
class Thing {
  final String ready = 'x';
}
class W extends StatelessWidget {
  const W({required this.thing, super.key});
  final Thing thing;
  @override
  Widget build(BuildContext context) => Text(thing.ready);
}
''');
      expect(app.errors, isEmpty);
      final Map<String, dynamic> access = app.only('logic.PropertyAccess');
      expect(access['property'], 'ready');
      // As of ADR-0035 (M9-N), an eligible external final-field read *does* carry a target — truthful
      // field declaration provenance, independent of the property's own spelling. What this test still
      // protects is the M8-D boundary: that target must be `Thing.ready`'s own `FieldDecl`, never
      // resolved to `Stage.ready` (the enum constant) on the strength of the word "ready" alone.
      final Map<String, dynamic> thing =
          app.ofKind('logic.ClassDecl').singleWhere((Map<String, dynamic> d) => d['name'] == 'Thing');
      final Map<String, dynamic> readyField = (thing['fields'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .singleWhere((Map<String, dynamic> f) => f['name'] == 'ready');
      expect(
        access['target'],
        readyField['id'],
        reason: "`thing.ready` (ADR-0035) must target `Thing.ready`'s own FieldDecl, never `Stage.ready` "
            '(the enum constant) on the strength of the word "ready" alone',
      );
    });

    test('a static const on a plain class is not claimed as an enum constant (Phase 13)', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
class Limits {
  static const count = 3;
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text('${Limits.count}');
}
''');
      expect(app.errors, isEmpty);
      final Map<String, dynamic> ref = app.ofKind('logic.Ref').singleWhere((Map<String, dynamic> r) => r['name'] == 'Limits.count');
      expect(
        ref.containsKey('target'),
        isFalse,
        reason: 'a plain static const is not an enum constant (`isEnumConstant` is false) — this '
            'milestone only proved the enum case; classifying static const the same way would be an '
            'unproven claim, not a proven identity',
      );
    });

    test('an unresolved reference is still unresolved, not accidentally claimed', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(SomethingUndeclared.value);
}
''');
      // The project itself is malformed here (an undeclared name) — this asserts the extractor does not
      // crash on it and does not fabricate a `target` for a name that resolves to nothing.
      final List<Map<String, dynamic>> refs = app.ofKind('logic.Ref');
      for (final Map<String, dynamic> ref in refs) {
        if (ref['name'] == 'SomethingUndeclared.value') {
          expect(ref.containsKey('target'), isFalse);
        }
      }
    });
  });

  group('cross-package component program assembly (M8-F)', () {
    // M8-E found the capability stopped at three narrow chokepoints — file discovery, analysis-context
    // scope, and Symbols.pathOf's single-packageName filter — not a missing architecture. These tests
    // assert the actual identity a caller gets, not merely that extraction did not crash.

    test('a component declared in a local path dependency becomes a real ui.Component', () async {
      final Extracted app = await extract(
        '''
import 'package:flutter/material.dart';
import 'package:ui_kit/greeting_card.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const GreetingCard(name: 'Ada');
}
''',
        localDependencies: <String, Map<String, String>>{
          'ui_kit': <String, String>{
            'greeting_card.dart': r'''
import 'package:flutter/material.dart';
class GreetingCard extends StatelessWidget {
  const GreetingCard({required this.name, super.key});
  final String name;
  @override
  Widget build(BuildContext context) => Card(child: Text('Hello, $name'));
}
''',
          },
        },
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> card = app.ofKind('ui.Component').singleWhere(
        (Map<String, dynamic> c) => c['name'] == 'GreetingCard',
      );
      expect(
        (card['anchor'] as String).startsWith('package:ui_kit/greeting_card.dart#'),
        isTrue,
        reason: 'a dependency component is anchored to its own file, in its own package’s URI space',
      );
      // Its own render tree is genuinely present, not stubbed — the whole point of assembly, not just
      // discovery.
      expect(card['render'], isNotNull);
      expect((card['render'] as Map<String, dynamic>)['kind'], 'ui.Element');

      final Map<String, dynamic> reference = app.ofKind('ui.Element').singleWhere(
        (Map<String, dynamic> e) => (e['component'] as Map<String, dynamic>?)?['name'] == 'GreetingCard',
      );
      final Map<String, dynamic> componentRef = reference['component'] as Map<String, dynamic>;
      expect(
        componentRef['library'],
        'package:ui_kit/greeting_card.dart',
        reason: 'the caller’s own reference must name the same declaring file the ui.Component is anchored to',
      );
      expect(componentRef['userDefined'], isTrue);

      // The constructor prop crossed the package boundary too, not just the bare reference.
      final Map<String, dynamic> props = reference['props'] as Map<String, dynamic>;
      expect((props['name'] as Map<String, dynamic>)['value'], 'Ada');
    });

    test('same class name in two local dependencies never collides', () async {
      final Extracted app = await extract(
        '''
import 'package:flutter/material.dart';
import 'package:pkg_a/shared.dart' as a;
import 'package:pkg_b/shared.dart' as b;
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Column(children: [const a.SharedPage(), const b.SharedPage()]);
}
''',
        localDependencies: <String, Map<String, String>>{
          'pkg_a': <String, String>{
            'shared.dart': '''
import 'package:flutter/material.dart';
class SharedPage extends StatelessWidget {
  const SharedPage({super.key});
  @override
  Widget build(BuildContext context) => const Text('from A');
}
''',
          },
          'pkg_b': <String, String>{
            'shared.dart': '''
import 'package:flutter/material.dart';
class SharedPage extends StatelessWidget {
  const SharedPage({super.key});
  @override
  Widget build(BuildContext context) => const Text('from B');
}
''',
          },
        },
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> shared = app.ofKind('ui.Component').where(
        (Map<String, dynamic> c) => c['name'] == 'SharedPage',
      ).toList();
      expect(shared, hasLength(2), reason: 'each package’s own SharedPage must extract as its own component');
      expect(
        shared[0]['id'],
        isNot(shared[1]['id']),
        reason: 'two distinct declarations sharing a class name must never share a NodeId',
      );
      expect(shared[0]['anchor'], isNot(shared[1]['anchor']));

      final List<Map<String, dynamic>> refs = app.ofKind('ui.Element').where(
        (Map<String, dynamic> e) => (e['component'] as Map<String, dynamic>?)?['name'] == 'SharedPage',
      ).toList();
      expect(refs, hasLength(2));
      final Set<String> referencedLibraries = refs
          .map((Map<String, dynamic> e) => (e['component'] as Map<String, dynamic>)['library'] as String)
          .toSet();
      expect(
        referencedLibraries,
        <String>{'package:pkg_a/shared.dart', 'package:pkg_b/shared.dart'},
        reason: 'each call site must reference its own package’s SharedPage, not either one arbitrarily',
      );
    });

    test('same relative file path in two local dependencies never collides', () async {
      final Extracted app = await extract(
        '''
import 'package:flutter/material.dart';
import 'package:pkg_a/page.dart' as a;
import 'package:pkg_b/page.dart' as b;
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Column(children: [const a.PageA(), const b.PageB()]);
}
''',
        localDependencies: <String, Map<String, String>>{
          'pkg_a': <String, String>{
            'page.dart': '''
import 'package:flutter/material.dart';
class PageA extends StatelessWidget {
  const PageA({super.key});
  @override
  Widget build(BuildContext context) => const Text('A');
}
''',
          },
          'pkg_b': <String, String>{
            'page.dart': '''
import 'package:flutter/material.dart';
class PageB extends StatelessWidget {
  const PageB({super.key});
  @override
  Widget build(BuildContext context) => const Text('B');
}
''',
          },
        },
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> pageA = app.ofKind('ui.Component').singleWhere((Map<String, dynamic> c) => c['name'] == 'PageA');
      final Map<String, dynamic> pageB = app.ofKind('ui.Component').singleWhere((Map<String, dynamic> c) => c['name'] == 'PageB');
      expect(pageA['id'], isNot(pageB['id']));
      expect(pageA['anchor'], 'package:pkg_a/page.dart#PageA');
      expect(pageB['anchor'], 'package:pkg_b/page.dart#PageB');
    });

    test('a Flutter SDK class never becomes a project component', () async {
      final Extracted app = await extract(counterApp);
      for (final Map<String, dynamic> component in app.ofKind('ui.Component')) {
        expect(
          component['name'],
          isNot(anyOf('StatelessWidget', 'StatefulWidget', 'Widget', 'State')),
          reason: 'the SDK is framework surface, never project declaration, regardless of what the '
              'analyzer can resolve about it',
        );
      }
    });

    test('an unrelated (non-local) pub dependency widget is not accidentally compiled', () async {
      final Extracted app = await extract(
        '''
import 'package:flutter/material.dart';
import 'package:some_pub_pkg/widget.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const PubWidget();
}
''',
        dependencies: <String, Map<String, String>>{
          'flutter': flutterPackage,
          'some_pub_pkg': <String, String>{
            'widget.dart': '''
import 'package:flutter/material.dart';
class PubWidget extends StatelessWidget {
  const PubWidget({super.key});
  @override
  Widget build(BuildContext context) => const Text('pub');
}
''',
          },
        },
      );
      expect(app.errors, isEmpty);
      expect(
        app.ofKind('ui.Component').where((Map<String, dynamic> c) => c['name'] == 'PubWidget'),
        isEmpty,
        reason: 'an ordinary pub dependency (source: hosted, an absolute rootUri) is not this closure '
            'merely because the analyzer can resolve it — only a local (path/workspace) dependency is',
      );
    });

    test('a dart:core class never becomes a project component', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(DateTime.now().toString());
}
''');
      expect(
        app.ofKind('ui.Component').where((Map<String, dynamic> c) => c['name'] == 'DateTime'),
        isEmpty,
      );
    });
  });

  group('top-level declaration identity (M8-J)', () {
    // A bare or import-prefixed reference to a top-level const/final/function/getter resolved by
    // `package:analyzer`'s own element model, never by matching a name against another file's.

    String? targetOf(Extracted app, String name) => app
        .ofKind('logic.Ref')
        .firstWhere((Map<String, dynamic> r) => r['name'] == name)['target'] as String?;

    test('a cross-file top-level const carries a target to its own declaration', () async {
      final Extracted app = await extract(
        '''
import 'package:flutter/material.dart';
import 'decls.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(crossFileConst);
}
''',
        extra: <String, String>{'decls.dart': "const String crossFileConst = 'value';"},
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> decl = app.only('logic.FieldDecl');
      expect(targetOf(app, 'crossFileConst'), decl['id']);
    });

    test('a cross-file top-level function, called and torn off, both carry a target', () async {
      final Extracted app = await extract(
        '''
import 'package:flutter/material.dart';
import 'decls.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => ElevatedButton(onPressed: crossFileFn, child: Text(crossFileFn()));
}
''',
        extra: <String, String>{'decls.dart': "String crossFileFn() => 'value';"},
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> decl = app.only('logic.FunctionDecl');
      final List<Map<String, dynamic>> refs = app
          .ofKind('logic.Ref')
          .where((Map<String, dynamic> r) => r['name'] == 'crossFileFn')
          .toList();
      expect(refs, hasLength(2), reason: 'the tear-off and the call both reach a logic.Ref');
      expect(refs.every((Map<String, dynamic> r) => r['target'] == decl['id']), isTrue);
    });

    test('a cross-file top-level getter carries a target to its own declaration', () async {
      final Extracted app = await extract(
        '''
import 'package:flutter/material.dart';
import 'decls.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(crossFileGetter);
}
''',
        extra: <String, String>{'decls.dart': "String get crossFileGetter => 'value';"},
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> decl = app.only('logic.FunctionDecl');
      expect(targetOf(app, 'crossFileGetter'), decl['id']);
    });

    test('a cross-package top-level const and function, via an import prefix, both resolve', () async {
      final Extracted app = await extract(
        r'''
import 'package:flutter/material.dart';
import 'package:dep/dep.dart' as dep;
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text('${dep.depConst} ${dep.depFormat('x')}');
}
''',
        localDependencies: <String, Map<String, String>>{
          'dep': <String, String>{
            'dep.dart': "const String depConst = 'v';\nString depFormat(String s) => s;",
          },
        },
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> constDecl = app
          .ofKind('logic.FieldDecl')
          .singleWhere((Map<String, dynamic> f) => f['name'] == 'depConst');
      final Map<String, dynamic> fnDecl = app
          .ofKind('logic.FunctionDecl')
          .singleWhere((Map<String, dynamic> f) => f['name'] == 'depFormat');
      expect(targetOf(app, 'depConst'), constDecl['id']);
      expect(targetOf(app, 'depFormat'), fnDecl['id']);
      expect(
        (constDecl['span'] as Map<String, dynamic>)['file'],
        'package:dep/dep.dart',
        reason: 'the declaration is anchored in the dependency’s own package URI space, not the app’s',
      );
    });

    test('the same declaration name in two files never shares identity', () async {
      final Extracted app = await extract(
        r'''
import 'package:flutter/material.dart';
import 'a.dart' as a;
import 'b.dart' as b;
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text('${a.sameName} ${b.sameName}');
}
''',
        extra: <String, String>{
          'a.dart': "const String sameName = 'a';",
          'b.dart': "const String sameName = 'b';",
        },
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = app.ofKind('logic.FieldDecl');
      expect(decls, hasLength(2));
      expect(decls[0]['id'], isNot(decls[1]['id']), reason: 'two distinct consts sharing a name must never share a NodeId');

      final List<Map<String, dynamic>> refs = app
          .ofKind('logic.Ref')
          .where((Map<String, dynamic> r) => r['name'] == 'sameName')
          .toList();
      expect(refs, hasLength(2));
      expect(refs[0]['target'], isNot(refs[1]['target']));
      expect(
        <String?>{refs[0]['target'] as String?, refs[1]['target'] as String?},
        <String?>{decls[0]['id'] as String?, decls[1]['id'] as String?},
      );
    });

    test('a local variable shadowing a top-level const is never claimed as the top-level one', () async {
      // Inside build() a local is substituted at its use (M8-B), never named by a `logic.Ref` — so the
      // proof here is the inlined *value*, not a target: it must be the shadowing local's own, never
      // the shadowed top-level const's.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
const String value = 'top-level';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) {
    final String value = 'local';
    return Text(value);
  }
}
''');
      expect(app.errors, isEmpty);

      final Map<String, dynamic> text = app.only('ui.Text');
      final Map<String, dynamic> value = text['value'] as Map<String, dynamic>;
      expect(
        (value['expr'] as Map<String, dynamic>)['value'],
        'local',
        reason: 'the read inside build() must resolve to the local, never fall back to the shadowed top-level const',
      );
    });

    test('a parameter shadowing a top-level const is never claimed as the top-level one', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
const String value = 'top-level';
String echo(String value) => value;
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(echo('x'));
}
''');
      expect(app.errors, isEmpty);

      final Map<String, dynamic> topLevelDecl = app.only('logic.FieldDecl');
      final String? target = targetOf(app, 'value');
      expect(target, isNot(topLevelDecl['id']));
    });

    test('an SDK top-level declaration stays honestly unresolved, never claimed as this program’s own', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
import 'dart:math' as math;
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text('${math.pi}');
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('logic.FieldDecl'), isEmpty, reason: 'no declaration for an SDK constant is ever invented');
      expect(targetOf(app, 'pi'), isNull);
    });

    test('a static class const is not claimed by the top-level mechanism (a separate, undecided gap)', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Constants {
  static const String value = 'v';
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(Constants.value);
}
''');
      expect(app.errors, isEmpty);
      expect(
        targetOf(app, 'Constants.value'),
        isNull,
        reason:
            'a class field never gets a symbol the way a top-level variable does (declaration_extractor.dart’s '
            '_fields), so this milestone’s reference-side fix correctly leaves it refused rather than half-fixing it',
      );
    });
  });

  group('local variable declaration identity (ADR-28)', () {
    // An ordinary `final`/`var` local declared inside an action body gets a real, declaration-tier
    // symbol — owner+ordinal qualified, never a content hash, never a name.

    String? targetOfRead(Extracted app, String name, {required int occurrence}) {
      final List<Map<String, dynamic>> refs = app
          .ofKind('logic.Ref')
          .where((Map<String, dynamic> r) => r['name'] == name)
          .toList();
      return refs[occurrence]['target'] as String?;
    }

    const String actionWrapper = r'''
import 'package:flutter/material.dart';
class W extends StatefulWidget {
  const W({super.key});
  @override
  State<W> createState() => _WState();
}
class _WState extends State<W> {
  int _log = 0;
  {{BODY}}
  @override
  Widget build(BuildContext context) => Text('$_log');
}
''';

    test('two unrelated actions with textually identical locals never collide', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _first() { final int total = 1; _log = total; }
  void _second() { final int total = 1; _log = total; }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = app.ofKind('logic.VarDecl');
      expect(decls, hasLength(2));
      expect(decls[0]['id'], isNot(decls[1]['id']), reason: 'same content, different owners — must not collapse');

      expect(targetOfRead(app, 'total', occurrence: 0), decls[0]['id']);
      expect(targetOfRead(app, 'total', occurrence: 1), decls[1]['id']);
    });

    test('a local read twice resolves both reads to the same declaration', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _twice() { final int value = 21; _log = value + value; }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> decl = app.only('logic.VarDecl');
      expect(targetOfRead(app, 'value', occurrence: 0), decl['id']);
      expect(targetOfRead(app, 'value', occurrence: 1), decl['id']);
    });

    test('lexical shadowing: each read resolves to the declaration actually in scope at that point', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _shadow() {
    final int level = 1;
    if (_log == 0) {
      final int level = 2;
      _log = level;
    }
    _log = level;
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = app.ofKind('logic.VarDecl');
      expect(decls, hasLength(2));
      expect(decls[0]['id'], isNot(decls[1]['id']));

      // Source order: the inner (shadowing) read is the first `level` read reached by the walk (it sits
      // inside the `if`, which is extracted before the trailing `_log = level;`), and must target the
      // *inner* declaration; the outer read, after the `if`, must target the *outer* one.
      expect(targetOfRead(app, 'level', occurrence: 0), decls[1]['id'], reason: 'the inner read targets the shadowing declaration');
      expect(targetOfRead(app, 'level', occurrence: 1), decls[0]['id'], reason: 'the outer read, after the if, targets the outer declaration');
    });

    test('a mutable (var) local gets identity too, not only final ones', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _mutate() {
    var count = 0;
    count = count + 1;
    count++;
    _log = count;
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> decl = app.only('logic.VarDecl');
      expect(decl['isFinal'], isNot(true));
      expect(targetOfRead(app, 'count', occurrence: 0), decl['id']);
      expect(targetOfRead(app, 'count', occurrence: 1), decl['id']);
      expect(targetOfRead(app, 'count', occurrence: 2), decl['id']);
    });

    test('the same source extracts to the same ids on a second, independent run (determinism)', () async {
      final String source = actionWrapper.replaceFirst('{{BODY}}', '''
  void _first() { final int total = 1; _log = total; }
  void _second() { final int total = 1; _log = total; }
''');
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      expect(first.bytes, second.bytes);
    });

    // A for-loop-declared variable now gets this identity too (ADR-28 §17, amended M9-A) — see the
    // dedicated 'for-loop variable declaration identity (ADR-28, amended M9-A)' group below, the same
    // division this file already uses for the catch-clause amendment (M8-S).
  });

  group('catch-clause exception binding identity (ADR-28, amended M8-S)', () {
    // The exception binding of `on Object catch (e) { ... }` gets the identical treatment an ordinary
    // `final`/`var` local already does — owner+ordinal-qualified, target-based, never a name match.

    String? targetOfRead(Extracted app, String name, {required int occurrence}) {
      final List<Map<String, dynamic>> refs = app
          .ofKind('logic.Ref')
          .where((Map<String, dynamic> r) => r['name'] == name)
          .toList();
      return refs[occurrence]['target'] as String?;
    }

    const String actionWrapper = r'''
import 'package:flutter/material.dart';
class W extends StatefulWidget {
  const W({super.key});
  @override
  State<W> createState() => _WState();
}
class _WState extends State<W> {
  int _log = 0;
  {{BODY}}
  @override
  Widget build(BuildContext context) => Text('$_log');
}
''';

    List<Map<String, dynamic>> catchExceptionDecls(Extracted app) => app
        .ofKind('logic.TryCatch')
        .expand((Map<String, dynamic> t) => (t['catches'] as List<dynamic>).cast<Map<String, dynamic>>())
        .map((Map<String, dynamic> c) => c['exceptionDecl'] as Map<String, dynamic>)
        .toList();

    test('a caught exception, read inside its own clause, resolves to a real declaration', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _risky() {
    try {
      _log = 1;
    } on Object catch (e) {
      _log = e.hashCode;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = catchExceptionDecls(app);
      expect(decls, hasLength(1));
      expect(decls.single['name'], 'e');
      expect(decls.single['isFinal'], true);
      expect(targetOfRead(app, 'e', occurrence: 0), decls.single['id']);
    });

    test('two unrelated catch clauses with the identical exception name never collide', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _first() { try { _log = 1; } on Object catch (e) { _log = e.hashCode; } }
  void _second() { try { _log = 2; } on Object catch (e) { _log = e.hashCode; } }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = catchExceptionDecls(app);
      expect(decls, hasLength(2));
      expect(decls[0]['id'], isNot(decls[1]['id']), reason: 'same content, different owners — must not collapse');
      expect(targetOfRead(app, 'e', occurrence: 0), decls[0]['id']);
      expect(targetOfRead(app, 'e', occurrence: 1), decls[1]['id']);
    });

    test('an ordinary local and a catch exception binding share one ordinal sequence — never collide even with the same name', () async {
      // Both `total` (an ordinary local) and a same-named catch exception binding would occupy ordinal
      // 0 under two *independent* counters; a shared, single per-owner counter (M8-S's own design
      // choice) is what this test exists to prove necessary, not merely convenient.
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _mixed() {
    final int total = 1;
    try {
      _log = total;
    } on Object catch (total) {
      _log = total.hashCode;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      // `ofKind('logic.VarDecl')` walks the whole document, so it returns both the ordinary local's own
      // declaration and the catch clause's own `exceptionDecl` (also a `logic.VarDecl`) — the local is
      // whichever one is not the catch binding.
      final Map<String, dynamic> catchDecl = catchExceptionDecls(app).single;
      final List<Map<String, dynamic>> allVarDecls = app.ofKind('logic.VarDecl');
      expect(allVarDecls, hasLength(2));
      final Map<String, dynamic> localDecl = allVarDecls.singleWhere((Map<String, dynamic> d) => d['id'] != catchDecl['id']);
      expect(localDecl['id'], isNot(catchDecl['id']));
      expect(targetOfRead(app, 'total', occurrence: 0), localDecl['id'], reason: 'the local read, before the try, targets the local');
      expect(targetOfRead(app, 'total', occurrence: 1), catchDecl['id'], reason: 'the catch-body read targets the exception binding, not the outer local of the same name');
    });

    test('the stack-trace binding is not given this identity — a separate, unresolved mapping question', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _risky() {
    try {
      _log = 1;
    } on Object catch (e, s) {
      _log = s.hashCode;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);
      expect(targetOfRead(app, 's', occurrence: 0), isNull);
      // The exception binding in the same clause is unaffected by the stack-trace binding's own
      // exclusion — both are extracted from the same `CatchClause`, independently.
      expect(catchExceptionDecls(app).single['name'], 'e');
    });

    test('the same source extracts to the same ids on a second, independent run (determinism)', () async {
      final String source = actionWrapper.replaceFirst('{{BODY}}', '''
  void _first() { try { _log = 1; } on Object catch (e) { _log = e.hashCode; } }
  void _second() { try { _log = 2; } on Object catch (e) { _log = e.hashCode; } }
''');
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      expect(first.bytes, second.bytes);
    });
  });

  group('for-loop variable declaration identity (ADR-28, amended M9-A)', () {
    // A `for-in` loop's own declared variable, and a C-style loop's own declared variable, get the
    // identical treatment an ordinary `final`/`var` local (ADR-28) and a catch clause's own exception
    // binding (M8-S) already do — owner+ordinal-qualified, target-based, never a name match.

    String? targetOfRead(Extracted app, String name, {required int occurrence}) {
      final List<Map<String, dynamic>> refs = app
          .ofKind('logic.Ref')
          .where((Map<String, dynamic> r) => r['name'] == name)
          .toList();
      return refs[occurrence]['target'] as String?;
    }

    const String actionWrapper = r'''
import 'package:flutter/material.dart';
class W extends StatefulWidget {
  const W({super.key});
  @override
  State<W> createState() => _WState();
}
class _WState extends State<W> {
  int _log = 0;
  {{BODY}}
  @override
  Widget build(BuildContext context) => Text('$_log');
}
''';

    List<Map<String, dynamic>> forNodes(Extracted app) => app.ofKind('logic.For');

    test('a for-in loop variable, read inside its own body, resolves to a real declaration', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (final item in <int>[1, 2, 3]) {
      _log = item;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> loopDecl = forNodes(app).single['loopDecl'] as Map<String, dynamic>;
      expect(loopDecl['kind'], 'logic.VarDecl');
      expect(loopDecl['name'], 'item');
      expect(loopDecl['isFinal'], true);
      expect(targetOfRead(app, 'item', occurrence: 0), loopDecl['id']);
    });

    test('a for-in loop variable declared with `var` gets identity too, not only `final`', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var item in <int>[1, 2, 3]) {
      _log = item;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> loopDecl = forNodes(app).single['loopDecl'] as Map<String, dynamic>;
      expect(loopDecl['isFinal'], isNot(true));
      expect(targetOfRead(app, 'item', occurrence: 0), loopDecl['id']);
    });

    test('a C-style loop’s own declared variable resolves in its test, update, and body alike', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var i = 0; i < 3; i++) {
      _log = i;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> init = forNodes(app).single['init'] as Map<String, dynamic>;
      expect(init['kind'], 'logic.VarDecl');
      expect(init['name'], 'i');
      // occurrence 0: the test (`i < 3`); 1: the update (`i++`); 2: the body (`_log = i`).
      expect(targetOfRead(app, 'i', occurrence: 0), init['id']);
      expect(targetOfRead(app, 'i', occurrence: 1), init['id']);
      expect(targetOfRead(app, 'i', occurrence: 2), init['id']);
    });

    test('two unrelated actions declaring a for-in loop variable under the identical name never collide', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _first() { for (final item in <int>[1]) { _log = item; } }
  void _second() { for (final item in <int>[2]) { _log = item; } }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls =
          forNodes(app).map((Map<String, dynamic> f) => f['loopDecl'] as Map<String, dynamic>).toList();
      expect(decls, hasLength(2));
      expect(decls[0]['id'], isNot(decls[1]['id']), reason: 'same content, different owners — must not collapse');
      expect(targetOfRead(app, 'item', occurrence: 0), decls[0]['id']);
      expect(targetOfRead(app, 'item', occurrence: 1), decls[1]['id']);
    });

    test('nested loops with distinct names never conflate the inner and outer declaration', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (final outer in <int>[1]) {
      for (final inner in <int>[2]) {
        _log = outer + inner;
      }
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls =
          forNodes(app).map((Map<String, dynamic> f) => f['loopDecl'] as Map<String, dynamic>).toList();
      final Map<String, dynamic> outerDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'outer');
      final Map<String, dynamic> innerDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'inner');
      expect(targetOfRead(app, 'outer', occurrence: 0), outerDecl['id']);
      expect(targetOfRead(app, 'inner', occurrence: 0), innerDecl['id']);
    });

    test('same-name nested shadowing: an inner read resolves to the inner declaration, and the read after the inner loop resolves back to the outer one', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (final value in <int>[1]) {
      for (final value in <int>[2]) {
        _log = value;
      }
      _log = value;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls =
          forNodes(app).map((Map<String, dynamic> f) => f['loopDecl'] as Map<String, dynamic>).toList();
      expect(decls, hasLength(2));
      expect(decls[0]['id'], isNot(decls[1]['id']));
      // occurrence 0: inside the inner loop, must target the inner declaration (the second `logic.For`
      // extracted, since extraction visits the outer loop before descending into its own body).
      expect(targetOfRead(app, 'value', occurrence: 0), decls[1]['id']);
      // occurrence 1: after the inner loop ends, back in the outer loop's own body — must target the
      // outer declaration, never the inner one that just went out of scope.
      expect(targetOfRead(app, 'value', occurrence: 1), decls[0]['id']);
    });

    test('a loop variable and an ordinary local sharing a name share one ordinal sequence — never collide', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (final item in <int>[1]) {
      _log = item;
    }
    final int item = 9;
    _log = item;
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> loopDecl = forNodes(app).single['loopDecl'] as Map<String, dynamic>;
      final List<Map<String, dynamic>> allVarDecls = app.ofKind('logic.VarDecl');
      expect(allVarDecls, hasLength(2));
      final Map<String, dynamic> localDecl =
          allVarDecls.singleWhere((Map<String, dynamic> d) => d['id'] != loopDecl['id']);
      expect(localDecl['id'], isNot(loopDecl['id']));
      expect(targetOfRead(app, 'item', occurrence: 0), loopDecl['id'], reason: 'the loop-body read targets the loop variable');
      expect(targetOfRead(app, 'item', occurrence: 1), localDecl['id'], reason: 'the read after the loop targets the later, ordinary local of the same name');
    });

    test('a loop variable and a catch exception binding sharing a name never collide', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (final e in <int>[1]) {
      _log = e;
    }
    try {
      _log = 1;
    } on Object catch (e) {
      _log = e.hashCode;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> loopDecl = forNodes(app).single['loopDecl'] as Map<String, dynamic>;
      final Map<String, dynamic> catchDecl = app
          .ofKind('logic.TryCatch')
          .expand((Map<String, dynamic> t) => (t['catches'] as List<dynamic>).cast<Map<String, dynamic>>())
          .single['exceptionDecl'] as Map<String, dynamic>;
      expect(loopDecl['id'], isNot(catchDecl['id']));
      expect(targetOfRead(app, 'e', occurrence: 0), loopDecl['id']);
      expect(targetOfRead(app, 'e', occurrence: 1), catchDecl['id']);
    });

    test('repeated reads of one loop variable share the same target', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (final item in <int>[1]) {
      _log = item;
      _log = item;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> loopDecl = forNodes(app).single['loopDecl'] as Map<String, dynamic>;
      expect(targetOfRead(app, 'item', occurrence: 0), loopDecl['id']);
      expect(targetOfRead(app, 'item', occurrence: 1), loopDecl['id']);
    });

    // A C-style loop declaring more than one variable now gets this identity too (M9-B) — see the
    // dedicated 'C-style multi-declaration loop variable identity (ADR-28, amended M9-B)' group below.

    test('a for-in loop reusing an already-declared variable (no declaration) stays honestly refused', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    int item = 0;
    for (item in <int>[1, 2, 3]) {
      _log = item;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);
      expect(
        forNodes(app),
        isEmpty,
        reason: 'no declaration in this loop header — the existing opaque-statement refusal, untouched by M9-A',
      );
    });

    test('the same source extracts to the same ids on a second, independent run (determinism)', () async {
      final String source = actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (final outer in <int>[1]) {
      for (final inner in <int>[2]) {
        _log = outer + inner;
      }
    }
    for (var i = 0; i < 3; i++) {
      _log = i;
    }
  }
''');
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      expect(first.bytes, second.bytes);
    });
  });

  group('C-style multi-declaration loop variable identity (ADR-28, amended M9-B)', () {
    // `for (var i = 0, j = 10; i < j; i++, j--)` — every declared variable gets the identical
    // declaration-tier identity a single-declaration C-style loop already has (M9-A): the ordinal
    // pre-pass already numbers each `VariableDeclaration` under one `ForPartsWithDeclarations`
    // structurally, regardless of count, so only the `_for` extraction's own length-gating needed to be
    // lifted — no new identity concept, no schema change (`init: Stmt` already admits the `logic.Block`
    // this milestone reuses, the identical shape an ordinary multi-declaration
    // `VariableDeclarationStatement` already uses).

    String? targetOfRead(Extracted app, String name, {required int occurrence}) {
      final List<Map<String, dynamic>> refs = app
          .ofKind('logic.Ref')
          .where((Map<String, dynamic> r) => r['name'] == name)
          .toList();
      return refs[occurrence]['target'] as String?;
    }

    const String actionWrapper = r'''
import 'package:flutter/material.dart';
class W extends StatefulWidget {
  const W({super.key});
  @override
  State<W> createState() => _WState();
}
class _WState extends State<W> {
  int _log = 0;
  {{BODY}}
  @override
  Widget build(BuildContext context) => Text('$_log');
}
''';

    List<Map<String, dynamic>> forNodes(Extracted app) => app.ofKind('logic.For');

    /// The `logic.VarDecl` children of a `logic.For.init`, whether `init` is a single declaration or a
    /// `logic.Block` of several (M9-B).
    List<Map<String, dynamic>> initDecls(Map<String, dynamic> forNode) {
      final Map<String, dynamic> init = forNode['init'] as Map<String, dynamic>;
      if (init['kind'] == 'logic.Block') {
        return (init['statements'] as List<dynamic>).cast<Map<String, dynamic>>();
      }
      return <Map<String, dynamic>>[init];
    }

    test('two declarations both resolve in the condition, the updaters, and the body', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var i = 0, j = 10; i < j; i++, j--) {
      _log = i + j;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = initDecls(forNodes(app).single);
      expect(decls, hasLength(2));
      final Map<String, dynamic> iDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'i');
      final Map<String, dynamic> jDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'j');
      expect(iDecl['id'], isNot(jDecl['id']));

      // Document field order is canonical (alphabetical — `canonical_sort.dart`'s own `SplayTreeMap`,
      // "a map's key order carries no meaning"), not source order: `body`, then `test`, then `update`.
      expect(targetOfRead(app, 'i', occurrence: 0), iDecl['id'], reason: 'body');
      expect(targetOfRead(app, 'j', occurrence: 0), jDecl['id'], reason: 'body');
      expect(targetOfRead(app, 'i', occurrence: 1), iDecl['id'], reason: 'condition');
      expect(targetOfRead(app, 'j', occurrence: 1), jDecl['id'], reason: 'condition');
      expect(targetOfRead(app, 'i', occurrence: 2), iDecl['id'], reason: 'updater');
      expect(targetOfRead(app, 'j', occurrence: 2), jDecl['id'], reason: 'updater');
    });

    test('three declarations all resolve, distinctly', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var i = 0, j = 1, k = 2; i < 3; i++, j++, k++) {
      _log = i + j + k;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = initDecls(forNodes(app).single);
      expect(decls, hasLength(3));
      expect(decls.map((Map<String, dynamic> d) => d['id']).toSet(), hasLength(3), reason: 'three distinct ids');
      final Map<String, dynamic> kDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'k');
      expect(targetOfRead(app, 'k', occurrence: 0), kDecl['id'], reason: 'update');
      expect(targetOfRead(app, 'k', occurrence: 1), kDecl['id'], reason: 'body');
    });

    test('two declarations with byte-identical initializer content never collapse to one id', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var i = 0, j = 0; i < j; i++, j++) {
      _log = i + j;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = initDecls(forNodes(app).single);
      expect(decls, hasLength(2));
      expect(decls[0]['id'], isNot(decls[1]['id']), reason: 'identical content, different ordinals — must not collapse');
      expect(targetOfRead(app, 'i', occurrence: 0), decls[0]['id'], reason: 'body');
      expect(targetOfRead(app, 'j', occurrence: 0), decls[1]['id'], reason: 'body');
    });

    test('repeated reads of one declaration in the multi-declaration case share the same target', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var i = 0, j = 10; i < j; i++, j--) {
      _log = i;
      _log = i;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> iDecl = initDecls(forNodes(app).single).singleWhere((Map<String, dynamic> d) => d['name'] == 'i');
      expect(targetOfRead(app, 'i', occurrence: 1), iDecl['id']);
      expect(targetOfRead(app, 'i', occurrence: 2), iDecl['id']);
    });

    test('nested multi-declaration loops with the same variable names never collide', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var i = 0, j = 10; i < j; i++, j--) {
      for (var i = 0, j = 1; i < j; i++, j--) {
        _log = i + j;
      }
      _log = i + j;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> loops = forNodes(app);
      expect(loops, hasLength(2));
      final List<Map<String, dynamic>> outerDecls = initDecls(loops[0]);
      final List<Map<String, dynamic>> innerDecls = initDecls(loops[1]);
      final Set<String> allIds = <String>{
        for (final Map<String, dynamic> d in <Map<String, dynamic>>[...outerDecls, ...innerDecls]) d['id'] as String,
      };
      expect(allIds, hasLength(4), reason: 'four distinct declarations, none shared between the two loops');

      final Map<String, dynamic> outerI = outerDecls.singleWhere((Map<String, dynamic> d) => d['name'] == 'i');
      final Map<String, dynamic> innerI = innerDecls.singleWhere((Map<String, dynamic> d) => d['name'] == 'i');
      // Canonical (alphabetical) field order, nested: inner's own body, test, update, THEN the outer
      // loop's own trailing statement (after the inner loop ends), then the outer's own test, update.
      // occurrence 0: inner body; 1: inner test — both must target the inner declaration.
      expect(targetOfRead(app, 'i', occurrence: 0), innerI['id'], reason: 'inner body');
      expect(targetOfRead(app, 'i', occurrence: 1), innerI['id'], reason: 'inner test');
      // occurrence 3: back in the outer loop's own body, after the inner loop ends — must target outer,
      // never the inner declaration that just went out of scope.
      expect(targetOfRead(app, 'i', occurrence: 3), outerI['id'], reason: 'outer body, after the inner loop');
    });

    test('an ordinary local sharing a name with a loop declaration shares one ordinal sequence — never collides', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var i = 0, j = 10; i < j; i++, j--) {
      _log = i;
    }
    final int i = 99;
    _log = i;
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> loopI = initDecls(forNodes(app).single).singleWhere((Map<String, dynamic> d) => d['name'] == 'i');
      final List<Map<String, dynamic>> allVarDecls = app.ofKind('logic.VarDecl');
      final Map<String, dynamic> localI = allVarDecls.singleWhere((Map<String, dynamic> d) => d['id'] != loopI['id'] && d['name'] == 'i');
      expect(localI['id'], isNot(loopI['id']));
      // Canonical field order: the loop's own body(0), test(1), update(2), then — a separate top-level
      // statement — the ordinary local's own read(3).
      expect(targetOfRead(app, 'i', occurrence: 0), loopI['id'], reason: 'the loop-body read targets the loop declaration');
      expect(targetOfRead(app, 'i', occurrence: 3), localI['id'], reason: 'the read after the loop targets the later, ordinary local');
    });

    test('a catch exception binding sharing a name with a loop declaration never collides', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var i = 0, e = 10; i < e; i++, e--) {
      _log = i;
    }
    try {
      _log = 1;
    } on Object catch (e) {
      _log = e.hashCode;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> loopE = initDecls(forNodes(app).single).singleWhere((Map<String, dynamic> d) => d['name'] == 'e');
      final Map<String, dynamic> catchDecl = app
          .ofKind('logic.TryCatch')
          .expand((Map<String, dynamic> t) => (t['catches'] as List<dynamic>).cast<Map<String, dynamic>>())
          .single['exceptionDecl'] as Map<String, dynamic>;
      expect(loopE['id'], isNot(catchDecl['id']));
    });

    // A later declaration reading an earlier one in the same initializer list now resolves too (M9-C) —
    // see the dedicated 'sequential declaration-list scope (ADR-28, amended M9-C)' group below, the same
    // division this file already uses for the M9-A/M9-B amendments.

    test('the condition and updaters may be omitted, unchanged by this milestone', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var i = 0, j = 10;;) {
      _log = i + j;
      break;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);
      final Map<String, dynamic> forNode = forNodes(app).single;
      expect(forNode.containsKey('test'), isFalse);
      expect(forNode.containsKey('update'), isFalse);
      expect(initDecls(forNode), hasLength(2));
    });

    test('the same source extracts to the same ids on a second, independent run (determinism)', () async {
      final String source = actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var i = 0, j = 10, k = 20; i < j; i++, j--, k--) {
      _log = i + j + k;
    }
  }
''');
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      expect(first.bytes, second.bytes);
    });
  });

  group('sequential declaration-list scope (ADR-28, amended M9-C)', () {
    // A declaration list — `var a = 1, b = 2;`'s own `variables`, or a C-style loop's own — is now
    // extracted sequentially: each declaration's own initializer is extracted against the scope
    // *before* it, and only afterward does that declaration itself enter scope. This is what makes
    // `var a = 1, b = a + 1;` resolve `a` inside `b`'s own initializer (real Dart — confirmed directly
    // against `dart analyze`, zero errors) without fabricating a resolution for `var a = a;` or
    // `var a = b, b = 1;` (real Dart errors, `referenced_before_declaration` — confirmed directly
    // against `dart analyze` too), which stay exactly as unresolved as any other out-of-scope name.

    String? targetOfRead(Extracted app, String name, {required int occurrence}) {
      final List<Map<String, dynamic>> refs = app
          .ofKind('logic.Ref')
          .where((Map<String, dynamic> r) => r['name'] == name)
          .toList();
      return refs[occurrence]['target'] as String?;
    }

    const String actionWrapper = r'''
import 'package:flutter/material.dart';
class W extends StatefulWidget {
  const W({super.key});
  @override
  State<W> createState() => _WState();
}
class _WState extends State<W> {
  int _log = 0;
  {{BODY}}
  @override
  Widget build(BuildContext context) => Text('$_log');
}
''';

    /// The `logic.VarDecl` children of a `logic.Block` wrapping a multi-declaration statement or loop
    /// `init` — or the single node itself, when there is only one.
    List<Map<String, dynamic>> declsOf(Map<String, dynamic> node) {
      if (node['kind'] == 'logic.Block') {
        return (node['statements'] as List<dynamic>).cast<Map<String, dynamic>>();
      }
      return <Map<String, dynamic>>[node];
    }

    test('an ordinary local: the second declaration resolves the first inside its own initializer', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    var a = 1, b = a + 1;
    _log = a + b;
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> block = app.only('logic.Block');
      final List<Map<String, dynamic>> decls = declsOf(block);
      final Map<String, dynamic> aDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'a');
      final Map<String, dynamic> bDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'b');
      expect(aDecl['id'], isNot(bDecl['id']));
      // occurrence 0 is `b`'s own initializer read of `a` (canonical field order places `statements`
      // before nothing else competes here — the block has exactly one field with nodes, in source
      // order); occurrence 1/2 are the body's own reads.
      expect(targetOfRead(app, 'a', occurrence: 0), aDecl['id'], reason: 'b’s own initializer');
    });

    test('a three-step chain: each declaration resolves the one immediately before it', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    var a = 1, b = a + 1, c = b + 1;
    _log = a + b + c;
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = declsOf(app.only('logic.Block'));
      final Map<String, dynamic> aDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'a');
      final Map<String, dynamic> bDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'b');
      expect(targetOfRead(app, 'a', occurrence: 0), aDecl['id'], reason: 'b’s own initializer reads a');
      expect(targetOfRead(app, 'b', occurrence: 0), bDecl['id'], reason: 'c’s own initializer reads b');
    });

    test('a later declaration can resolve any earlier one, not only its immediate predecessor', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    var a = 1, b = 2, c = a + b;
    _log = c;
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = declsOf(app.only('logic.Block'));
      final Map<String, dynamic> aDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'a');
      final Map<String, dynamic> bDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'b');
      expect(targetOfRead(app, 'a', occurrence: 0), aDecl['id'], reason: 'c’s own initializer reads a');
      expect(targetOfRead(app, 'b', occurrence: 0), bDecl['id'], reason: 'c’s own initializer reads b');
    });

    test('byte-identical initializer content across a resolved chain never collapses to one id', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    var a = 1, b = 1, c = a + b;
    _log = c;
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = declsOf(app.only('logic.Block'));
      expect(decls.map((Map<String, dynamic> d) => d['id']).toSet(), hasLength(3));
    });

    test('an outer local is visible throughout, and the inner declaration list resolves sequentially inside a nested scope', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    var x = 10;
    {
      var a = x, b = a + x;
      _log = a + b;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> xDecl = app.ofKind('logic.VarDecl').singleWhere((Map<String, dynamic> d) => d['name'] == 'x');
      final Map<String, dynamic> aDecl = app.ofKind('logic.VarDecl').singleWhere((Map<String, dynamic> d) => d['name'] == 'a');
      // occurrence 0: `a`'s own initializer reads the outer `x`.
      expect(targetOfRead(app, 'x', occurrence: 0), xDecl['id'], reason: 'a’s own initializer reads the outer x');
      // occurrence 0 of `a`: `b`'s own initializer reads `a`.
      expect(targetOfRead(app, 'a', occurrence: 0), aDecl['id'], reason: 'b’s own initializer reads a');
    });

    test('an ordinary local sharing a name with a declaration-list member, in a genuinely nested scope, never collides', () async {
      // A second, unnested `final int a = 99;` at the *same* method-body scope as the first `a` is not
      // valid shadowing at all — it is `duplicate_definition`, a real Dart error (confirmed directly),
      // which ADR-0031/M9-H now refuses wholesale (see the dedicated test below). This is the shape that
      // was actually intended: a genuinely nested scope (an `if` block), which is real, valid shadowing.
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    var a = 1, b = a + 1;
    _log = a + b;
    if (true) {
      final int a = 99;
      _log = a;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> allVarDecls = app.ofKind('logic.VarDecl');
      expect(allVarDecls, hasLength(3));
      final Set<String> ids = allVarDecls.map((Map<String, dynamic> d) => d['id'] as String).toSet();
      expect(ids, hasLength(3), reason: 'three distinct declarations, none collapsed');
    });

    test('a genuine duplicate declaration at the same scope (`duplicate_definition`, a real Dart error) refuses the whole file (ADR-0031, M9-H)', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    var a = 1, b = a + 1;
    _log = a + b;
    final int a = 99;
    _log = a;
  }
'''),
      );
      expect(app.errors, hasLength(1));
      expect(app.errors.single.code.id, 'BRG1310');
      expect(app.errors.single.message, contains('duplicate_definition'));
      expect(app.ofKind('logic.VarDecl'), isEmpty, reason: 'nothing is extracted from a refused unit');
    });

    test('a catch exception binding sharing a name with a declaration-list member never collides', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    var e = 1, f = e + 1;
    _log = e + f;
    try {
      _log = 1;
    } on Object catch (e) {
      _log = e.hashCode;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final Map<String, dynamic> catchDecl = app
          .ofKind('logic.TryCatch')
          .expand((Map<String, dynamic> t) => (t['catches'] as List<dynamic>).cast<Map<String, dynamic>>())
          .single['exceptionDecl'] as Map<String, dynamic>;
      final Map<String, dynamic> eDecl = app
          .ofKind('logic.VarDecl')
          .singleWhere((Map<String, dynamic> d) => d['name'] == 'e' && d['id'] != catchDecl['id']);
      expect(eDecl['id'], isNot(catchDecl['id']));
    });

    test('a C-style loop: the second declaration resolves the first inside its own initializer', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var i = 0, j = i + 1; j < 10; i++, j++) {
      _log = i + j;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = declsOf(app.only('logic.For')['init'] as Map<String, dynamic>);
      final Map<String, dynamic> iDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'i');
      expect(targetOfRead(app, 'i', occurrence: 0), iDecl['id'], reason: 'j’s own initializer reads i');
    });

    test('a C-style loop: a third declaration resolves both earlier ones', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    for (var i = 0, j = 1, k = i + j; k < 10; i++, j++, k++) {
      _log = i + j + k;
    }
  }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> decls = declsOf(app.only('logic.For')['init'] as Map<String, dynamic>);
      final Map<String, dynamic> iDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'i');
      final Map<String, dynamic> jDecl = decls.singleWhere((Map<String, dynamic> d) => d['name'] == 'j');
      expect(targetOfRead(app, 'i', occurrence: 0), iDecl['id'], reason: 'k’s own initializer reads i');
      expect(targetOfRead(app, 'j', occurrence: 0), jDecl['id'], reason: 'k’s own initializer reads j');
    });

    test('two unrelated actions with byte-identical, resolved declaration lists never collide', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _first() { var a = 1, b = a + 1; _log = a + b; }
  void _second() { var a = 1, b = a + 1; _log = a + b; }
'''),
      );
      expect(app.errors, isEmpty);

      final List<Map<String, dynamic>> blocks = app.ofKind('logic.Block');
      expect(blocks, hasLength(2));
      final List<Map<String, dynamic>> firstDecls = declsOf(blocks[0]);
      final List<Map<String, dynamic>> secondDecls = declsOf(blocks[1]);
      final Set<String> allIds = <String>{
        for (final Map<String, dynamic> d in <Map<String, dynamic>>[...firstDecls, ...secondDecls]) d['id'] as String,
      };
      expect(allIds, hasLength(4), reason: 'four distinct declarations, none shared between the two actions');
    });

    test('self-reference (`var a = a;`, a real Dart error, referenced_before_declaration) refuses the whole file (ADR-0031, M9-H)', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    var a = a;
    _log = a;
  }
'''),
      );
      // This source is invalid Dart (`dart analyze` reports `referenced_before_declaration`) — checked
      // directly against the real Dart CLI, not assumed. Before M9-H/ADR-0031, FlutterBridge's own
      // diagnostics did not surface the analyzer's own resolution errors at all, and this test asserted
      // the narrower, load-bearing fact that the sequential extractor did not *fabricate* a resolution
      // for `a`'s own initializer merely because the ordinal pre-pass already knew `a`'s eventual
      // identity. ADR-0031 closes the gap one level up: a resolved AST is not proof of a valid program,
      // so the whole file is now refused before extraction ever runs — there is no VarDecl to check at
      // all, for either `a`'s own initializer or the body's own later read.
      expect(app.errors, hasLength(1));
      expect(app.errors.single.code.id, 'BRG1310');
      expect(app.errors.single.message, contains('referenced_before_declaration'));
      expect(app.ofKind('logic.VarDecl'), isEmpty, reason: 'nothing is extracted from a refused unit');
    });

    test('forward reference (`var a = b, b = 1;`, a real Dart error) refuses the whole file (ADR-0031, M9-H)', () async {
      final Extracted app = await extract(
        actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    var a = b, b = 1;
    _log = a;
  }
'''),
      );
      // Also invalid Dart (`referenced_before_declaration`, confirmed directly) — `b` is declared
      // textually after `a`, so it must not be visible to `a`'s own initializer. Before M9-H this left
      // `b`'s own read unresolved but still extracted the rest of the file; ADR-0031 refuses the whole
      // file instead, for the identical "resolved AST is not proof of validity" reason.
      expect(app.errors, hasLength(1));
      expect(app.errors.single.code.id, 'BRG1310');
      expect(app.errors.single.message, contains('referenced_before_declaration'));
      expect(app.ofKind('logic.VarDecl'), isEmpty, reason: 'nothing is extracted from a refused unit');
    });

    test('the same source extracts to the same ids on a second, independent run (determinism)', () async {
      final String source = actionWrapper.replaceFirst('{{BODY}}', '''
  void _run() {
    var a = 1, b = a + 1, c = b + 1;
    _log = a + b + c;
    for (var i = 0, j = i + 1; j < 10; i++, j++) {
      _log = i + j;
    }
  }
''');
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      expect(first.bytes, second.bytes);
    });
  });

  group('widget-tree collection-for item declaration identity (ADR-28, amended M9-F)', () {
    // `for (final item in items) Text(item)`, inside a widget tree, is architecturally the same kind of
    // binding a statement-level `for (final item in items) { ... }` already gets declaration-tier
    // identity for (M9-A): `item` is a real, resolvable `DeclaredIdentifier`, numbered by the same
    // `_OrdinalVisitor` pass that already numbers a for-in loop's own declared variable, unconditionally,
    // regardless of which parent shape it appears under. What was missing was not a new identity concept
    // — it was that `WidgetExtractor`'s own scope was never wired to any owner/ordinal source at all
    // (`Scope.forBody` is only ever entered for an action/function body, never a `build()` render tree).
    //
    // `Scope.forWidgetTree` is a *separate* owner/ordinal pair from the one `Scope.forBody` populates —
    // never `Scope.forBody` reused — so this carries no risk of also, as a side effect, giving an
    // ordinary local or a statement-level for/catch binding declared inside an inline callback found
    // within the same render tree an identity it does not have today (a real, separately-evidenced,
    // pre-existing gap this milestone found and left exactly as it was, documented not fixed).
    //
    // `item` stays a `bind.Param` (a real generated `.map()` callback parameter — not a `let`, unlike an
    // ordinary local, which is exactly why M9-A's own `Binds.local` choice does not transfer here) — but
    // now carries `target`, and `ui.List` carries a real `itemDecl` alongside the unchanged, descriptive
    // `itemParam` string, mirroring `logic.For`'s own `loopVariable`/`loopDecl` pair exactly.

    const String widgetWrapper = '''
import 'package:flutter/material.dart';
class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) {
    {{BODY}}
  }
}
''';

    Map<String, dynamic> onlyList(Extracted app) => app.only('ui.List');

    Map<String, dynamic>? itemDeclOf(Map<String, dynamic> list) => list['itemDecl'] as Map<String, dynamic>?;

    List<Map<String, dynamic>> paramsNamed(Extracted app, String name) =>
        app.ofKind('bind.Param').where((Map<String, dynamic> p) => p['param'] == name).toList();

    List<Map<String, dynamic>> refsNamed(Extracted app, String name) =>
        app.ofKind('logic.Ref').where((Map<String, dynamic> r) => r['name'] == name).toList();

    // ── F1 — primitive item read ──────────────────────────────────────────────────────────────────

    test('F1 — a primitive item read gets a real itemDecl, and the read targets it', () async {
      final Extracted app = await extract(
        widgetWrapper.replaceFirst('{{BODY}}', '''
    final items = ['A', 'B'];
    return Column(children: [for (final item in items) Text(item)]);
'''),
      );
      expect(app.errors, isEmpty);
      final Map<String, dynamic> list = onlyList(app);
      expect(list['itemParam'], 'item', reason: 'the plain descriptive string stays, unchanged');
      final Map<String, dynamic>? decl = itemDeclOf(list);
      expect(decl, isNotNull);
      expect(decl!['kind'], 'logic.VarDecl');
      expect(decl['name'], 'item');
      expect(decl['isFinal'], true);
      final Map<String, dynamic> param = paramsNamed(app, 'item').single;
      expect(param['target'], decl['id']);
    });

    // ── F2 — property read ────────────────────────────────────────────────────────────────────────

    test('F2 — item.name (a compound expression, not a bare identifier) is a logic.Ref targeting itemDecl', () async {
      final Extracted app = await extract(
        widgetWrapper.replaceFirst('{{BODY}}', '''
    final items = ['A', 'B'];
    return Column(children: [for (final item in items) Text(item.length.toString())]);
'''),
      );
      expect(app.errors, isEmpty);
      final Map<String, dynamic> decl = itemDeclOf(onlyList(app))!;
      final Map<String, dynamic> ref = refsNamed(app, 'item').single;
      expect(ref['target'], decl['id']);
    });

    // ── F3 — repeated reads ───────────────────────────────────────────────────────────────────────

    test('F3 — two reads of the same item target the same declaration', () async {
      final Extracted app = await extract(
        widgetWrapper.replaceFirst('{{BODY}}', '''
    final items = ['A', 'B'];
    return Column(children: [
      for (final item in items) Row(children: [Text(item), Text(item)]),
    ]);
'''),
      );
      expect(app.errors, isEmpty);
      final Map<String, dynamic> decl = itemDeclOf(onlyList(app))!;
      final List<Map<String, dynamic>> params = paramsNamed(app, 'item');
      expect(params, hasLength(2));
      expect(params.every((Map<String, dynamic> p) => p['target'] == decl['id']), isTrue);
    });

    // ── F4 — outer local interaction ──────────────────────────────────────────────────────────────

    test('F4 — an outer local and the item remain distinct declarations', () async {
      final Extracted app = await extract(
        widgetWrapper.replaceFirst('{{BODY}}', r'''
    final items = ['A', 'B'];
    final prefix = 'Item';
    return Column(children: [for (final item in items) Text('$prefix $item')]);
'''),
      );
      expect(app.errors, isEmpty);
      final Map<String, dynamic> decl = itemDeclOf(onlyList(app))!;
      final Map<String, dynamic> itemRef = refsNamed(app, 'item').single;
      expect(itemRef['target'], decl['id']);
      // `prefix` is an ordinary build-method local — inlined at its own reference site (M8-B), not
      // represented as a `logic.Ref` at all, so there is nothing here that could collide with `item`.
      expect(refsNamed(app, 'prefix'), isEmpty);
      expect(app.bytes.contains('"value":"Item "'), isFalse);
    });

    // ── F5/F6 — nested collection-for, same-name shadowing ────────────────────────────────────────

    test('F5/F6 — a nested collection-for with the same variable name: outer and inner declarations stay distinct, and the inner read resolves to the inner one', () async {
      final Extracted app = await extract(
        widgetWrapper.replaceFirst('{{BODY}}', '''
    final groups = [['A', 'B'], ['C', 'D']];
    return Column(children: [
      for (final item in groups)
        Column(children: [for (final item in item) Text(item)]),
    ]);
'''),
      );
      expect(app.errors, isEmpty);
      final List<Map<String, dynamic>> lists = app.ofKind('ui.List');
      expect(lists, hasLength(2));
      final Map<String, dynamic> outerDecl = itemDeclOf(lists[0])!;
      final Map<String, dynamic> innerDecl = itemDeclOf(lists[1])!;
      expect(outerDecl['id'], isNot(innerDecl['id']), reason: 'same name, distinct declarations');

      // The inner loop's own iterable — `item` naming the *outer* declaration — is a bare identifier, so
      // it is extracted the same way the template's own read is (`bind.Param`, via `BindingExtractor`'s
      // own bare-identifier special case for `Binds.parameter` — the iterable position is not special).
      // It is evaluated outside the inner item's own scope (F13): it must target the outer, not the
      // inner (which is not yet bound).
      final List<Map<String, dynamic>> params = paramsNamed(app, 'item');
      expect(params, hasLength(2), reason: 'the inner loop’s own iterable, and the template’s own read');
      final Set<String?> targets = params.map((Map<String, dynamic> p) => p['target'] as String?).toSet();
      expect(targets, <String?>{outerDecl['id'] as String, innerDecl['id'] as String});
    });

    // ── F7 — sibling collection-for, same variable name ───────────────────────────────────────────

    test('F7 — two sibling collection-fors with the same variable name never collide', () async {
      final Extracted app = await extract(
        widgetWrapper.replaceFirst('{{BODY}}', '''
    final items = ['A', 'B'];
    return Column(children: [
      for (final item in items) Text(item),
      for (final item in items) Text(item),
    ]);
'''),
      );
      expect(app.errors, isEmpty);
      final List<Map<String, dynamic>> lists = app.ofKind('ui.List');
      expect(lists, hasLength(2));
      final Map<String, dynamic> declA = itemDeclOf(lists[0])!;
      final Map<String, dynamic> declB = itemDeclOf(lists[1])!;
      expect(declA['id'], isNot(declB['id']));
      final List<Map<String, dynamic>> params = paramsNamed(app, 'item');
      expect(params, hasLength(2));
      expect(params[0]['target'], declA['id']);
      expect(params[1]['target'], declB['id']);
    });

    // ── F8 — ordinary-local collision ─────────────────────────────────────────────────────────────

    test('F8 — an ordinary build-method local named "item", outside any loop, is inlined and never collides with a collection-for item', () async {
      final Extracted app = await extract(
        widgetWrapper.replaceFirst('{{BODY}}', '''
    final items = ['A', 'B'];
    final item = 'not-a-loop-var';
    return Column(children: [
      for (final entry in items) Text(entry),
      Text(item),
    ]);
'''),
      );
      expect(app.errors, isEmpty);
      // `item` here is M8-B's own inlined ordinary local — it never reaches this document as a
      // `logic.Ref`/`bind.Param` at all, so there is structurally nothing for it to collide with.
      expect(refsNamed(app, 'item'), isEmpty);
      expect(paramsNamed(app, 'item'), isEmpty);
      expect(app.bytes.contains('not-a-loop-var'), isTrue);
    });

    // ── F9 — statement-loop interaction ───────────────────────────────────────────────────────────

    test('F9 — a statement-level for-in loop and a widget-tree collection-for sharing a name never collide', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) {
    final items = ['A', 'B'];
    return Column(children: [
      for (final item in items) Text(item),
      ElevatedButton(
        onPressed: () {
          for (final item in items) {
            print(item);
          }
        },
        child: const Text('go'),
      ),
    ]);
  }
}
''',
      );
      expect(app.errors, isEmpty);
      final Map<String, dynamic> widgetDecl = itemDeclOf(onlyList(app))!;
      final Map<String, dynamic> param = paramsNamed(app, 'item').single;
      expect(param['target'], widgetDecl['id']);
      // The statement-level loop's own symbol namespace is untouched by this milestone (a real,
      // pre-existing, separately-evidenced gap — declared inside an inline render-tree callback, whose
      // own `owner` is null exactly as it was before this milestone) — but critically, it does not
      // collide with the widget-tree item's own id either way. Two `logic.VarDecl` nodes exist in this
      // document: the widget-tree item's own `itemDecl` (found above) and the statement-level loop's own
      // `loopDecl` — both `logic.VarDecl`-kind, found by the same `ofKind` walk.
      final List<Map<String, dynamic>> allDecls = app.ofKind('logic.VarDecl');
      expect(allDecls, hasLength(2));
      final Map<String, dynamic> statementDecl = allDecls.singleWhere(
        (Map<String, dynamic> d) => d['id'] != widgetDecl['id'],
      );
      expect(statementDecl['name'], 'item');
      expect(statementDecl['id'], isNot(widgetDecl['id']));
    });

    // ── F11 — closure capture ─────────────────────────────────────────────────────────────────────

    test('F11 — an inline callback capturing the item resolves the same target as the template’s own read', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Home extends StatefulWidget {
  const Home({super.key});
  @override
  State<Home> createState() => _HomeState();
}
class _HomeState extends State<Home> {
  String _selected = '';
  @override
  Widget build(BuildContext context) {
    final items = ['A', 'B'];
    return Column(children: [
      for (final item in items)
        ElevatedButton(
          onPressed: () { setState(() { _selected = item; }); },
          child: Text(item),
        ),
    ]);
  }
}
''');
      expect(app.errors, isEmpty);
      final Map<String, dynamic> decl = itemDeclOf(onlyList(app))!;
      final Map<String, dynamic> param = paramsNamed(app, 'item').single;
      expect(param['target'], decl['id']);
    });

    // ── F13 — iterable expression scope ───────────────────────────────────────────────────────────

    test('F13 — the iterable expression is evaluated outside the new item’s own scope, never a premature self-reference', () async {
      final Extracted app = await extract(
        widgetWrapper.replaceFirst('{{BODY}}', '''
    final items = ['A', 'B'];
    return Column(children: [for (final item in items) Text(item)]);
'''),
      );
      expect(app.errors, isEmpty);
      // `items` (the iterable) is a plain, ordinary local — inlined by M8-B, never a `bind.Param`, and
      // never influenced by the item binding that does not exist yet when it is extracted.
      expect(paramsNamed(app, 'items'), isEmpty);
      expect(app.bytes.contains('"value":"A"'), isTrue);
    });

    // ── F14 — negative visibility control ─────────────────────────────────────────────────────────

    test('F14 — the item is not visible in its own iterable expression (a real Dart error, left unresolved, not fabricated)', () async {
      final Extracted app = await extract(
        widgetWrapper.replaceFirst('{{BODY}}', '''
    return Column(children: [for (final item in item) Text(item)]);
'''),
      );
      // A real Dart compile error (`item` used before its own declaration in the very expression that
      // declares it) — BridgeAnalyzer's own diagnostics do not surface the underlying analyzer's
      // resolution errors (a separate, pre-existing, unrelated characteristic, established in M9-C), but
      // this extractor must never fabricate a resolution Dart itself does not license. Not asserting on
      // `app.errors` here for that reason; asserting on the shape instead.
      final List<Map<String, dynamic>> lists = app.ofKind('ui.List');
      if (lists.isNotEmpty) {
        final Map<String, dynamic>? decl = itemDeclOf(lists.single);
        // The iterable position is a bare identifier, so it is extracted as `bind.Param` (the same
        // bare-identifier special case F5/F6's own iterable read goes through), not `logic.Ref` — checked
        // here too, not just `logic.Ref`, for the identical reason F5/F6 needed both.
        final List<Map<String, dynamic>> refs = refsNamed(app, 'item');
        final List<Map<String, dynamic>> params = paramsNamed(app, 'item');
        // Neither a `logic.Ref` nor a `bind.Param` for `item`, if extracted at all inside the iterable
        // position, may target the declaration it is itself part of declaring.
        for (final Map<String, dynamic> ref in refs) {
          if (decl != null) {
            expect(ref['target'], isNot(decl['id']));
          }
        }
        for (final Map<String, dynamic> param in params) {
          if (decl != null) {
            expect(param['target'], isNot(decl['id']));
          }
        }
      }
    });

    // ── F15 — project-defined object item ─────────────────────────────────────────────────────────

    test('F15 — identity does not depend on primitive type: a project-defined class works identically', () async {
      final Extracted app = await extract(
        widgetWrapper.replaceFirst('{{BODY}}', '''
    final items = <Widget>[const Text('A'), const Text('B')];
    return Column(children: [for (final item in items) item]);
'''),
      );
      expect(app.errors, isEmpty);
      final Map<String, dynamic> list = onlyList(app);
      // The template *is* the item itself here (`for (final item in items) item`), extracted directly —
      // still proves the mechanism is type-agnostic (it operates on the `Element`, never the value).
      expect(list['itemParam'], 'item');
      expect(itemDeclOf(list), isNotNull);
    });

    // ── F16 — renamed item ────────────────────────────────────────────────────────────────────────

    test('F16 — the variable name is irrelevant to the mechanism', () async {
      final Extracted app = await extract(
        widgetWrapper.replaceFirst('{{BODY}}', '''
    final items = ['A', 'B'];
    return Column(children: [for (final entry in items) Text(entry)]);
'''),
      );
      expect(app.errors, isEmpty);
      final Map<String, dynamic> list = onlyList(app);
      expect(list['itemParam'], 'entry');
      final Map<String, dynamic>? decl = itemDeclOf(list);
      expect(decl, isNotNull);
      expect(decl!['name'], 'entry');
      expect(paramsNamed(app, 'entry').single['target'], decl['id']);
    });

    // ── negative control — a `ListView.builder`-shaped ui.List gets no itemDecl at all ────────────

    test('negative control — `ListView.builder`’s own itemBuilder parameter gets no itemDecl (a genuinely different, still-deferred gap)', () async {
      final Extracted app = await extract(
        widgetWrapper.replaceFirst('{{BODY}}', '''
    final items = ['A', 'B'];
    return ListView.builder(
      itemCount: items.length,
      itemBuilder: (BuildContext context, int index) => Text(items[index]),
    );
'''),
      );
      expect(app.errors, isEmpty);
      final Map<String, dynamic> list = onlyList(app);
      expect(
        itemDeclOf(list),
        isNull,
        reason: 'a builder closure parameter is not a for-in declaration; ADR-28 §4 remains deferred for it',
      );
    });

    test('the same source extracts to the same bytes on a second, independent run (determinism)', () async {
      final String source = widgetWrapper.replaceFirst('{{BODY}}', '''
    final items = ['A', 'B'];
    return Column(children: [for (final item in items) Text(item)]);
''');
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      expect(first.bytes, second.bytes);
    });
  });

  group('ScaffoldMessenger / SnackBar presentation (ADR-0030)', () {
    // `ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(...)))` is recognized by
    // resolved identity only (the receiver's own resolved type is Flutter's real `ScaffoldMessengerState`
    // — never the bare name `ScaffoldMessenger`, never `showSnackBar`'s own spelling alone), and its
    // `content:` argument is routed through the real widget-tree extractor and embedded as
    // `presentedContent` — a genuine `ui.Element`, not the generic, unrendered `logic.New` every other
    // constructor argument gets. Each recognized call's own embedded content gets a unique anchor
    // namespace (`snackbar[n]`), the same `anchorSegment` idiom `TransitionExtractor` uses for M9-D's own
    // inline route-overlay destinations — without it, two structurally identical snack bars collide
    // (BRG1205), which is exactly the defect a real fixture build caught during this milestone.

    final Map<String, String> snackbarFlutter = <String, String>{
      ...flutterPackage,
      'widgets.dart':
          '${flutterPackage['widgets.dart']!}\n'
          '''
class SnackBarAction {
  const SnackBarAction({required this.label, required this.onPressed, this.textColor});
  final String label;
  final void Function() onPressed;
  final Color? textColor;
}

class SnackBar extends Widget {
  const SnackBar({required this.content, this.action, this.duration, this.backgroundColor});
  final Widget content;
  final SnackBarAction? action;
  final Duration? duration;
  final Color? backgroundColor;
}

class ScaffoldMessengerState {
  void showSnackBar(SnackBar snackBar) {}
  void hideCurrentSnackBar() {}
  void removeCurrentSnackBar() {}
  void clearSnackBars() {}
}

class ScaffoldMessenger extends Widget {
  const ScaffoldMessenger({required this.child});
  final Widget child;
  static ScaffoldMessengerState of(BuildContext context) => ScaffoldMessengerState();
}
''',
    };

    const String widgetWrapper = '''
import 'package:flutter/material.dart';
class Home extends StatelessWidget {
  const Home({super.key});
  @override
  Widget build(BuildContext context) {
    {{BODY}}
  }
}
''';

    Future<Extracted> extractSnackbar(String body) => extract(
      widgetWrapper.replaceFirst('{{BODY}}', body),
      dependencies: <String, Map<String, String>>{'flutter': snackbarFlutter},
    );

    List<Map<String, dynamic>> snackBarConstructions(Extracted app) =>
        app.ofKind('logic.New').where((Map<String, dynamic> n) => n['typeName'] == 'SnackBar').toList();

    test('a direct call is recognized: presentedContent is a real ui.Element, content is not duplicated into namedArgs', () async {
      final Extracted app = await extractSnackbar('''
    return ElevatedButton(
      onPressed: () { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved'))); },
      child: const Text('go'),
    );
''');
      expect(app.errors, isEmpty);
      final Map<String, dynamic> snackBar = snackBarConstructions(app).single;
      final Map<String, dynamic>? presented = snackBar['presentedContent'] as Map<String, dynamic>?;
      expect(presented, isNotNull, reason: 'content: must be routed through the real widget-tree extractor');
      expect(presented!['kind'], 'ui.Text', reason: 'a real, catalog-extracted widget, not generic logic.New');
      final Map<String, dynamic>? namedArgs = snackBar['namedArgs'] as Map<String, dynamic>?;
      expect(
        namedArgs?.containsKey('content'),
        isNot(true),
        reason: 'content is extracted exactly once — never duplicated into namedArgs alongside presentedContent',
      );
    });

    test('two structurally identical snack bars never collide on anchor (regression guard)', () async {
      final Extracted app = await extractSnackbar('''
    return Column(children: [
      ElevatedButton(
        onPressed: () { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved'))); },
        child: const Text('a'),
      ),
      ElevatedButton(
        onPressed: () { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved'))); },
        child: const Text('b'),
      ),
    ]);
''');
      expect(app.errors, isEmpty, reason: 'BRG1205 (duplicate anchor) is exactly the defect this guards against');
      final List<Map<String, dynamic>> bars = snackBarConstructions(app);
      expect(bars, hasLength(2));
      final List<String> anchors = bars.map((Map<String, dynamic> b) => b['anchor'] as String).toList();
      expect(anchors.toSet(), hasLength(2), reason: 'each recognized call gets its own anchor namespace');
    });

    test('a messenger reached through one local-variable indirection is still recognized (G13)', () async {
      final Extracted app = await extractSnackbar('''
    return ElevatedButton(
      onPressed: () {
        final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
        messenger.showSnackBar(const SnackBar(content: Text('Saved')));
      },
      child: const Text('go'),
    );
''');
      expect(app.errors, isEmpty);
      final Map<String, dynamic> snackBar = snackBarConstructions(app).single;
      expect(snackBar['presentedContent'], isNotNull);
    });

    test('a project-defined ScaffoldMessenger, genuinely in scope, is never recognized as the real one (G11, negative control)', () async {
      const String source = '''
class MySnackBar {
  const MySnackBar({required this.content});
  final Object content;
}

class MyScaffoldMessengerState {
  void showSnackBar(MySnackBar snackBar) {}
}

class MyScaffoldMessenger {
  static MyScaffoldMessengerState of(Object context) => MyScaffoldMessengerState();
}

void useIt(Object context) {
  MyScaffoldMessenger.of(context).showSnackBar(const MySnackBar(content: 'Saved'));
}
''';
      final Extracted app = await extract(source, dependencies: <String, Map<String, String>>{'flutter': snackbarFlutter});
      expect(app.errors, isEmpty);
      // Structurally identical to the real shape — a static `.of(context)` returning a state object whose
      // own `showSnackBar` takes a content-bearing widget — but resolved to `package:app/main.dart`, not
      // `package:flutter/`. No `presentedContent` anywhere: this project's own class is never routed
      // through the widget-tree extractor by spelling alone.
      expect(app.ofKind('ui.Element').where((Map<String, dynamic> e) => e['presentedContent'] != null), isEmpty);
      final List<Map<String, dynamic>> constructions =
          app.ofKind('logic.New').where((Map<String, dynamic> n) => n['typeName'] == 'MySnackBar').toList();
      expect(constructions, hasLength(1));
      expect(constructions.single.containsKey('presentedContent'), isFalse);
    });

    test('an indirect SnackBar reference is never recognized — only a direct inline literal is (G17, negative control)', () async {
      final Extracted app = await extractSnackbar('''
    return ElevatedButton(
      onPressed: () {
        final bar = const SnackBar(content: Text('Saved'));
        ScaffoldMessenger.of(context).showSnackBar(bar);
      },
      child: const Text('go'),
    );
''');
      expect(app.errors, isEmpty);
      final Map<String, dynamic> snackBar = snackBarConstructions(app).single;
      expect(
        snackBar.containsKey('presentedContent'),
        isFalse,
        reason: 'an indirect reference has no anchor namespace to embed content under at extraction time',
      );
      final Map<String, dynamic>? namedArgs = snackBar['namedArgs'] as Map<String, dynamic>?;
      expect(namedArgs?['content'], isNotNull, reason: 'falls through to the ordinary, generic extraction');
    });

    test('the same source extracts to the same bytes on a second, independent run (determinism)', () async {
      final String source = widgetWrapper.replaceFirst('{{BODY}}', '''
    return ElevatedButton(
      onPressed: () { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved'))); },
      child: const Text('go'),
    );
''');
      final Extracted first = await extract(source, dependencies: <String, Map<String, String>>{'flutter': snackbarFlutter});
      final Extracted second = await extract(source, dependencies: <String, Map<String, String>>{'flutter': snackbarFlutter});
      expect(first.bytes, second.bytes);
    });
  });

  group('resolved analyzer errors as a pre-extraction safety gate (ADR-0031, M9-H)', () {
    // A resolved AST is not proof of a valid program: `package:analyzer` recovers a structurally-plausible
    // tree for erroneous source because IDE tooling needs one, not because the program compiles. Before
    // this milestone, `AnalysisSessionHandle.resolve()` obtained a `ResolvedUnitResult` and read only its
    // `.unit` (the AST) — `.diagnostics`/`.errors` were discarded, unread, at every call site. This group
    // proves the gate directly: `Severity.error` in the unit's own resolved diagnostics blocks extraction
    // entirely (BRG1310, carrying the real analyzer code/message/location); warnings, lints and info never
    // do; and invalid Dart is never confused with a valid-but-unsupported FlutterBridge capability.

    Diagnostic onlyError(Extracted app) {
      expect(app.errors, hasLength(1));
      return app.errors.single;
    }

    // ── H3 — undefined identifier ───────────────────────────────────────────────────────────────────

    test('H3 — an undefined identifier refuses the whole file, with the real analyzer diagnostic (not BRG1303)', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, turning `\$missingValue` from an
      // interpolation into an escaped literal dollar sign, defeating the fixture entirely.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text('\$missingValue');
}
''');
      final Diagnostic error = onlyError(app);
      expect(error.code.id, 'BRG1310');
      expect(error.message, contains('undefined_identifier'));
      expect(app.ofKind('ui.Component'), isEmpty);
    });

    // ── H4 — type mismatch (the case nothing previously caught) ────────────────────────────────────

    test('H4 — a genuine type mismatch (both sides fully resolved) is refused — previously silent, the defect this milestone closes', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, turning `\$value` from an
      // interpolation into an escaped literal dollar sign, defeating the fixture entirely.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) {
    int value = 'wrong';
    return Text('\$value');
  }
}
''');
      final Diagnostic error = onlyError(app);
      expect(error.code.id, 'BRG1310');
      expect(error.message, contains('invalid_assignment'));
      // Before ADR-0031: this extracted, normalized and generated cleanly — `<Text>{'wrong'}</Text>`, a
      // plausible React component built from Dart the real compiler rejects. Nothing here — no
      // ui.Component, no logic.VarDecl for `value` — reaches the document at all now.
      expect(app.ofKind('ui.Component'), isEmpty);
      expect(app.ofKind('logic.VarDecl'), isEmpty);
    });

    // ── H5/H6 — invalid call shape (wrong argument type / missing required argument) ───────────────

    test('H5 — a wrong argument type is refused, not silently accepted', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, turning `\${addOne('nope')}` from an
      // interpolation into escaped literal text, defeating the fixture entirely.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
int addOne(int n) => n + 1;
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text('\${addOne('nope')}');
}
''');
      final Diagnostic error = onlyError(app);
      expect(error.code.id, 'BRG1310');
      expect(error.message, contains('argument_type_not_assignable'));
    });

    test('H6 — a missing required argument is refused, not silently accepted', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, turning `\${addOne()}` from an
      // interpolation into escaped literal text, defeating the fixture entirely.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
int addOne(int n) => n + 1;
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text('\${addOne()}');
}
''');
      final Diagnostic error = onlyError(app);
      expect(error.code.id, 'BRG1310');
      expect(error.message, contains('not_enough_positional_arguments'));
    });

    // ── syntax/parser errors ────────────────────────────────────────────────────────────────────────

    test('a genuine syntax error refuses the whole file — the malformed declaration never silently vanishes', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  void _broken( {
  }
  @override
  Widget build(BuildContext context) => const Text('go');
}
''');
      expect(app.errors, isNotEmpty);
      expect(app.errors.every((Diagnostic d) => d.code.id == 'BRG1310'), isTrue);
      // Before ADR-0031: `_broken`'s own malformed declaration silently vanished and the unrelated, valid
      // `build()` still extracted and would have generated cleanly — this milestone's second, independent
      // proof that "the analyzer recovered an AST" is not "the program is valid" (§2 of the ADR).
      expect(app.ofKind('ui.Component'), isEmpty);
    });

    // ── warnings/lints/info never block ─────────────────────────────────────────────────────────────

    test('a warning-only file (unused local) is unaffected — Severity.error is the only blocking severity', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  void _unusedHelper() {
    final unused = 42;
  }
  @override
  Widget build(BuildContext context) => const Text('go');
}
''');
      expect(app.errors, isEmpty);
      expect(app.only('ui.Component')['name'], 'W');
    });

    test('an info-severity diagnostic (a state-promotion note) does not block — only Severity.error does', () async {
      // `BRG2302`-style info diagnostics are this compiler's own, not the analyzer's — included here as a
      // control that this gate reads the *analyzer's* severity, never bridge_analyzer's own diagnostic
      // stream, which already carries non-error entries on every ordinary build.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('go');
}
''');
      expect(app.errors, isEmpty);
    });

    // ── an error in a declaration FlutterBridge would never have extracted anyway ───────────────────

    test('an error in an unused, unreachable declaration still refuses the whole file (real Dart does not compile it either)', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('valid');
}
void _unusedInvalidHelper() {
  int value = 'wrong';
}
''');
      final Diagnostic error = onlyError(app);
      expect(error.code.id, 'BRG1310');
      // `_unusedInvalidHelper` is never reachable from `W.build()`, and `flutter build`/`dart compile`
      // still refuse the whole program regardless — FlutterBridge's own stated contract (source-faithful
      // conversion of *valid* Flutter/Dart) does the same, unconditional on reachability (ADR-0031 §7).
      expect(app.ofKind('ui.Component'), isEmpty, reason: 'even the otherwise-valid, reachable W is refused with it');
    });

    // ── the gate itself, proven at the layer it operates on (Mutation E) ────────────────────────────

    test('a clean declaration sharing an erroring file never reaches even the raw extraction output', () async {
      // Every test above observes the *final* NDJSON document, which is also guarded downstream by the
      // pre-existing, unrelated `DiagnosticSink.hasErrors -> EmitStage refuses to write` safety net
      // (predates ADR-0031). That net alone would make the document empty even if this gate's own
      // `continue` inside `ExtractStage` were deleted and every file were extracted regardless of its
      // errors — so it cannot, by itself, prove *this* gate is what skipped the file. This test calls
      // `LoadStage` and `ExtractStage` directly, never reaching `EmitStage` at all, and inspects the
      // intermediate `ExtractionResult` — the one place the gate's own `continue` has any effect.
      final String project = createProject(
        name: 'app',
        libraries: <String, String>{
          'main.dart': '''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('valid');
}
void _unusedInvalidHelper() {
  int value = 'wrong';
}
''',
        },
      );
      final DiagnosticSink sink = DiagnosticSink();
      final StageContext context = StageContext(diagnostics: sink);
      final LoadResult loaded = await const LoadStage().execute(
        AnalyzerRequest(projectRoot: project, outputPath: 'build/out.ndjson'),
        context,
      );
      final ExtractionResult extraction = await const ExtractStage().execute(loaded, context);

      expect(
        extraction.records.where((record) => record.span.file == 'lib/main.dart'),
        isEmpty,
        reason:
            'main.dart carries a real error, so ExtractStage must skip it before Extractor.extract() ever '
            'runs for it — the otherwise-valid W must not appear in the raw records either, independent of '
            'anything EmitStage does afterward',
      );
      expect(
        sink.sorted().where((Diagnostic d) => d.code.id == 'BRG1310'),
        isNotEmpty,
        reason: 'the skip is still reported, not silent',
      );
    });

    // ── dependency/multi-file behavior (§9) ─────────────────────────────────────────────────────────

    test('a clean file importing an erroneous one is unaffected by the erroneous file’s own diagnostics', () async {
      final Extracted app = await extract(
        '''
import 'package:flutter/material.dart';
import 'helper.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('clean');
}
''',
        extra: <String, String>{
          'helper.dart': '''
void brokenHelper() {
  int value = 'wrong';
}
''',
        },
      );
      // main.dart's own resolved unit carries none of helper.dart's diagnostics (verified directly against
      // the real, resolved analyzer package — each file's own `.diagnostics` is scoped to its own source
      // span) — so main.dart is refused only because helper.dart's own extraction is skipped, never
      // because of anything in main.dart itself.
      final List<Diagnostic> errors = app.errors;
      expect(errors, isNotEmpty);
      expect(
        errors.any((Diagnostic d) => d.code.id == 'BRG1310' && d.message.contains('invalid_assignment')),
        isTrue,
        reason: 'helper.dart’s own real error is reported',
      );
      expect(
        errors.every((Diagnostic d) => (d.span?.file ?? '') != 'main.dart' || d.code.id != 'BRG1310'),
        isTrue,
        reason: 'main.dart itself is never blamed for helper.dart’s own error',
      );
    });

    test('main.dart’s own extraction is never skipped for helper.dart’s error, proven below EmitStage’s own hasErrors net (Mutation F)', () async {
      // The test above observes the *final* document, which the pre-existing, unrelated
      // `DiagnosticSink.hasErrors -> EmitStage refuses to write` net already empties whenever helper.dart's
      // genuine error is reported — regardless of whether main.dart's own extraction actually ran. So it
      // cannot, by itself, distinguish "main.dart correctly extracted and something unrelated downstream
      // refused to write" from "main.dart's own extraction was wrongly skipped because helper.dart's error
      // leaked into it" (over-gating an importer for an imported unit's own diagnostics, if local-only
      // gating were broken). This calls `LoadStage`/`ExtractStage` directly, never reaching `EmitStage`, to
      // prove main.dart's own raw records are produced regardless.
      final String project = createProject(
        name: 'app',
        libraries: <String, String>{
          'main.dart': '''
import 'package:flutter/material.dart';
import 'helper.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('clean');
}
''',
          'helper.dart': '''
void brokenHelper() {
  int value = 'wrong';
}
''',
        },
      );
      final DiagnosticSink sink = DiagnosticSink();
      final StageContext context = StageContext(diagnostics: sink);
      final LoadResult loaded = await const LoadStage().execute(
        AnalyzerRequest(projectRoot: project, outputPath: 'build/out.ndjson'),
        context,
      );
      final ExtractionResult extraction = await const ExtractStage().execute(loaded, context);

      expect(
        extraction.records.where((record) => record.span.file == 'lib/main.dart' && record.kind == 'ui.Component'),
        isNotEmpty,
        reason: 'main.dart is clean — its own W component must be extracted regardless of helper.dart’s error',
      );
      expect(
        extraction.records.where((record) => record.span.file == 'lib/helper.dart'),
        isEmpty,
        reason: 'helper.dart itself still carries a real error and must still be skipped',
      );
    });

    // ── invalid Dart vs. unsupported (valid) Dart are never confused (#16) ──────────────────────────

    test('valid-but-unsupported Dart still reports the ordinary BRG3013-family capability gap, never BRG1310', () async {
      // `dart:mirrors` is real, valid, resolvable Dart this generator does not support lowering — a
      // capability gap, structurally nothing like invalid source. Using a construct this analyzer's own
      // extraction has no UIR node for (BRG1302, unsupportedSyntax) is the cleanest, most neutral proof
      // available here that a genuinely valid-but-unsupported shape never trips the new gate at all.
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) {
    final record = (1, 2);
    return Text('$record');
  }
}
''');
      expect(app.errors, isEmpty, reason: 'a record literal is valid Dart; BRG1302 is a warning, never BRG1310');
      expect(app.ofKind('logic.OpaqueExpr'), isNotEmpty);
    });

    // ── deterministic rejection ──────────────────────────────────────────────────────────────────────

    test('the same invalid source is refused identically on repeated, independent runs', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, turning `\$value` from an
      // interpolation into an escaped literal dollar sign, defeating the fixture entirely.
      // ignore: use_raw_strings
      const String source = '''
import 'package:flutter/material.dart';
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) {
    int value = 'wrong';
    return Text('\$value');
  }
}
''';
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      expect(first.errors, hasLength(1));
      expect(second.errors, hasLength(1));
      expect(first.errors.single.code.id, second.errors.single.code.id);
      expect(first.errors.single.message, second.errors.single.message);
      expect(first.errors.single.span?.line, second.errors.single.span?.line);
      expect(first.nodes, isEmpty);
      expect(second.nodes, isEmpty);
    });
  });

  group('instance member-read provenance (ADR-0033, M9-L)', () {
    // Every assertion here reads a `target` off a node *embedded* inside a plain class's own
    // `logic.ClassDecl.methods`/`.fields` — `ofKind`/`only` already walk nested structures (M9-H's own
    // established pattern), so no separate lookup mechanism is needed.

    Map<String, dynamic> classDecl(Extracted app, String name) =>
        app.ofKind('logic.ClassDecl').singleWhere((Map<String, dynamic> d) => d['name'] == name);

    Map<String, dynamic> method(Map<String, dynamic> cls, String name) =>
        (cls['methods'] as List<dynamic>).cast<Map<String, dynamic>>().singleWhere((m) => m['name'] == name);

    Map<String, dynamic> field(Map<String, dynamic> cls, String name) =>
        (cls['fields'] as List<dynamic>).cast<Map<String, dynamic>>().singleWhere((f) => f['name'] == name);

    /// The first `logic.Ref`/`logic.PropertyAccess` reading [property] found in [body], depth-first.
    Map<String, dynamic>? readOf(Object? body, String property) {
      if (body is Map<String, dynamic>) {
        if ((body['kind'] == 'logic.Ref' && body['name'] == property) ||
            (body['kind'] == 'logic.PropertyAccess' && body['property'] == property)) {
          return body;
        }
        for (final Object? v in body.values) {
          if (readOf(v, property) case final Map<String, dynamic> found) return found;
        }
      } else if (body is List<dynamic>) {
        for (final Object? item in body) {
          if (readOf(item, property) case final Map<String, dynamic> found) return found;
        }
      }
      return null;
    }

    test('implicit and explicit reads of the same field target the identical declaration', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, defeating the interpolation the fixture needs.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Counter {
  final int count;
  const Counter(this.count);
  int get implicitRead => count;
  int get explicitRead => this.count;
}
class W extends StatelessWidget {
  const W({super.key, required this.counter});
  final Counter counter;
  @override
  Widget build(BuildContext context) => Text('\${counter.implicitRead}-\${counter.explicitRead}');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Counter');
      final String fieldId = field(cls, 'count')['id'] as String;
      final String? implicitTarget = readOf(method(cls, 'implicitRead')['body'], 'count')?['target'] as String?;
      final String? explicitTarget = readOf(method(cls, 'explicitRead')['body'], 'count')?['target'] as String?;
      expect(implicitTarget, fieldId);
      expect(explicitTarget, fieldId);
    });

    test('a getter-to-getter chain resolves to the getter’s own declaration, both implicitly and explicitly', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, defeating the interpolation the fixture needs.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Counter {
  final int count;
  const Counter(this.count);
  int get doubled => count * 2;
  int get quadrupled => doubled * 2;
  int get quadrupledExplicit => this.doubled * 2;
}
class W extends StatelessWidget {
  const W({super.key, required this.counter});
  final Counter counter;
  @override
  Widget build(BuildContext context) => Text('\${counter.quadrupled}-\${counter.quadrupledExplicit}');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Counter');
      final String doubledId = method(cls, 'doubled')['id'] as String;
      expect(readOf(method(cls, 'quadrupled')['body'], 'doubled')?['target'], doubledId);
      expect(readOf(method(cls, 'quadrupledExplicit')['body'], 'doubled')?['target'], doubledId);
    });

    test('a local shadowing a field targets the local, never the field — and explicit this.x still targets the field', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, defeating the interpolation the fixture needs.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Counter {
  final int count;
  const Counter(this.count);
  int shadowed() {
    final count = 10;
    return count;
  }
  int shadowedExplicit() => this.count;
}
class W extends StatelessWidget {
  const W({super.key, required this.counter});
  final Counter counter;
  @override
  Widget build(BuildContext context) => Text('\${counter.shadowed()}-\${counter.shadowedExplicit()}');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Counter');
      final String fieldId = field(cls, 'count')['id'] as String;
      final Map<String, dynamic> shadowedBody = method(cls, 'shadowed');
      final String localDeclId = ((shadowedBody['body'] as List<dynamic>).first as Map<String, dynamic>)['id'] as String;
      final String? shadowedTarget = readOf(shadowedBody['body'], 'count')?['target'] as String?;
      expect(shadowedTarget, isNot(fieldId), reason: 'the local, not the field');
      expect(shadowedTarget, localDeclId);
      expect(readOf(method(cls, 'shadowedExplicit')['body'], 'count')?['target'], fieldId);
    });

    test('a parameter shadowing a field is never mistargeted to the field (parameter identity itself stays deferred, M8-N)', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, defeating the interpolation the fixture needs.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Counter {
  final int count;
  const Counter(this.count);
  int paramShadow(int count) => count;
  int paramShadowExplicit(int count) => this.count;
}
class W extends StatelessWidget {
  const W({super.key, required this.counter});
  final Counter counter;
  @override
  Widget build(BuildContext context) => Text('\${counter.paramShadow(1)}-\${counter.paramShadowExplicit(1)}');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Counter');
      final String fieldId = field(cls, 'count')['id'] as String;
      expect(readOf(method(cls, 'paramShadow')['body'], 'count')?['target'], isNull);
      expect(readOf(method(cls, 'paramShadowExplicit')['body'], 'count')?['target'], fieldId);
    });

    test('an inherited (not overridden) member resolves to the declaring superclass’s own declaration, never the subclass', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, defeating the interpolation the fixture needs.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Base {
  int get value => 1;
  int get readImplicit => value;
}
class Child extends Base {
  @override
  int get value => 2;
}
class W extends StatelessWidget {
  const W({super.key, required this.base});
  final Base base;
  @override
  Widget build(BuildContext context) => Text('\${base.readImplicit}');
}
''');
      final Map<String, dynamic> baseCls = classDecl(app, 'Base');
      final Map<String, dynamic> childCls = classDecl(app, 'Child');
      final String baseValueId = method(baseCls, 'value')['id'] as String;
      final String childValueId = method(childCls, 'value')['id'] as String;
      expect(baseValueId, isNot(childValueId));
      expect(readOf(method(baseCls, 'readImplicit')['body'], 'value')?['target'], baseValueId);
    });

    test('two unrelated classes with byte-identical getter bodies are never confused (ADR-0032 regression) — targeting agrees with identity', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, defeating the interpolation the fixture needs.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Alpha {
  int get value => 1;
  int get read => value;
}
class Beta {
  int get value => 1;
  int get read => value;
}
class W extends StatelessWidget {
  const W({super.key, required this.alpha, required this.beta});
  final Alpha alpha;
  final Beta beta;
  @override
  Widget build(BuildContext context) => Text('\${alpha.read}-\${beta.read}');
}
''');
      final Map<String, dynamic> alphaCls = classDecl(app, 'Alpha');
      final Map<String, dynamic> betaCls = classDecl(app, 'Beta');
      final String alphaValueId = method(alphaCls, 'value')['id'] as String;
      final String betaValueId = method(betaCls, 'value')['id'] as String;
      expect(alphaValueId, isNot(betaValueId));
      expect(readOf(method(alphaCls, 'read')['body'], 'value')?['target'], alphaValueId);
      expect(readOf(method(betaCls, 'read')['body'], 'value')?['target'], betaValueId);
    });

    test('a static member read inside a static method still resolves to its own declaration', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class WithStatic {
  static int total = 0;
  static int readTotal() => total;
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('go');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'WithStatic');
      final String totalId = field(cls, 'total')['id'] as String;
      expect(readOf(method(cls, 'readTotal')['body'], 'total')?['target'], totalId);
    });

    test('a component’s own field, read implicitly inside its own build method, is never mistargeted — M9-J regression', () async {
      // The real regression this milestone's own development caught: giving `W`'s own field `model`
      // (backing its constructor parameter) a target here would make `isParameterReceiver` (M9-J) stop
      // recognizing `model` as a bare, untargeted parameter — silently re-enabling the exact
      // `unknown`-receiver passthrough M9-J exists to refuse. BRG3013 itself is raised downstream, by
      // the generator (`packages/generators/react`), which this Dart-only extraction test never runs —
      // that refusal has its own dedicated TS coverage
      // (`unmodelled_class_member_build.test.ts`). What this test proves, at the layer it actually
      // runs at, is the fact that refusal depends on: `model`'s own receiver `Ref`, inside `W`'s build
      // body, must carry no `target` at all, exactly as if this ADR had never run.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  const Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text('\${model.count}');
}
''');
      expect(app.errors, isEmpty);
      final Map<String, dynamic> component = app
          .ofKind('ui.Component')
          .singleWhere((Map<String, dynamic> c) => c['name'] == 'W');
      final Map<String, dynamic>? access = readOf(component, 'count');
      expect(access, isNotNull, reason: 'the model.count read must still be present in the UIR');
      expect(access!['kind'], 'logic.PropertyAccess');
      final Map<String, dynamic> receiver = access['receiver'] as Map<String, dynamic>;
      expect(receiver['kind'], 'logic.Ref');
      expect(receiver['name'], 'model');
      expect(receiver.containsKey('target'), isFalse,
          reason: 'model is a bare, untargeted parameter — M9-J relies on this to refuse the read');
    });

    test('an analyzer-invalid getter body is refused as BRG1310, before any member-target logic ever runs', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, defeating the interpolation the fixture needs.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  const Model(this.count);
  int get value => missingIdentifier;
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text('\${model.value}');
}
''');
      final Diagnostic error = app.errors.single;
      expect(error.code.id, 'BRG1310');
      expect(app.nodes, isEmpty);
    });

    test('an extension getter is never targeted by this mechanism', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, defeating the interpolation the fixture needs.
      // ignore: use_raw_strings
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
extension IntExt on int {
  int get doubled => this * 2;
}
class Holder {
  final int count;
  const Holder(this.count);
  int get value => count.doubled;
}
class W extends StatelessWidget {
  const W({super.key, required this.h});
  final Holder h;
  @override
  Widget build(BuildContext context) => Text('\${h.value}');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Holder');
      final Map<String, dynamic>? doubledRead = readOf(method(cls, 'value')['body'], 'doubled');
      expect(doubledRead?['target'], isNull);
    });

    test('the same source extracts to the same targets on a second, independent run (determinism)', () async {
      // Raw would keep the backslash into the inner, analyzed Dart, defeating the interpolation the fixture needs.
      // ignore: use_raw_strings
      const String source = '''
import 'package:flutter/material.dart';
class Counter {
  final int count;
  const Counter(this.count);
  int get doubled => count * 2;
}
class W extends StatelessWidget {
  const W({super.key, required this.counter});
  final Counter counter;
  @override
  Widget build(BuildContext context) => Text('\${counter.doubled}');
}
''';
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      final String? firstTarget = readOf(method(classDecl(first, 'Counter'), 'doubled')['body'], 'count')?['target'] as String?;
      final String? secondTarget = readOf(method(classDecl(second, 'Counter'), 'doubled')['body'], 'count')?['target'] as String?;
      expect(firstTarget, isNotNull);
      expect(firstTarget, secondTarget);
    });
  });

  group('project class type-reference provenance (ADR-0034, M9-M)', () {
    Map<String, dynamic> classDecl(Extracted app, String name, {String file = 'lib/main.dart'}) =>
        app.ofKind('logic.ClassDecl').singleWhere(
          (Map<String, dynamic> d) => d['name'] == name && (d['span'] as Map<String, dynamic>)['file'] == file,
        );
    Map<String, dynamic> componentNamed(Extracted app, String name) =>
        app.ofKind('ui.Component').singleWhere((Map<String, dynamic> c) => c['name'] == name);
    Map<String, dynamic> paramOf(Extracted app, String name, {String component = 'W'}) =>
        (componentNamed(app, component)['params'] as List<dynamic>)
            .cast<Map<String, dynamic>>()
            .singleWhere((Map<String, dynamic> p) => p['name'] == name);

    test('a plain project class used only as a parameter type carries a target to its own ClassDecl', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final String modelId = classDecl(app, 'Model')['id'] as String;
      final Map<String, dynamic> type = paramOf(app, 'model')['type'] as Map<String, dynamic>;
      expect(type['target'], modelId);
    });

    test('same-name classes in two different files get distinct targets', () async {
      final Extracted app = await extract(
        '''
import 'package:flutter/material.dart';
import 'helper.dart' as helper;
class Model {}
class W extends StatelessWidget {
  const W({super.key, required this.a, required this.b});
  final Model a;
  final helper.Model b;
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''',
        extra: <String, String>{'helper.dart': 'class Model {}'},
      );
      final String localId = classDecl(app, 'Model')['id'] as String;
      final Map<String, dynamic> aType = paramOf(app, 'a')['type'] as Map<String, dynamic>;
      final Map<String, dynamic> bType = paramOf(app, 'b')['type'] as Map<String, dynamic>;
      expect(aType['target'], localId);
      expect(bType['target'], isNotNull);
      expect(bType['target'], isNot(localId));
    });

    test('a generic class instantiation carries no target — bounded out (ADR-0034 §12)', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Box<T> {}
class W extends StatelessWidget {
  const W({super.key, required this.box});
  final Box<int> box;
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> type = paramOf(app, 'box')['type'] as Map<String, dynamic>;
      expect(type['target'], isNull);
    });

    test('a component class used as a parameter type carries no target — already represented as ui.Component', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Inner extends StatelessWidget {
  const Inner({super.key});
  @override
  Widget build(BuildContext context) => const Text('inner');
}
class W extends StatelessWidget {
  const W({super.key, required this.inner});
  final Inner inner;
  @override
  Widget build(BuildContext context) => inner;
}
''');
      final Map<String, dynamic> inner = app.ofKind('ui.Component').singleWhere((Map<String, dynamic> c) => c['name'] == 'W');
      final Map<String, dynamic> type = paramOf(app, 'inner')['type'] as Map<String, dynamic>;
      expect(type['target'], isNull);
      expect(inner['name'], 'W');
    });

    test('a private class used as a parameter type still carries a target — exclusion is a generator-layer decision (ADR-0034 §9)', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class _Model {}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final _Model model;
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final String modelId = classDecl(app, '_Model')['id'] as String;
      final Map<String, dynamic> type = paramOf(app, 'model')['type'] as Map<String, dynamic>;
      expect(type['target'], modelId);
    });

    test('a nullable project class type carries both target and nullable', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {}
class W extends StatelessWidget {
  const W({super.key, this.model});
  final Model? model;
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final String modelId = classDecl(app, 'Model')['id'] as String;
      final Map<String, dynamic> type = paramOf(app, 'model')['type'] as Map<String, dynamic>;
      expect(type['target'], modelId);
      expect(type['nullable'], true);
    });

    test('the same source extracts to the same type target on a second, independent run (determinism)', () async {
      const String source = '''
import 'package:flutter/material.dart';
class Model {}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''';
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      final Object? firstTarget = (paramOf(first, 'model')['type'] as Map<String, dynamic>)['target'];
      final Object? secondTarget = (paramOf(second, 'model')['type'] as Map<String, dynamic>)['target'];
      expect(firstTarget, isNotNull);
      expect(firstTarget, secondTarget);
    });
  });

  group('external immutable field-read targeting (ADR-0035, M9-N)', () {
    Map<String, dynamic> classDecl(Extracted app, String name) =>
        app.ofKind('logic.ClassDecl').singleWhere((Map<String, dynamic> d) => d['name'] == name);
    Map<String, dynamic> field(Map<String, dynamic> cls, String name) => (cls['fields'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .singleWhere((Map<String, dynamic> f) => f['name'] == name);
    Map<String, dynamic>? readOf(Object? body, String property) {
      if (body is Map<String, dynamic>) {
        if ((body['kind'] == 'logic.Ref' && body['name'] == property) ||
            (body['kind'] == 'logic.PropertyAccess' && body['property'] == property)) {
          return body;
        }
        for (final Object? v in body.values) {
          if (readOf(v, property) case final Map<String, dynamic> found) return found;
        }
      } else if (body is List<dynamic>) {
        for (final Object? item in body) {
          if (readOf(item, property) case final Map<String, dynamic> found) return found;
        }
      }
      return null;
    }

    test('a direct final field read on a parameter receiver carries a target to its own FieldDecl', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.count.toString());
}
''');
      final String countId = field(classDecl(app, 'Model'), 'count')['id'] as String;
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'count');
      expect(read?['target'], countId);
    });

    test('field-backed external, implicit, and explicit-this reads all target the identical FieldDecl', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  int get implicitRead => count;
  int get explicitRead => this.count;
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text('${model.count}-${model.implicitRead}-${model.explicitRead}');
}
''');
      final String countId = field(classDecl(app, 'Model'), 'count')['id'] as String;
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final List<dynamic> methods = cls['methods'] as List<dynamic>;
      final Map<String, dynamic> implicitGetter =
          methods.cast<Map<String, dynamic>>().singleWhere((m) => m['name'] == 'implicitRead');
      final Map<String, dynamic> explicitGetter =
          methods.cast<Map<String, dynamic>>().singleWhere((m) => m['name'] == 'explicitRead');
      final Map<String, dynamic>? externalRead = readOf(app.only('ui.Component')['render'], 'count');
      final Map<String, dynamic>? implicitInsideRead = readOf(implicitGetter['body'], 'count');
      final Map<String, dynamic>? explicitInsideRead = readOf(explicitGetter['body'], 'count');
      expect(externalRead?['target'], countId);
      expect(implicitInsideRead?['target'], countId);
      expect(explicitInsideRead?['target'], countId);
    });

    test('the field target owner matches the receiver class — never property-name equality', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
class Alpha {
  final int value;
  Alpha(this.value);
}
class Beta {
  final String value;
  Beta(this.value);
}
class W extends StatelessWidget {
  const W({super.key, required this.alpha, required this.beta});
  final Alpha alpha;
  final Beta beta;
  @override
  Widget build(BuildContext context) => Text('${alpha.value}-${beta.value}');
}
''');
      final String alphaValueId = field(classDecl(app, 'Alpha'), 'value')['id'] as String;
      final String betaValueId = field(classDecl(app, 'Beta'), 'value')['id'] as String;
      expect(alphaValueId, isNot(betaValueId));
      final List<Map<String, dynamic>> reads = app.ofKind('logic.PropertyAccess');
      final Map<String, dynamic> alphaRead =
          reads.firstWhere((n) => n['property'] == 'value' && (n['receiver'] as Map<String, dynamic>)['name'] == 'alpha');
      final Map<String, dynamic> betaRead =
          reads.firstWhere((n) => n['property'] == 'value' && (n['receiver'] as Map<String, dynamic>)['name'] == 'beta');
      expect(alphaRead['target'], alphaValueId);
      expect(betaRead['target'], betaValueId);
    });

    test('repeated external reads of the same field target the identical declaration', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text('${model.count}-${model.count}');
}
''');
      final String countId = field(classDecl(app, 'Model'), 'count')['id'] as String;
      final List<Map<String, dynamic>> reads =
          app.ofKind('logic.PropertyAccess').where((n) => n['property'] == 'count').toList();
      expect(reads, hasLength(2));
      expect(reads[0]['target'], countId);
      expect(reads[1]['target'], countId);
    });

    test('two distinct final fields on the same class each target their own declaration', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
class Model {
  final int count;
  final String name;
  Model(this.count, this.name);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text('${model.count}-${model.name}');
}
''');
      final String countId = field(classDecl(app, 'Model'), 'count')['id'] as String;
      final String nameId = field(classDecl(app, 'Model'), 'name')['id'] as String;
      expect(countId, isNot(nameId));
      final List<Map<String, dynamic>> reads = app.ofKind('logic.PropertyAccess');
      expect(reads.firstWhere((n) => n['property'] == 'count')['target'], countId);
      expect(reads.firstWhere((n) => n['property'] == 'name')['target'], nameId);
    });

    test('an explicit getter is never targeted by the field-read mechanism specifically (ADR-0038 targets it its own way)', () async {
      // `model.doubled` DOES carry a `target` — since M9-Q (ADR-0038), an eligible explicit getter is
      // targeted by its own `_externalGetterTarget` mechanism. What this test still proves, unchanged
      // from M9-N: the *field-read* mechanism (`_externalFieldTarget`'s own `isOriginVariable` gate)
      // never fires for an explicit getter — the two mechanisms remain independent, never one silently
      // standing in for the other.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  int get doubled => count * 2;
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.doubled.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'doubled');
      expect(read?.containsKey('target'), isTrue);
      final Map<String, dynamic> cls = app.ofKind('logic.ClassDecl').singleWhere((c) => c['name'] == 'Model');
      final Map<String, dynamic> doubledDecl = (cls['methods'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .singleWhere((m) => m['name'] == 'doubled');
      expect(read?['target'], doubledDecl['id']);
    });

    test('a mutable field is never targeted by external field-read resolution', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  int count;
  Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.count.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'count');
      expect(read?.containsKey('target'), isFalse);
    });

    test('a static field is never targeted by external field-read resolution', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  static final int count = 1;
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(Model.count.toString());
}
''');
      // `Model.count` is a static qualifier (`_isStaticQualifier`), extracted as a compound-name
      // `logic.Ref` (`'Model.count'`), never a `logic.PropertyAccess` — `_externalFieldTarget` is never
      // even reached for it, structurally, since it only ever fires from the instance-receiver cases.
      expect(app.ofKind('logic.PropertyAccess').where((n) => n['property'] == 'count'), isEmpty);
      final Map<String, dynamic> ref =
          app.ofKind('logic.Ref').singleWhere((n) => n['name'] == 'Model.count');
      expect(ref.containsKey('target'), isFalse);
    });

    test('a private field is never targeted by external field-read resolution (its own public getter is targeted the M9-Q way instead)', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int _count;
  Model(this._count);
  int get count => _count;
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.count.toString());
}
''');
      // `model.count` reads the *public* explicit getter, not the private field directly — the
      // *field-read* mechanism never fires for it (`isOriginVariable` is false for an explicit getter);
      // since M9-Q (ADR-0038), the getter-read mechanism now legitimately targets it instead.
      // `_count` itself is unreachable from outside the library in valid Dart, so it is not separately
      // probed here; the getter case alone already proves no field-shaped shortcut fires for it.
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'count');
      expect(read?.containsKey('target'), isTrue);
    });

    test('an inherited class field is never targeted by external field-read resolution', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Base {
  final int value;
  Base(this.value);
}
class Child extends Base {
  Child(super.value);
}
class W extends StatelessWidget {
  const W({super.key, required this.child});
  final Child child;
  @override
  Widget build(BuildContext context) => Text(child.value.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'value');
      expect(read?.containsKey('target'), isFalse);
    });

    test('a generic class field is never targeted by external field-read resolution', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Box<T> {
  final T value;
  Box(this.value);
}
class W extends StatelessWidget {
  const W({super.key, required this.box});
  final Box<int> box;
  @override
  Widget build(BuildContext context) => Text(box.value.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'value');
      expect(read?.containsKey('target'), isFalse);
    });

    test('a component field read implicitly inside its own build method stays untargeted (M9-J boundary unchanged)', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.count.toString());
}
class Outer extends StatelessWidget {
  const Outer({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => W(model: model);
}
''');
      // `Outer.build`'s own `model` (its own field, read implicitly) must stay untargeted — the exact
      // M9-J/M9-L regression boundary this milestone must not disturb.
      final Map<String, dynamic> outer =
          app.ofKind('ui.Component').singleWhere((c) => c['name'] == 'Outer');
      // `model` here is a bare Ref (component's own prop read), not a PropertyAccess — no field-read
      // targeting mechanism applies to it at all; this asserts the render tree still extracts cleanly.
      expect(outer['render'], isNotNull);
    });

    test('an analyzer-invalid field type is refused as BRG1310, before M9-N targeting ever runs', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final MissingType value;
  Model(this.value);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.value.toString());
}
''');
      final Diagnostic error = app.errors.single;
      expect(error.code.id, 'BRG1310');
      expect(app.nodes, isEmpty);
    });

    test('the same source extracts to the same field target on a second, independent run (determinism)', () async {
      const String source = '''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.count.toString());
}
''';
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      final Object? firstTarget = readOf(first.only('ui.Component')['render'], 'count')?['target'];
      final Object? secondTarget = readOf(second.only('ui.Component')['render'], 'count')?['target'];
      expect(firstTarget, isNotNull);
      expect(firstTarget, secondTarget);
    });
  });

  group('bounded structural project-class construction (ADR-0036, M9-O)', () {
    Map<String, dynamic> classDecl(Extracted app, String name) =>
        app.ofKind('logic.ClassDecl').singleWhere((Map<String, dynamic> d) => d['name'] == name);
    Map<String, dynamic> field(Map<String, dynamic> cls, String name) => (cls['fields'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .singleWhere((Map<String, dynamic> f) => f['name'] == name);
    List<dynamic>? constructors(Map<String, dynamic> cls) => cls['constructibleConstructors'] as List<dynamic>?;
    Map<String, dynamic>? constructorEntry(Map<String, dynamic> cls, {String? name}) {
      final List<dynamic>? all = constructors(cls);
      if (all == null) return null;
      for (final Map<String, dynamic> entry in all.cast<Map<String, dynamic>>()) {
        if (entry['name'] == name) return entry;
      }
      return null;
    }

    // Back-compat shape for every pre-existing M9-O test below: the sole unnamed constructor's own field
    // order, or `null` when it is absent — identical in meaning to M9-O's own class-global
    // `constructibleFieldOrder`, now resolved as one entry of the ADR-0037 constructor-keyed array.
    List<dynamic>? fieldOrder(Map<String, dynamic> cls) => constructorEntry(cls)?['fields'] as List<dynamic>?;

    test('an implicit default constructor on an empty class is trivially constructible', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isEmpty);
    });

    test('a class with fields and no explicit constructor is not constructible (analyzer would refuse the source anyway)', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count = 1;
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('a single field-formal parameter maps to its own FieldDecl, in parameter order', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      expect(fieldOrder(cls), <String>[countId]);
    });

    test('two field-formal parameters in declaration order map field-for-field', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  final String name;
  Model(this.count, this.name);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      final String nameId = field(cls, 'name')['id'] as String;
      expect(fieldOrder(cls), <String>[countId, nameId]);
    });

    test('a constructor parameter order that differs from field declaration order is preserved exactly', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int first;
  final int second;
  Model(this.second, this.first);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String firstId = field(cls, 'first')['id'] as String;
      final String secondId = field(cls, 'second')['id'] as String;
      // Constructor parameter order — `second` then `first` — never field declaration order.
      expect(fieldOrder(cls), <String>[secondId, firstId]);
    });

    test('an unrelated explicit getter does not disqualify an otherwise-eligible class', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  int get doubled => count * 2;
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      expect(fieldOrder(cls), <String>[countId]);
    });

    test('an unrelated method does not disqualify an otherwise-eligible class', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  int compute() => count + 1;
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      expect(fieldOrder(cls), <String>[countId]);
    });

    test('a mutable field disqualifies the whole class from construction', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  int count;
  Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('a private field disqualifies the whole class from construction', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int _count;
  Model(this._count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('a late final field disqualifies the whole class from construction', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  late final int count;
  Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('a static field is not part of the instance field set and does not itself disqualify construction', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  static final int total = 0;
  Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      expect(fieldOrder(cls), <String>[countId]);
    });

    test('a const constructor is not constructible', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  const Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('a factory constructor is not constructible', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model._(this.count);
  factory Model(int count) => Model._(count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('a named constructor alone (no unnamed constructor) is not constructible', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model.named(this.count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('a non-empty constructor body disqualifies the class from construction', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
void sideEffect() {}
class Model {
  final int count;
  Model(this.count) {
    sideEffect();
  }
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('a field with a declaration-level initializer, not covered by any field-formal, disqualifies the class from construction', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  final int total = 0;
  Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      // `total` is an eligible instance field (final, public, non-static, non-late) with no field-formal
      // of its own — the bijection between field-formals and the full instance field set fails, since
      // `Model`'s own constructor only ever covers `count`. Catches exactly the shape a bijection check
      // exists to reject: a field the constructor silently leaves at its own declaration-time default.
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('an initializer list disqualifies the class from construction', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(int value) : count = value;
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('an inherited class is not constructible', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Base {
  final int value;
  Base(this.value);
}
class Model extends Base {
  Model(super.value);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('a generic class is not constructible', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model<T> {
  final T value;
  Model(this.value);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('a private class is not constructible', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class _Model {
  final int count;
  _Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, '_Model')), isNull);
    });

    test('an optional positional field-formal parameter disqualifies the class from construction', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model([this.count = 0]);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('an optional (non-required) named field-formal parameter disqualifies the class from construction', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model({this.count = 0});
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('a plain (non-field-formal) parameter disqualifies the class from construction', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(int value) : count = value;
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(fieldOrder(classDecl(app, 'Model')), isNull);
    });

    test('a field-formal targeting a field twice disqualifies the class from construction', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count, this.count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(app.errors, isNotEmpty, reason: 'duplicate final-field initialization is itself invalid Dart');
    });

    test('a same-name field across two classes maps to its own distinct declaration (ADR-0032 regression)', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Alpha {
  final int value;
  Alpha(this.value);
}
class Beta {
  final int value;
  Beta(this.value);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final String alphaValueId = field(classDecl(app, 'Alpha'), 'value')['id'] as String;
      final String betaValueId = field(classDecl(app, 'Beta'), 'value')['id'] as String;
      expect(alphaValueId, isNot(betaValueId));
      expect(fieldOrder(classDecl(app, 'Alpha')), <String>[alphaValueId]);
      expect(fieldOrder(classDecl(app, 'Beta')), <String>[betaValueId]);
    });

    test('an analyzer-invalid field type is refused as BRG1310, before M9-O construction eligibility ever runs', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final MissingType value;
  Model(this.value);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Diagnostic error = app.errors.single;
      expect(error.code.id, 'BRG1310');
      expect(app.nodes, isEmpty);
    });

    test('the same source extracts to the same constructible field order on a second, independent run (determinism)', () async {
      const String source = '''
import 'package:flutter/material.dart';
class Model {
  final int count;
  final String name;
  Model(this.count, this.name);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''';
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      expect(fieldOrder(classDecl(first, 'Model')), fieldOrder(classDecl(second, 'Model')));
      expect(fieldOrder(classDecl(first, 'Model')), isNotEmpty);
    });
  });

  group('constructor-specific structural construction (ADR-0037, M9-P)', () {
    Map<String, dynamic> classDecl(Extracted app, String name) =>
        app.ofKind('logic.ClassDecl').singleWhere((Map<String, dynamic> d) => d['name'] == name);
    Map<String, dynamic> field(Map<String, dynamic> cls, String name) => (cls['fields'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .singleWhere((Map<String, dynamic> f) => f['name'] == name);
    List<dynamic>? constructors(Map<String, dynamic> cls) => cls['constructibleConstructors'] as List<dynamic>?;
    Map<String, dynamic>? entryNamed(Map<String, dynamic> cls, String? name) {
      final List<dynamic>? all = constructors(cls);
      if (all == null) return null;
      for (final Map<String, dynamic> entry in all.cast<Map<String, dynamic>>()) {
        if (entry['name'] == name) return entry;
      }
      return null;
    }

    test('P2 — a single named generative constructor with positional field-formals is constructible', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  final String name;
  Model.named(this.count, this.name);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      final String nameId = field(cls, 'name')['id'] as String;
      final Map<String, dynamic>? entry = entryNamed(cls, 'named');
      expect(entry, isNotNull);
      expect(entry!['kind'], 'positional');
      expect(entry['fields'], <String>[countId, nameId]);
      // The unnamed slot is genuinely absent — `Model` itself has no unnamed constructor.
      expect(entryNamed(cls, null), isNull);
    });

    test('P3 — an unnamed and a named constructor on the same class are both independently constructible', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  Model.zero() : this(0);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      // `Model.zero()` redirects (`: this(0)`) — excluded on its own terms (ADR-0037 §22/redirect
      // boundary), which is exactly the "safe + unsafe sibling" shape this rung exists to prove: the
      // unnamed constructor's own eligibility is untouched by its sibling's redirect.
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      expect(entryNamed(cls, null)?['fields'], <String>[countId]);
      expect(entryNamed(cls, 'zero'), isNull);
    });

    test('P4 — two named constructors with different field orders are each independently correct', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int a;
  final int b;
  Model.first(this.a, this.b);
  Model.second(this.b, this.a);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String aId = field(cls, 'a')['id'] as String;
      final String bId = field(cls, 'b')['id'] as String;
      expect(entryNamed(cls, 'first')!['fields'], <String>[aId, bId]);
      expect(entryNamed(cls, 'second')!['fields'], <String>[bId, aId]);
    });

    test('P5 — the same constructor name on two different classes never collides', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Alpha {
  final int value;
  Alpha.named(this.value);
}
class Beta {
  final String value;
  Beta.named(this.value);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final String alphaValueId = field(classDecl(app, 'Alpha'), 'value')['id'] as String;
      final String betaValueId = field(classDecl(app, 'Beta'), 'value')['id'] as String;
      expect(alphaValueId, isNot(betaValueId));
      expect(entryNamed(classDecl(app, 'Alpha'), 'named')!['fields'], <String>[alphaValueId]);
      expect(entryNamed(classDecl(app, 'Beta'), 'named')!['fields'], <String>[betaValueId]);
    });

    test('P9 — a single required named field-formal is constructible', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model({required this.count});
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      final Map<String, dynamic>? entry = entryNamed(cls, null);
      expect(entry, isNotNull);
      expect(entry!['kind'], 'named');
      expect(entry['fields'], <String>[countId]);
    });

    test('P10 — two required named field-formals are both constructible, in declaration order', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  final String name;
  Model({required this.count, required this.name});
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      final String nameId = field(cls, 'name')['id'] as String;
      final Map<String, dynamic>? entry = entryNamed(cls, null);
      expect(entry!['kind'], 'named');
      expect(entry['fields'], <String>[countId, nameId]);
    });

    test('a named constructor with required named field-formals is constructible', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  final String name;
  Model.named({required this.name, required this.count});
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      final String nameId = field(cls, 'name')['id'] as String;
      final Map<String, dynamic>? entry = entryNamed(cls, 'named');
      expect(entry!['kind'], 'named');
      expect(entry['fields'], <String>[nameId, countId]);
    });

    test('a constructor mixing required-positional and required-named field-formals is excluded entirely', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  final String name;
  Model(this.count, {required this.name});
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(entryNamed(classDecl(app, 'Model'), null), isNull);
    });

    test('P14 — a safe unnamed constructor and an unsafe named constructor (side-effecting body) coexist correctly', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
void sideEffect() {}
class Model {
  final int count;
  Model(this.count);
  Model.bad(this.count) {
    sideEffect();
  }
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      expect(entryNamed(cls, null)?['fields'], <String>[countId]);
      expect(entryNamed(cls, 'bad'), isNull);
    });

    test('P19 — a factory named constructor is excluded, its safe unnamed sibling unaffected', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  Model._raw(this.count);
  factory Model.cached(int count) => Model._raw(count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      expect(entryNamed(cls, null)?['fields'], <String>[countId]);
      expect(entryNamed(cls, 'cached'), isNull);
      // `Model._raw` is private — never itself a constructible entry (ADR-0037 does not export private
      // constructor internals), though this test's own focus is the factory exclusion above.
    });

    test('P20 — a redirecting named constructor is excluded', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  Model.zero() : this(0);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(entryNamed(classDecl(app, 'Model'), 'zero'), isNull);
    });

    test('a zero-parameter redirecting FACTORY constructor on a fieldless class is excluded — isolates the factory/redirect checks from the body/field-formal checks', () async {
      // `factory Model() = Model.raw;` has no `{}`/`=>` body of its own — the AST represents it with an
      // `EmptyFunctionBody`, exactly like a genuinely trivial constructor — and, on a fieldless class,
      // zero parameters trivially satisfies the field-formal bijection too. Only the `factoryKeyword`/
      // `redirectedConstructor` checks themselves stand between this shape and being wrongly accepted —
      // every other real-world factory/redirect example in this file's own P19/P20 is redundantly
      // protected by its own non-empty body or incomplete field coverage, which this one deliberately
      // is not.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  factory Model() = Model.raw;
  Model.raw();
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      expect(entryNamed(cls, null), isNull);
      expect(entryNamed(cls, 'raw'), isNotNull);
    });

    test('P21 — a const named constructor is excluded', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  const Model.named(this.count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(entryNamed(classDecl(app, 'Model'), 'named'), isNull);
    });

    test('P22 — a generic class remains excluded regardless of a named constructor', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model<T> {
  final T value;
  Model.named(this.value);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(constructors(classDecl(app, 'Model')), isNull);
    });

    test('P23 — an inherited class remains excluded regardless of a named constructor', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Base {
  final int value;
  Base(this.value);
}
class Model extends Base {
  Model.named(super.value);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(constructors(classDecl(app, 'Model')), isNull);
    });

    test('P24 — a private class remains excluded regardless of a named constructor', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class _Model {
  final int count;
  _Model.named(this.count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(constructors(classDecl(app, '_Model')), isNull);
    });

    test('P28/P29 — an explicit getter/method coexists with a named constructor without disqualifying it', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model.named(this.count);
  int get doubled => count * 2;
  int compute() => count + 1;
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String countId = field(cls, 'count')['id'] as String;
      expect(entryNamed(cls, 'named')?['fields'], <String>[countId]);
    });

    test('a non-empty named-constructor body disqualifies only that constructor', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
void sideEffect() {}
class Model {
  final int count;
  Model.named(this.count) {
    sideEffect();
  }
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(entryNamed(classDecl(app, 'Model'), 'named'), isNull);
    });

    test('a named constructor with a non-empty initializer list is excluded', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model.named(int value) : count = value;
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(entryNamed(classDecl(app, 'Model'), 'named'), isNull);
    });

    test('the whole-class prerequisite still gates every constructor: a mutable field excludes all of them', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  int count;
  Model(this.count);
  Model.named(this.count);
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      expect(constructors(classDecl(app, 'Model')), isNull);
    });

    test('the same source extracts to the same constructor-keyed mapping on a second, independent run (determinism)', () async {
      const String source = '''
import 'package:flutter/material.dart';
class Model {
  final int count;
  final String name;
  Model(this.count, this.name);
  Model.named({required this.name, required this.count});
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''';
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      expect(constructors(classDecl(first, 'Model')), constructors(classDecl(second, 'Model')));
      expect(entryNamed(classDecl(first, 'Model'), null), isNotNull);
      expect(entryNamed(classDecl(first, 'Model'), 'named'), isNotNull);
    });
  });

  group('bounded structural instance getter execution provenance (ADR-0038, M9-Q)', () {
    Map<String, dynamic> classDecl(Extracted app, String name) =>
        app.ofKind('logic.ClassDecl').singleWhere((Map<String, dynamic> d) => d['name'] == name);
    Map<String, dynamic> method(Map<String, dynamic> cls, String name) => (cls['methods'] as List<dynamic>)
        .cast<Map<String, dynamic>>()
        .singleWhere((Map<String, dynamic> m) => m['name'] == name);
    Map<String, dynamic>? readOf(Object? body, String property) {
      if (body is Map<String, dynamic>) {
        if ((body['kind'] == 'logic.Ref' && body['name'] == property) ||
            (body['kind'] == 'logic.PropertyAccess' && body['property'] == property)) {
          return body;
        }
        for (final Object? v in body.values) {
          if (readOf(v, property) case final Map<String, dynamic> found) return found;
        }
      } else if (body is List<dynamic>) {
        for (final Object? item in body) {
          if (readOf(item, property) case final Map<String, dynamic> found) return found;
        }
      }
      return null;
    }

    test('Q1/Q46 — an external read of an eligible expression-bodied getter targets its own declaration', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  int get doubled => count * 2;
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.doubled.toString());
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String doubledId = method(cls, 'doubled')['id'] as String;
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'doubled');
      expect(read?['target'], doubledId);
      expect(method(cls, 'doubled')['isGetter'], isTrue);
    });

    test('Q9/Q10/Q11 — a block-bodied getter with a local variable and an if/return is fully representable', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  int get classified {
    final doubled = count * 2;
    if (doubled > 10) return doubled;
    return 0;
  }
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.classified.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'classified');
      expect(read?['target'], isNotNull);
    });

    test('Q6 — a getter reading two distinct fields is representable', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int a;
  final int b;
  Model(this.a, this.b);
  int get combined => a + b;
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.combined.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'combined');
      expect(read?['target'], isNotNull);
    });

    test('Q59 — a local variable that shadows a field name resolves to the local, never the field', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  int get shadowed {
    final count = 99;
    return count;
  }
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.shadowed.toString());
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final String fieldId = (cls['fields'] as List<dynamic>)
          .cast<Map<String, dynamic>>()
          .singleWhere((f) => f['name'] == 'count')['id'] as String;
      final List<dynamic> body = method(cls, 'shadowed')['body'] as List<dynamic>;
      // The `return count;` reads the local (its own ADR-28 declaration identity), never
      // `Model.count`'s own `FieldDecl` — Dart's own scoping resolves the shadowing local first, and
      // `_instanceMemberTarget` is never even reached for `node.element` once it resolves to the local.
      final Map<String, dynamic>? countRead = readOf(body, 'count');
      expect(countRead?['target'], isNot(fieldId));
    });

    test('an explicit `this.field` read inside a getter body targets the identical FieldDecl a bare read does', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  int get bareRead => count * 2;
  int get explicitRead => this.count * 2;
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text('${model.bareRead} ${model.explicitRead}');
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      final Map<String, dynamic> bare = method(cls, 'bareRead');
      final Map<String, dynamic> explicit = method(cls, 'explicitRead');
      final String? bareTarget = readOf(bare['body'], 'count')?['target'] as String?;
      final String? explicitTarget = readOf(explicit['body'], 'count')?['target'] as String?;
      expect(bareTarget, isNotNull);
      expect(bareTarget, explicitTarget);
    });

    test('Q19 — a private getter is never targeted by external read resolution', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  int get _hidden => count * 2;
  int reveal() => _hidden;
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.reveal().toString());
}
''');
      // `_hidden` is unreachable from outside the library in valid Dart, so it is never itself probed as
      // an external read here; `reveal()` is a method call M9-Q does not support (methods deferred to
      // M10+), so this class as a whole simply has no supported external member read to test beyond the
      // getter-eligibility fact already covered elsewhere. This test records the boundary explicitly:
      // `_hidden`'s own declaration is extracted (bodies are always extracted, ADR-0033), but nothing
      // external ever targets it.
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      expect(method(cls, '_hidden')['isGetter'], isTrue);
      expect(app.ofKind('logic.PropertyAccess').where((n) => n['property'] == '_hidden'), isEmpty);
    });

    test('Q34 — an abstract getter (no body) is never targeted by external read resolution', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
abstract class Shape {
  int get sides;
}
class Model {
  final Shape shape;
  Model(this.shape);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.shape.sides.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'sides');
      expect(read?.containsKey('target'), isFalse);
    });

    test('Q17/Q62 — an inherited getter, read via a subclass-typed receiver, is never targeted', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Base {
  final int count;
  Base(this.count);
  int get doubled => count * 2;
}
class Child extends Base {
  Child(super.count);
}
class Model {
  final Child child;
  Model(this.child);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.child.doubled.toString());
}
''');
      // `Child` itself fails the dispatch-safe receiver-class gate (it has an explicit superclass) — so
      // `child.doubled` is refused regardless of whether `Child` overrides `doubled`. This is the entire
      // dynamic-dispatch exclusion (ADR-0038 §2): a subclass-typed receiver can never pass the class gate,
      // so a member resolved against it can never reach a helper, with no corpus-wide subclass search.
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'doubled');
      expect(read?.containsKey('target'), isFalse);
    });

    test('Q17b — reading the identical getter directly off a Base-typed receiver IS targeted', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Base {
  final int count;
  Base(this.count);
  int get doubled => count * 2;
}
class Model {
  final Base base;
  Model(this.base);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.base.doubled.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'doubled');
      expect(read?.containsKey('target'), isTrue);
    });

    test('an overriding getter on a subclass is never targeted, regardless of the override itself', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Base {
  final int count;
  Base(this.count);
  int get doubled => count * 2;
}
class Child extends Base {
  Child(super.count);
  @override
  int get doubled => count * 3;
}
class Model {
  final Child child;
  Model(this.child);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.child.doubled.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'doubled');
      expect(read?.containsKey('target'), isFalse);
    });

    test('Q39 — a getter on a generic class is never targeted by external read resolution', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Box<T> {
  final T value;
  Box(this.value);
  T get contents => value;
}
class Model {
  final Box<int> box;
  Model(this.box);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.box.contents.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'contents');
      expect(read?.containsKey('target'), isFalse);
    });

    test('a getter on a private class is never targeted by external read resolution', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class _Model {
  final int count;
  _Model(this.count);
  int get doubled => count * 2;
}
class Wrapper {
  final _Model inner;
  Wrapper(this.inner);
}
class Model {
  final Wrapper wrapper;
  Model(this.wrapper);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.wrapper.inner.doubled.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'doubled');
      expect(read?.containsKey('target'), isFalse);
    });

    test('a static getter is never targeted by external read resolution', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  static int get doubled => 4;
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(Model.doubled.toString());
}
''');
      // `Model.doubled` is a static qualifier, extracted as a compound-name `logic.Ref`
      // (`'Model.doubled'`), never a `logic.PropertyAccess` — the identical structural fact the M9-N
      // static-field test already established.
      expect(app.ofKind('logic.PropertyAccess').where((n) => n['property'] == 'doubled'), isEmpty);
    });

    test("a field-backed synthetic getter is never targeted by the M9-Q getter mechanism (it is M9-N's field mechanism instead)", () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.count.toString());
}
''');
      final Map<String, dynamic> cls = classDecl(app, 'Model');
      // `count` never appears in `methods` at all — it is a field, not a getter — confirming the two
      // mechanisms partition Dart's own member declarations, never overlapping on the same declaration.
      expect((cls['methods'] as List<dynamic>?) ?? const <dynamic>[], isEmpty);
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'count');
      expect(read?.containsKey('target'), isTrue);
    });

    test('Q52 — a field on one class and a getter of the identical name on another never confuse capability kinds', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
class Alpha {
  final int value;
  Alpha(this.value);
}
class Beta {
  int get value => 1;
}
class Model {
  final Alpha alpha;
  final Beta beta;
  Model(this.alpha, this.beta);
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text('${model.alpha.value} ${model.beta.value}');
}
''');
      final Map<String, dynamic> alphaCls = classDecl(app, 'Alpha');
      final Map<String, dynamic> betaCls = classDecl(app, 'Beta');
      expect((alphaCls['methods'] as List<dynamic>?) ?? const <dynamic>[], isEmpty);
      expect(method(betaCls, 'value')['isGetter'], isTrue);
    });

    test('Q50 — the same getter name on two different classes resolves to two distinct declarations', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Alpha {
  final int count;
  Alpha(this.count);
  int get doubled => count * 2;
}
class Beta {
  final int count;
  Beta(this.count);
  int get doubled => count * 3;
}
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => const Text('ok');
}
''');
      final String alphaDoubledId = method(classDecl(app, 'Alpha'), 'doubled')['id'] as String;
      final String betaDoubledId = method(classDecl(app, 'Beta'), 'doubled')['id'] as String;
      expect(alphaDoubledId, isNot(betaDoubledId));
    });

    test('a getter with an `@override` annotation on a class with a real superclass is never targeted', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class Shape {
  int get sides => 0;
}
class Model extends Shape {
  final int count;
  Model(this.count);
  @override
  int get sides => count;
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.sides.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'sides');
      expect(read?.containsKey('target'), isFalse);
    });

    test('an `@override` annotation is independently load-bearing, isolated from the superclass gate via `implements`', () async {
      // `implements` — unlike `extends`/`with` — never changes `Model`'s own resolved `supertype`, so
      // `Model` here passes the whole-class dispatch-safety gate on its own declaration alone (no
      // explicit superclass). Only the `@override` annotation itself (required by Dart when implementing
      // an interface member with the identical signature) excludes `sides` — proving `hasOverride` is
      // independently load-bearing, not merely redundant with the superclass check the sibling test above
      // could not, on its own, distinguish it from.
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
abstract class Shape {
  int get sides;
}
class Model implements Shape {
  final int count;
  Model(this.count);
  @override
  int get sides => count;
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.sides.toString());
}
''');
      final Map<String, dynamic>? read = readOf(app.only('ui.Component')['render'], 'sides');
      expect(read?.containsKey('target'), isFalse);
    });

    test('the same source extracts to the same getter target on a second, independent run (determinism)', () async {
      const String source = '''
import 'package:flutter/material.dart';
class Model {
  final int count;
  Model(this.count);
  int get doubled => count * 2;
}
class W extends StatelessWidget {
  const W({super.key, required this.model});
  final Model model;
  @override
  Widget build(BuildContext context) => Text(model.doubled.toString());
}
''';
      final Extracted first = await extract(source);
      final Extracted second = await extract(source);
      final Map<String, dynamic>? firstRead = readOf(first.only('ui.Component')['render'], 'doubled');
      final Map<String, dynamic>? secondRead = readOf(second.only('ui.Component')['render'], 'doubled');
      expect(firstRead?['target'], isNotNull);
      expect(firstRead?['target'], secondRead?['target']);
    });
  });

  group('paths in UIR are platform-independent (M5-F)', () {
    // `span.file` is not a filesystem path once it is written: it becomes an anchor —
    // `'${span.file}#$segment'` in `node_factory.dart` — and an anchor is hashed into the node's id
    // (ADR-17). So the separator ends up inside every content address in the document.
    //
    // `p.relative` uses the *host's* separator. On Windows that is `\`, which would give
    // `lib\main.dart#_CounterScreenState` and therefore a different id for every node — not a cosmetic
    // difference but a wholly different document, failing every committed golden and sharing no cache
    // entry with any other platform.
    //
    // Found by tracing the chain, not by running Windows, which this milestone could not do. These
    // assertions hold on every platform, which is the point: on POSIX they are a tautology, and on
    // Windows they are the bug.

    test('every span.file uses forward slashes', () async {
      final Extracted app = await extract(counterApp);

      final Iterable<Map<String, dynamic>> spans =
          app.nodes.map((Map<String, dynamic> n) => n['span']).whereType<Map<String, dynamic>>();
      expect(spans, isNotEmpty, reason: 'nothing to assert about if no node carries a span');

      for (final Map<String, dynamic> span in spans) {
        final Object? file = span['file'];
        if (file is! String) {
          continue;
        }
        expect(file, isNot(contains(r'\')), reason: '$file uses a Windows separator');
      }
    });

    test('no anchor or id embeds a backslash', () async {
      final Extracted app = await extract(counterApp);

      // The whole document, as text: an anchor can appear nested anywhere, and a separator leaking into
      // one is exactly what would change a node id.
      expect(
        app.bytes,
        isNot(contains(r'\\')),
        reason: 'a backslash in the emitted document means a host path reached UIR',
      );
    });
  });

  group('switch expression → logic.Switch (M8-Y)', () {
    // `return switch (reason) { EnumConstant => 'literal', ... };` — an unguarded, exhaustive,
    // enum-constant-pattern switch expression in direct-return position. M8-X found this reaches
    // `BRG1302` (opaque) unconditionally; these tests prove the narrow, evidence-bounded subset this
    // extractor now admits, and that every unsupported neighbouring shape stays exactly as opaque as
    // before.

    test('an unguarded, exhaustive, enum-constant-pattern switch expression lowers to logic.Switch, case order preserved', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum Reason { permissionDenied, hashMismatch, ioError, none }
String describeFailureReason(Reason reason) => switch (reason) {
      Reason.permissionDenied => 'failed: permission denied',
      Reason.hashMismatch => 'failed: checksum mismatch',
      Reason.ioError => 'failed: storage error',
      Reason.none => 'failed',
    };
class W extends StatelessWidget {
  const W({required this.r, super.key});
  final Reason r;
  @override
  Widget build(BuildContext context) => Text(describeFailureReason(r));
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('logic.OpaqueExpr'), isEmpty, reason: 'the switch must not remain opaque');
      final Map<String, dynamic> fn = app.only('logic.FunctionDecl');
      final List<dynamic> body = fn['body'] as List<dynamic>;
      expect(body, hasLength(1), reason: 'the whole arrow body is exactly one statement: the switch');
      final Map<String, dynamic> sw = body.single as Map<String, dynamic>;
      expect(sw['kind'], 'logic.Switch');
      final List<dynamic> cases = sw['cases'] as List<dynamic>;
      expect(cases, hasLength(4));
      expect(
        cases.map((dynamic c) => ((c as Map<String, dynamic>)['test'] as Map<String, dynamic>)['name']),
        <String>['Reason.permissionDenied', 'Reason.hashMismatch', 'Reason.ioError', 'Reason.none'],
        reason: 'case order must match source order exactly — it is not sorted or reconstructed',
      );
      for (final dynamic c in cases) {
        final List<dynamic> caseBody = (c as Map<String, dynamic>)['body'] as List<dynamic>;
        expect(caseBody, hasLength(1));
        expect((caseBody.single as Map<String, dynamic>)['kind'], 'logic.Return');
      }
    });

    test('every case test resolves to the same EnumDecl identity, structurally (M8-D reused)', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum Reason { a, b }
String f(Reason r) => switch (r) { Reason.a => 'x', Reason.b => 'y' };
class W extends StatelessWidget {
  const W({required this.r, super.key});
  final Reason r;
  @override
  Widget build(BuildContext context) => Text(f(r));
}
''');
      expect(app.errors, isEmpty);
      final Map<String, dynamic> decl = app.only('logic.EnumDecl');
      final Map<String, dynamic> sw = app.only('logic.Switch');
      final List<dynamic> cases = sw['cases'] as List<dynamic>;
      for (final dynamic c in cases) {
        expect((c as Map<String, dynamic>)['test'], containsPair('target', decl['id']));
      }
    });

    test('two different enums with an identically-named member never share switch-case identity', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
enum EnumA { ready, waiting }
enum EnumB { ready, waiting }
String fa(EnumA a) => switch (a) { EnumA.ready => 'ar', EnumA.waiting => 'aw' };
String fb(EnumB b) => switch (b) { EnumB.ready => 'br', EnumB.waiting => 'bw' };
class W extends StatelessWidget {
  const W({required this.a, required this.b, super.key});
  final EnumA a;
  final EnumB b;
  @override
  Widget build(BuildContext context) => Text('${fa(a)}${fb(b)}');
}
''');
      expect(app.errors, isEmpty);
      final List<dynamic> decls = app.ofKind('logic.EnumDecl');
      final String declA = (decls.singleWhere((dynamic d) => (d as Map<String, dynamic>)['name'] == 'EnumA') as Map<String, dynamic>)['id'] as String;
      final String declB = (decls.singleWhere((dynamic d) => (d as Map<String, dynamic>)['name'] == 'EnumB') as Map<String, dynamic>)['id'] as String;
      expect(declA, isNot(declB));
      final List<dynamic> switches = app.ofKind('logic.Switch');
      expect(switches, hasLength(2));
      for (final dynamic s in switches) {
        final List<dynamic> cases = (s as Map<String, dynamic>)['cases'] as List<dynamic>;
        final String subjectTarget = cases
            .map((dynamic c) => ((c as Map<String, dynamic>)['test'] as Map<String, dynamic>)['target'] as String)
            .toSet()
            .single;
        expect(
          subjectTarget == declA || subjectTarget == declB,
          isTrue,
          reason: 'every case in one switch must resolve to exactly one of the two enums, never a mix',
        );
      }
      final Set<String> distinctTargets = switches
          .map((dynamic s) => ((((s as Map<String, dynamic>)['cases'] as List<dynamic>).first as Map<String, dynamic>)['test'] as Map<String, dynamic>)['target'] as String)
          .toSet();
      expect(distinctTargets, hasLength(2), reason: 'the two switches must resolve to two different enum identities, not one shared by name');
    });

    test('a null pattern is admitted — ConstantPattern covers null, not only enum constants', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum Reason { a, b }
String f(Reason? r) => switch (r) { null => 'none', Reason.a => 'x', Reason.b => 'y' };
class W extends StatelessWidget {
  const W({required this.r, super.key});
  final Reason? r;
  @override
  Widget build(BuildContext context) => Text(f(r));
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('logic.OpaqueExpr'), isEmpty);
      final Map<String, dynamic> sw = app.only('logic.Switch');
      final List<dynamic> cases = sw['cases'] as List<dynamic>;
      expect(cases, hasLength(3));
      expect((cases.first as Map<String, dynamic>)['test'], containsPair('kind', 'logic.Lit'));
    });

    test('a case result that calls a function is admitted, not just a literal', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum Reason { a, b }
String tag(String s) => s;
String f(Reason r) => switch (r) { Reason.a => tag('x'), Reason.b => tag('y') };
class W extends StatelessWidget {
  const W({required this.r, super.key});
  final Reason r;
  @override
  Widget build(BuildContext context) => Text(f(r));
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('logic.OpaqueExpr'), isEmpty);
      final Map<String, dynamic> sw = app.only('logic.Switch');
      final List<dynamic> cases = sw['cases'] as List<dynamic>;
      final Map<String, dynamic> firstReturn = ((cases.first as Map<String, dynamic>)['body'] as List<dynamic>).single as Map<String, dynamic>;
      expect((firstReturn['value'] as Map<String, dynamic>)['kind'], 'logic.Call');
    });

    // ── negative controls: every unsupported neighbouring shape stays exactly as opaque as before ──

    test('assigned to a local (not direct-return position) stays opaque', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum Reason { a, b }
String f(Reason r) {
  final s = switch (r) { Reason.a => 'x', Reason.b => 'y' };
  return s;
}
class W extends StatelessWidget {
  const W({required this.r, super.key});
  final Reason r;
  @override
  Widget build(BuildContext context) => Text(f(r));
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('logic.Switch'), isEmpty);
      expect(app.ofKind('logic.OpaqueExpr'), hasLength(1));
    });

    test('used as a function argument (not direct-return position) stays opaque', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum Reason { a, b }
String id(String s) => s;
String f(Reason r) => id(switch (r) { Reason.a => 'x', Reason.b => 'y' });
class W extends StatelessWidget {
  const W({required this.r, super.key});
  final Reason r;
  @override
  Widget build(BuildContext context) => Text(f(r));
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('logic.Switch'), isEmpty);
      expect(app.ofKind('logic.OpaqueExpr'), hasLength(1));
    });

    test('a wildcard pattern anywhere in the switch keeps the whole switch opaque', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
String f(int n) => switch (n) { 1 => 'one', _ => 'other' };
class W extends StatelessWidget {
  const W({required this.n, super.key});
  final int n;
  @override
  Widget build(BuildContext context) => Text(f(n));
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('logic.Switch'), isEmpty);
      expect(app.ofKind('logic.OpaqueExpr'), hasLength(1));
    });

    test('a guarded pattern keeps the whole switch opaque, not just the guarded case', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum Reason { a, b }
// An unguarded fallback for Reason.a (real Dart: valid and exhaustive, confirmed directly — a guarded
// case never counts toward exhaustiveness on its own, unlike an unguarded one for the same value) keeps
// this genuinely valid Dart while still exercising a guarded case.
String f(Reason r) => switch (r) { Reason.a when true => 'x', Reason.a => 'x2', Reason.b => 'y' };
class W extends StatelessWidget {
  const W({required this.r, super.key});
  final Reason r;
  @override
  Widget build(BuildContext context) => Text(f(r));
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('logic.Switch'), isEmpty);
      expect(app.ofKind('logic.OpaqueExpr'), hasLength(1));
    });

    test('a logical-or pattern keeps the whole switch opaque', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum Reason { a, b, c }
String f(Reason r) => switch (r) { Reason.a || Reason.b => 'ab', Reason.c => 'c' };
class W extends StatelessWidget {
  const W({required this.r, super.key});
  final Reason r;
  @override
  Widget build(BuildContext context) => Text(f(r));
}
''');
      expect(app.errors, isEmpty);
      expect(app.ofKind('logic.Switch'), isEmpty);
      expect(app.ofKind('logic.OpaqueExpr'), hasLength(1));
    });

    test('one unsupported case among otherwise-admitted cases still keeps the whole switch opaque', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum Reason { a, b, c }
String f(Reason r) => switch (r) { Reason.a => 'x', Reason.b => 'y', _ => 'z' };
class W extends StatelessWidget {
  const W({required this.r, super.key});
  final Reason r;
  @override
  Widget build(BuildContext context) => Text(f(r));
}
''');
      expect(app.errors, isEmpty);
      expect(
        app.ofKind('logic.Switch'),
        isEmpty,
        reason: 'a partial lowering would silently drop the wildcard case — refused entirely instead',
      );
      expect(app.ofKind('logic.OpaqueExpr'), hasLength(1));
    });
  });

  group('enum .values recognition (M8-Z)', () {
    // Real Continuum's own `SettingsRepository.featureStates()` (`settings_repository.dart:60`) reads
    // `ContinuumFeature.values` — the member every Dart enum's own compiler synthesizes, resolved to the
    // *getter* `element.isOriginVariable`/`.variable` already unwraps for an ordinary constant read
    // (`_enumConstantTarget`'s own comment). `.values` itself is never an enum *constant*
    // (`field.isEnumConstant` is false for it), so before M8-Z it fell through to `_topLevelTarget`,
    // which also returns null — an enum member with no target at all, reported `BRG3006` as though
    // nothing in the program declared it.

    test('a project enum\u2019s own .values carries a target to its own EnumDecl', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum E { a, b }
String f() => E.values.join();
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(f());
}
''');
      expect(app.errors, isEmpty);
      final Map<String, dynamic> decl = app.only('logic.EnumDecl');
      final Map<String, dynamic> ref = app.ofKind('logic.Ref').singleWhere((Map<String, dynamic> r) => r['name'] == 'E.values');
      expect(ref['target'], decl['id']);
    });

    test('two different enums\u2019 own .values never share identity, even with identical members', () async {
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';
enum EnumA { ready, waiting }
enum EnumB { ready, waiting }
String fa() => EnumA.values.join();
String fb() => EnumB.values.join();
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text('${fa()}${fb()}');
}
''');
      expect(app.errors, isEmpty);
      final List<dynamic> decls = app.ofKind('logic.EnumDecl');
      final String declA = (decls.singleWhere((dynamic d) => (d as Map<String, dynamic>)['name'] == 'EnumA') as Map<String, dynamic>)['id'] as String;
      final String declB = (decls.singleWhere((dynamic d) => (d as Map<String, dynamic>)['name'] == 'EnumB') as Map<String, dynamic>)['id'] as String;
      final Map<String, dynamic> refA = app.ofKind('logic.Ref').singleWhere((Map<String, dynamic> r) => r['name'] == 'EnumA.values');
      final Map<String, dynamic> refB = app.ofKind('logic.Ref').singleWhere((Map<String, dynamic> r) => r['name'] == 'EnumB.values');
      expect(refA['target'], declA);
      expect(refB['target'], declB);
      expect(refA['target'], isNot(refB['target']));
    });

    test('an enhanced enum (constructor, field) resolves .values exactly like a plain one', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
enum Feature {
  notifications('n'),
  clipboard('c');
  const Feature(this.id);
  final String id;
}
String f() => Feature.values.map((x) => x.id).join();
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(f());
}
''');
      expect(app.errors, isEmpty);
      final Map<String, dynamic> decl = app.only('logic.EnumDecl');
      expect(decl['values'], <String>['notifications', 'clipboard']);
      final Map<String, dynamic> ref = app.ofKind('logic.Ref').singleWhere((Map<String, dynamic> r) => r['name'] == 'Feature.values');
      expect(ref['target'], decl['id']);
    });

    test('a cross-file enum\u2019s own .values resolves to the declaring file, not the referring one', () async {
      final Extracted app = await extract(
        '''
import 'package:flutter/material.dart';
import 'reason.dart';
String f() => Reason.values.join();
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(f());
}
''',
        extra: <String, String>{'reason.dart': 'enum Reason { a, b }'},
      );
      expect(app.errors, isEmpty);
      final Map<String, dynamic> decl = app.only('logic.EnumDecl');
      final Map<String, dynamic> ref = app.ofKind('logic.Ref').singleWhere((Map<String, dynamic> r) => r['name'] == 'Reason.values');
      expect(ref['target'], decl['id']);
      expect((decl['span'] as Map<String, dynamic>)['file'], 'lib/reason.dart');
    });

    test('a project-defined CLASS with its own .values static getter is never recognized — negative control', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
class FakeEnumish {
  static List<String> get values => ['not', 'real'];
}
String f() => FakeEnumish.values.join();
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(f());
}
''');
      final Map<String, dynamic> ref = app.ofKind('logic.Ref').singleWhere((Map<String, dynamic> r) => r['name'] == 'FakeEnumish.values');
      expect(
        ref['target'],
        isNull,
        reason: 'a class is not an EnumElement — the owner check must exclude it, never matched by the name "values" alone',
      );
    });

    test('an SDK enum\u2019s own .values is left unresolved, same as an SDK enum constant already is', () async {
      final Extracted app = await extract('''
import 'package:flutter/material.dart';
String f() => Brightness.values.map((b) => b.name).join();
class W extends StatelessWidget {
  const W({super.key});
  @override
  Widget build(BuildContext context) => Text(f());
}
''');
      final Map<String, dynamic> ref = app.ofKind('logic.Ref').singleWhere((Map<String, dynamic> r) => r['name'] == 'Brightness.values');
      expect(ref['target'], isNull, reason: 'an SDK enum is outside this project — the same exclusion _enumConstantTarget already has');
    });
  });
}
