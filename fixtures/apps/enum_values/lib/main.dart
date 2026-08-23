import 'package:flutter/material.dart';

void main() => runApp(const App());

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF3F51B5))),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(
          children: [
            Text(aSimplest()),
            Text('${dLength()}'),
            Text(eIndexing()),
            Text(fRepeated()),
            Text(gCollision()),
            Text(featureNames()),
            Text(nStoredInLocal()),
            Text(oReturnedFromFunction()),
          ],
        ),
      );
}

// ── A: simplest project enum ──────────────────────────────────────────────
enum Stage { idle, ready }

String aSimplest() => Stage.values.join();

// ── D: .length ───────────────────────────────────────────────────────────
int dLength() => Stage.values.length;

// ── E: indexing ──────────────────────────────────────────────────────────
String eIndexing() => '${Stage.values[0]}';

// ── F: repeated reads ────────────────────────────────────────────────────
String fRepeated() {
  final first = Stage.values;
  final second = Stage.values;
  return '${first.length}${second.length}';
}

// ── G: same member names across two different enums ────────────────────
enum G1 { ready, waiting }
enum G2 { ready, waiting }

String gCollision() => '${G1.values.join()}${G2.values.join()}';

// ── An enhanced enum, with a constructor and a field. `.values` itself is what
// this milestone targets; per-element field access (`.id`) is a separate,
// already-known gap (no runtime kit or generated declaration models a Dart
// enum's own *type* today — M8-V's own finding) and is deliberately not
// exercised here. ──
enum Feature {
  notifications('notifications'),
  clipboard('clipboard'),
  files('files'),
  battery('battery');

  const Feature(this.id);

  /// Stable key used in storage.
  final String id;
}

String featureNames() => Feature.values.join(',');

// ── N: enum values stored in a local ─────────────────────────────────────
String nStoredInLocal() {
  final all = Stage.values;
  return all.join();
}

// ── O: enum values returned from a function ───────────────────────────────
List<Stage> _allStages() => Stage.values;
String oReturnedFromFunction() => _allStages().join();
