// Generates `dart_numeric_cases.json`: real Dart's answer for `roundToDouble`, `floorToDouble`, `truncateToDouble` and `int.toRadixString`.
//
//   dart run tests/dart_numeric_cases.gen.dart > tests/dart_numeric_cases.json
//
// Every double result is written with its sign bit visible (`-0.0`), because Dart's `roundToDouble`/`floorToDouble`/`truncateToDouble` keep the sign of
// a zero result (`(-0.4).roundToDouble()` is `-0.0`) and JavaScript's `Math.round`/`floor`/`trunc` do too — but only if the implementation does not
// go through an operation that loses it. `NaN`/`Infinity`/`-Infinity` are spelled out; a thrown error is `"THROW"`.
import 'dart:convert';
import 'dart:io';

String d(double v) {
  if (v.isNaN) return 'NaN';
  if (v == double.infinity) return 'Infinity';
  if (v == double.negativeInfinity) return '-Infinity';
  return v.toString(); // `-0.0`, `0.5`, `4503599627370497.0`, `1e+21`…
}

void main() {
  final List<double> values = <double>[
    0.0, -0.0, 0.4, -0.4, 0.5, -0.5, 0.6, -0.6, 1.0, -1.0, 1.4999999999999998, 1.5, -1.5, 2.5, -2.5, 3.5, -3.5, 0.49999999999999994,
    -0.49999999999999994, 99.995, 100.005, 12345.6789, -12345.6789, 4503599627370495.5, 4503599627370496.0, 4503599627370497.0, -4503599627370495.5,
    9007199254740991.0, -9007199254740991.0, 9007199254740992.0, 1e21, -1e21, 1e-7, -1e-7, 5e-324, -5e-324, double.maxFinite, double.nan,
    double.infinity, double.negativeInfinity,
  ];
  final List<List<Object?>> rows = <List<Object?>>[];
  for (final double v in values) {
    rows.add(<Object?>['roundToDouble', d(v), d(v.roundToDouble())]);
    rows.add(<Object?>['floorToDouble', d(v), d(v.floorToDouble())]);
    rows.add(<Object?>['truncateToDouble', d(v), d(v.truncateToDouble())]);
  }
  final List<int> ints = <int>[0, 1, -1, 7, 10, 15, 16, 35, 36, 255, -255, 4096, 65535, 123456789, -987654321, 9007199254740991, -9007199254740991];
  for (final int n in ints) {
    for (final int radix in <int>[2, 8, 10, 16, 36]) {
      rows.add(<Object?>['toRadixString', n, radix, n.toRadixString(radix)]);
    }
  }
  for (final int radix in <int>[1, 37, 0, -2, 100]) {
    Object? result;
    try {
      result = 5.toRadixString(radix);
    } catch (_) {
      result = 'THROW';
    }
    rows.add(<Object?>['toRadixString', 5, radix, result]);
  }
  stdout.writeln('[');
  for (var i = 0; i < rows.length; i++) {
    stdout.writeln('${jsonEncode(rows[i])}${i == rows.length - 1 ? '' : ','}');
  }
  stdout.writeln(']');
}
