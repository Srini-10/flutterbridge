import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Numerics()));
}

// ── App B's real shapes, verbatim ────────────────────────────────────────────────────────────────

/// `features/products/lib/src/presentation/format_pct.dart`
String formatPct(double v) =>
    v == v.roundToDouble() ? v.round().toString() : v.toStringAsFixed(2);

/// `packages/design_system/lib/src/admin/admin_charts.dart`
String compact(double v) {
  if (v.abs() >= 1000) {
    final k = v / 1000;
    return '${k.toStringAsFixed(k.truncateToDouble() == k ? 0 : 1)}k';
  }
  return v.truncateToDouble() == v
      ? v.toInt().toString()
      : v.toStringAsFixed(1);
}

/// `packages/design_system/lib/src/admin/admin_format.dart`: `n is double && n != n.truncateToDouble()`.
String adminCount(num v) {
  final sign = v < 0 ? '-' : '';
  final n = v.abs();
  final hasFraction = n is double && n != n.truncateToDouble();
  final fraction = hasFraction
      ? '.${n.toStringAsFixed(2).split('.').last}'
      : '';
  return '$sign${n.truncate()}$fraction';
}

/// `features/orders/lib/src/domain/gst_estimate.dart`
String fmt(double r) =>
    r == r.roundToDouble() ? r.toStringAsFixed(0) : r.toStringAsFixed(2);

/// `features/orders/lib/src/domain/cart.dart`'s `roundedLineTotal`: money rounded to the paisa.
double roundedLineTotal(double unit, int qty) => (unit * qty * 100).roundToDouble() / 100;

/// `features/agents/lib/src/presentation/agents_page.dart`: a width floored to a whole pixel.
double cellWidth(double maxWidth) {
  final cols = maxWidth >= 720 ? 4 : 2;
  const gap = 16.0;
  return ((maxWidth - gap * (cols - 1)) / cols).floorToDouble();
}

/// `features/notifications/lib/src/data/device_identity.dart`: bytes as two hex digits each.
String hex(List<int> bytes) => bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();

/// `features/orders/lib/src/presentation/cart_page.dart`'s `cartIdempotencyKey` hash (FNV-1a in two 16-bit halves), over a list of codes.
String fnvKey(int count, List<int> codes) {
  var hash = 0x811c9dc5;
  for (final code in codes) {
    hash ^= code;
    final lo = (hash & 0xffff) * 0x01000193;
    final hi = ((hash >> 16) * 0x01000193) & 0xffff;
    hash = (lo + (hi << 16)) & 0xffffffff;
  }
  return 'cart-$count-${hash.toRadixString(16)}';
}

class Numerics extends StatelessWidget {
  const Numerics({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${formatPct(20.0)} ${formatPct(20.5)} ${formatPct(-3.0)} ${formatPct(0.0)} ${formatPct(99.999)} ${formatPct(0.5)} ${formatPct(-0.5)}'),
        Text('> ${compact(12.0)} ${compact(12.5)} ${compact(1500.0)} ${compact(1234.0)} ${compact(-2000.0)} ${compact(999.5)}'),
        Text('> ${adminCount(0)} ${adminCount(1234)} ${adminCount(12.5)} ${adminCount(-7.25)} ${adminCount(-3)}'),
        Text('> ${fmt(5.0)} ${fmt(12.0)} ${fmt(2.5)} ${fmt(0.0)} ${fmt(18.125)}'),
        Text('> ${roundedLineTotal(19.99, 3)} ${roundedLineTotal(0.125, 1)} ${roundedLineTotal(10.0, 0)} ${roundedLineTotal(33.335, 3)} ${roundedLineTotal(-1.005, 2)}'),
        Text('> ${cellWidth(1000.0)} ${cellWidth(700.0)} ${cellWidth(719.9)} ${cellWidth(0.0)}'),
        Text('> ${hex([0, 15, 16, 255, 171])} ${hex([])}'),
        Text('> ${fnvKey(2, [97, 58, 49, 124, 98])} ${fnvKey(0, [])} ${fnvKey(1, [255])}'),
        Text('> ${(-0.4).roundToDouble()} ${(-0.5).roundToDouble()} ${0.5.roundToDouble()} ${(-0.5).truncateToDouble()} ${(-0.0).floorToDouble()} ${2.5.roundToDouble()} ${(-2.5).roundToDouble()}'),
        Text('> ${double.nan.roundToDouble()} ${double.infinity.floorToDouble()} ${double.negativeInfinity.truncateToDouble()} ${1e21.roundToDouble()} ${7.roundToDouble()}'),
        Text('> ${255.toRadixString(2)} ${255.toRadixString(36)} ${(-255).toRadixString(16)} ${0.toRadixString(2)} ${9007199254740991.toRadixString(36)}'),
      ],
    );
  }
}
