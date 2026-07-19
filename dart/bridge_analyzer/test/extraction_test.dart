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
import 'package:test/test.dart';

import 'support/temp_project.dart';

/// Extracts a single-file app, and returns its UIR as JSON.
Future<Extracted> extract(String source, {Map<String, String> extra = const <String, String>{}}) async {
  final String project = createProject(
    name: 'app',
    libraries: <String, String>{'main.dart': source, ...extra},
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
      // as written would tell the generator to re-render on a change that never happened.
      final Extracted app = await extract(r'''
import 'package:flutter/material.dart';

class Store extends ChangeNotifier {
  int _count = 0;

  void report(int _count) {
    debugPrint('$_count');
  }

  void bump() {
    _count++;
    notifyListeners();
  }
}
''');

      expect(app.errors, isEmpty);
      expect(
        app.ofKind('sig.Action'),
        hasLength(1),
        reason: '`report` writes nothing: its `_count` is its own parameter',
      );
      expect(app.only('sig.Action').containsKey('params'), isFalse, reason: 'that action is `bump`');
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
}
