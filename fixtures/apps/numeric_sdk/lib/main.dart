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
            Text(describeDuration(makeDuration())),
            Text(describeNullableDuration(null)),
            Text('${intLiteralToDouble()}'),
            Text('${intVarToDouble(3)}'),
            Text('${arithmeticToDouble(2, 3)}'),
            Text(doubleToStringAsFixed(3.14159)),
            Text(intToDoubleToStringAsFixed(2097152)),
            Text(variablePrecision(1.0, 2)),
            Text(formatUptimeLike(const Duration(minutes: 65))),
            Text(formatBytesLike(2097152)),
          ],
        ),
      );
}

// ── Duration rungs (M8-V reduction ladder) ──────────────────────────────────

// A: Duration literal construction
Duration makeDuration() => const Duration(seconds: 5);

// B: Duration parameter + C/D/E: inSeconds/inMinutes/inHours
String describeDuration(Duration d) {
  final s = d.inSeconds;
  final m = d.inMinutes;
  final h = d.inHours;
  return '$s $m $h';
}

// M: nullable Duration
String describeNullableDuration(Duration? d) => d == null ? 'none' : '${d.inSeconds}';

// ── toDouble rungs ────────────────────────────────────────────────────────

// A: int literal .toDouble()
double intLiteralToDouble() => 5.toDouble();

// B: int variable .toDouble()
double intVarToDouble(int n) => n.toDouble();

// E: arithmetic expression then .toDouble()
double arithmeticToDouble(int a, int b) => (a + b).toDouble();

// ── toStringAsFixed rungs ────────────────────────────────────────────────────

// B: double variable .toStringAsFixed(n)
String doubleToStringAsFixed(double v) => v.toStringAsFixed(2);

// D: int-derived .toDouble().toStringAsFixed(n) — formatBytes's own real shape
String intToDoubleToStringAsFixed(int bytes) => bytes.toDouble().toStringAsFixed(1);

// N: variable precision
String variablePrecision(double v, int precision) => v.toStringAsFixed(precision);

// ── The exact real Continuum shapes (M8-U/M8-V's own primary acceptance cases) ──────────────────

/// `formatUptime`'s own exact real body (`continuum_ui_kit/src/settings_page.dart:26`) — the early-
/// return chain, the `Duration` parameter, the three getters, and the `int.remainder()` call.
String formatUptimeLike(Duration d) {
  if (d.inMinutes < 1) return '${d.inSeconds}s';
  if (d.inHours < 1) return '${d.inMinutes}m';
  return '${d.inHours}h ${d.inMinutes.remainder(60)}m';
}

/// `formatBytes`'s own exact real body (`continuum_ui_kit/continuum_ui_kit.dart:16`) — the `while`
/// loop, the mutable locals, the list literal, array indexing, the ternary, `.toDouble()`, and
/// `.toStringAsFixed()`.
String formatBytesLike(int bytes) {
  const List<String> units = ['B', 'KB', 'MB', 'GB'];
  var value = bytes.toDouble();
  var unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return '${value.toStringAsFixed(unit == 0 ? 0 : 1)} ${units[unit]}';
}
