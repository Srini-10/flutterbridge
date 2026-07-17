/// The analyzer half of the cross-language build-proof (M3-D).
///
/// The generator's `build.test.ts` typechecks emitted React against the real runtime kit. For years it
/// did so against a **hand-built** UIR — a program no analyzer run ever produced — and that is exactly
/// how the child-slot mismatch (validation B1) survived: the fixture put a single child in `slots`, which
/// is what the generator wants, while the real analyzer put it in `children`, which is what broke. A build
/// proof over an imagined program proves nothing about the real one.
///
/// So the build-proof is now grounded in a **committed golden UIR** (`fixtures/uir/layout_proof.ndjson`)
/// that the generator consumes. This test is the other half of the contract: it runs the **real analyzer**
/// over the fixture's Flutter source and asserts the golden is byte-for-byte what the analyzer produces.
///
/// Together they fail on drift in either direction: change the analyzer's output shape and this test fails
/// (regenerate the golden); regenerate a golden the generator cannot build and `build.test.ts` fails. The
/// source of truth is one thing — [layoutProofSource] — and the golden is derived from it, here.
@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

import 'support/temp_project.dart';

/// A stand-in `flutter` with the widgets the fixture uses. Recognition is by resolved supertype, so these
/// are genuine classes; `Center`, `EdgeInsets` and `runApp` are the ones the shared stub does not already
/// carry.
final Map<String, String> layoutFlutter = <String, String>{
  ...flutterPackage,
  'widgets.dart':
      '${flutterPackage['widgets.dart']!}\n'
      '''
class Center extends Widget {
  const Center({this.child, super.key});
  final Widget? child;
}

class EdgeInsets {
  const EdgeInsets.all(this.value);
  final double value;
}

void runApp(Widget app) {}
''',
};

/// The fixture: the whole generatable surface, in one screen. Component-scoped signal (`_count`), single-
/// child slots (`Center`/`Padding`/`SizedBox`), multi-child lists (`Column`/`Row`), a kit value type
/// (`EdgeInsets`), and the initial route. **No store** — a `ChangeNotifier`'s `notifyListeners` has no
/// lowering yet (validation C1), so a store makes the program un-generatable and cannot sit in a build proof.
const String layoutProofSource = r'''
import 'package:flutter/material.dart';

void main() => runApp(const MaterialApp(home: HomeScreen()));

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _count = 3;

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: <Widget>[
              Text('count: $_count'),
              const SizedBox(height: 8),
              Row(
                children: const <Widget>[Text('a'), SizedBox(width: 4), Text('b')],
              ),
              const SizedBox(width: 20, child: Text('boxed')),
            ],
          ),
        ),
      );
}
''';

void main() {
  test('the committed build-proof golden is exactly what the analyzer produces', () async {
    final String project = createProject(
      name: 'layout_proof',
      libraries: <String, String>{'main.dart': layoutProofSource},
      dependencies: <String, Map<String, String>>{'flutter': layoutFlutter},
    );
    final Directory out = Directory.systemTemp.createTempSync('build_proof_');
    addTearDown(() => out.deleteSync(recursive: true));

    final AnalyzerResult result = await const BridgeAnalyzer().run(
      AnalyzerRequest(projectRoot: project, outputPath: p.join(out.path, 'uir.ndjson')),
    );
    expect(result.status, RunStatus.completed, reason: 'the fixture must analyze cleanly');
    expect(
      result.diagnostics.where((Diagnostic d) => d.severity == Severity.error),
      isEmpty,
    );

    final String produced = File(result.output!.outputPath).readAsStringSync();

    // The golden lives beside the other UIR fixtures, four directories up from this test file.
    final String goldenPath = p.normalize(
      p.join(
        p.dirname(Platform.script.toFilePath()),
        '..',
        '..',
        '..',
        'fixtures',
        'uir',
        'layout_proof.ndjson',
      ),
    );
    final File golden = File(goldenPath);
    // A relative path from the package root also works when the test is run from there; prefer whichever
    // exists so the test is robust to how `dart test` computes `Platform.script`.
    final File resolved = golden.existsSync()
        ? golden
        : File('../../fixtures/uir/layout_proof.ndjson').existsSync()
        ? File('../../fixtures/uir/layout_proof.ndjson')
        : File('fixtures/uir/layout_proof.ndjson');

    expect(
      resolved.existsSync(),
      isTrue,
      reason: 'fixtures/uir/layout_proof.ndjson is missing — regenerate it from this fixture',
    );

    expect(
      produced,
      resolved.readAsStringSync(),
      reason:
          'The analyzer no longer produces the committed build-proof golden. If this is an intended change, '
          'regenerate fixtures/uir/layout_proof.ndjson and re-run build.test.ts to confirm the generator '
          'still builds it. If it is not, the analyzer has drifted from what the generator expects.',
    );

    // A guard on the fixture itself: it must exercise the shapes the proof exists for, so a future edit
    // cannot quietly reduce it to something that proves less.
    final List<Map<String, Object?>> nodes = produced
        .split('\n')
        .where((String l) => l.isNotEmpty)
        .map((String l) => jsonDecode(l) as Map<String, Object?>)
        .toList();
    bool anyElementWithChildSlot = false;
    void walk(Object? value) {
      if (value is Map<String, Object?>) {
        final Object? slots = value['slots'];
        if (value['kind'] == 'ui.Element' && slots is Map<String, Object?> && slots.containsKey('child')) {
          anyElementWithChildSlot = true;
        }
        value.values.forEach(walk);
      } else if (value is List<Object?>) {
        value.forEach(walk);
      }
    }

    nodes.forEach(walk);
    expect(
      anyElementWithChildSlot,
      isTrue,
      reason: 'the fixture must keep a single-child wrapper, whose `child` is a slot — that is B1',
    );
  });
}
