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
            Text(describeFailureReason(FailureReason.hashMismatch)),
            Text(describeStage(null)),
            Text(describeStage(Stage.ready)),
            Text(describeSide(Side.left)),
          ],
        ),
      );
}

// ── An unguarded, exhaustive, enum-constant-pattern switch expression in direct-return
// position (M8-Y's own proven-safe subset, exactly). ────────────────────────────────────
enum FailureReason { permissionDenied, hashMismatch, ioError, none }

String describeFailureReason(FailureReason reason) => switch (reason) {
      FailureReason.permissionDenied => 'failed: permission denied',
      FailureReason.hashMismatch => 'failed: checksum mismatch',
      FailureReason.ioError => 'failed: storage error',
      FailureReason.none => 'failed',
    };

// ── A second, independently-shaped enum switch — proves the subset is not hard-coded to
// FailureReason's own 4 members, and exercises the null-pattern rung. ───────────────
enum Stage { idle, ready }

String describeStage(Stage? stage) => switch (stage) {
      null => 'no stage',
      Stage.idle => 'idle',
      Stage.ready => 'ready',
    };

// ── A case result that calls a function, not just a literal. ────────────────────────────
enum Side { left, right }

String _label(String s) => s.toUpperCase();

String describeSide(Side side) => switch (side) {
      Side.left => _label('left'),
      Side.right => _label('right'),
    };
