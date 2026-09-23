import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Ints()));
}

// ── App B's real int.toString shapes (shortened only where a neighbouring, unrelated method has no lowering yet) ──

/// `admin_format.dart`'s `adminCount`: `n.truncate().toString()` on a `num`, fed to a grouping helper.
String count(num v) {
  final sign = v < 0 ? '-' : '';
  final n = v.abs();
  return '$sign${_groupIndian(n.truncate().toString())}';
}

String _groupIndian(String digits) {
  if (digits.length <= 3) return digits;
  final last3 = digits.substring(digits.length - 3);
  var rest = digits.substring(0, digits.length - 3);
  final parts = <String>[];
  while (rest.length > 2) {
    parts.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) parts.insert(0, rest);
  return '${parts.join(',')},$last3';
}

/// `format_pct.dart`'s `formatPct`: `v.round().toString()` chosen by a whole-number test.
String pct(double v) => v == v.round().toDouble() ? v.round().toString() : v.toStringAsFixed(2);

/// `admin_charts.dart`'s `_compact`: `v.toInt().toString()`.
String compact(double v) => v.toInt().toString();

/// `audit_log_page.dart`'s `_formatTimestamp`: `DateTime` fields, an `int`, padded.
String timestamp(DateTime time) {
  final h = time.hour.toString().padLeft(2, '0');
  final m = time.minute.toString().padLeft(2, '0');
  return '${time.day}/${time.month}/${time.year}, $h:$m';
}

// ── every kind of int, and the edges ─────────────────────────────────────────────────────────────

int triple(int x) => x * 3;

String nullable(int? n) => n.toString();

String nullAware(int? n) => n?.toString() ?? 'none';

class Ints extends StatelessWidget {
  const Ints({super.key});

  @override
  Widget build(BuildContext context) {
    const int zero = 0;
    const int negative = -42;
    const int big = 9007199254740991;
    const int small = -9007199254740991;
    final int sum = zero + 15;
    return Column(
      children: [
        Text('> ${zero.toString()} ${negative.toString()} ${big.toString()} ${small.toString()} ${sum.toString()} ${5.toString()}'),
        Text('> ${triple(7).toString()} ${(negative - 8).toString()} ${(big ~/ 7).toString()} ${triple(-4).toString().length}'),
        Text('> ${count(0)} ${count(999)} ${count(1234567.9)} ${count(-98765)}'),
        Text('> ${pct(20.0)} ${pct(20.5)} ${pct(-3.0)} ${pct(0.0)} ${pct(99.999)}'),
        Text('> ${compact(12.9)} ${compact(-12.9)} ${compact(0.4)} ${compact(-0.4)}'),
        Text('> ${timestamp(DateTime(2026, 3, 5, 7, 4))} ${timestamp(DateTime(2026, 12, 25, 23, 59))} ${timestamp(DateTime(2026, 1, 1))}'),
        Text('> ${nullable(null)} ${nullable(12)} ${nullAware(null)} ${nullAware(-3)}'),
        const Doubles(),
      ],
    );
  }
}

class Doubles extends StatelessWidget {
  const Doubles({super.key});

  @override
  Widget build(BuildContext context) {
    const double whole = 1.0;
    const double fraction = 0.1;
    const double hundred = 100.0;
    const double huge = 1e21;
    const double tiny = 1e-7;
    const double negZero = -0.0;
    const double nan = double.nan;
    const double inf = double.infinity;
    return Column(
      children: [
        Text('> ${whole.toString()} ${fraction.toString()} ${hundred.toString()} ${(0.1 + 0.2).toString()} ${(-2.5).toString()}'),
        Text('> ${huge.toString()} ${tiny.toString()} ${negZero.toString()} ${nan.toString()} ${inf.toString()} ${(-inf).toString()}'),
      ],
    );
  }
}
