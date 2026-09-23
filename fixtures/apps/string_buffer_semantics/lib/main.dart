import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Rupees()));
}

// ── App B's two real StringBuffer users, verbatim ────────────────────────────────────────────────

/// `packages/core/lib/src/utils/formatters.dart`: a buffer with initial content, written conditionally and in order.
String formatRupees(num amount, {int decimals = 0}) {
  final negative = amount < 0;
  final value = amount.abs().toStringAsFixed(decimals);
  final parts = value.split('.');
  final grouped = _groupIndian(parts[0]);
  final buffer = StringBuffer('₹');
  if (negative) buffer.write('-');
  buffer.write(grouped);
  if (parts.length > 1) buffer.write('.${parts[1]}');
  return buffer.toString();
}

String _groupIndian(String digits) {
  if (digits.length <= 3) return digits;
  final last3 = digits.substring(digits.length - 3);
  var rest = digits.substring(0, digits.length - 3);
  final groups = <String>[];
  while (rest.length > 2) {
    groups.insert(0, rest.substring(rest.length - 2));
    rest = rest.substring(0, rest.length - 2);
  }
  if (rest.isNotEmpty) groups.insert(0, rest);
  return '${groups.join(',')},$last3';
}

/// `features/dashboard/lib/src/data/csv_export.dart`: a cascade on construction, then `writeln` in a loop.
String buildCsv(List<String> headers, List<List<String>> rows) {
  final buffer = StringBuffer()..writeln(headers.map(_escape).join(','));
  for (final row in rows) {
    buffer.writeln(row.map(_escape).join(','));
  }
  return buffer.toString();
}

String _escape(String field) {
  if (field.contains(',') || field.contains('"') || field.contains('\n') || field.contains('\r')) {
    return '"${field.replaceAll('"', '""')}"';
  }
  return field;
}

/// The newline is what `writeln` appends; showing it as `|` keeps each result on one line.
String visible(String text) => text.replaceAll('\n', '|');

class Rupees extends StatelessWidget {
  const Rupees({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${formatRupees(0)} ${formatRupees(5)} ${formatRupees(999)} ${formatRupees(1000)}'),
        Text('> ${formatRupees(123456)} ${formatRupees(1234567)} ${formatRupees(-1234567)} ${formatRupees(12345678)}'),
        Text('> ${formatRupees(1234.5, decimals: 2)} ${formatRupees(-1234.25, decimals: 2)} ${formatRupees(0.75, decimals: 2)}'),
      ],
    );
  }
}

class Csv extends StatelessWidget {
  const Csv({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${visible(buildCsv(['id', 'name'], [['1', 'plain'], ['2', 'a,b'], ['3', 'say "hi"']]))}'),
        Text('> ${visible(buildCsv(['only'], []))}'),
        Text('> ${visible(buildCsv([], [['x']]))}'),
        Text('> ${visible(buildCsv(['h'], [['line\nbreak'], ['']]))}'),
      ],
    );
  }
}

// ── general behaviour ────────────────────────────────────────────────────────────────────────────

/// Every value kind `write` accepts prints as `"$value"` does.
String kinds() {
  final b = StringBuffer();
  const int i = 42;
  const int negative = -7;
  const double whole = 1.0;
  const double fraction = 2.5;
  const bool flag = true;
  const String? absent = null;
  const int? present = 3;
  const String? words = 'hi';
  final List<int> numbers = [1, 2];
  b
    ..write('s')
    ..write(i)
    ..write(negative)
    ..write(whole)
    ..write(fraction)
    ..write(flag)
    ..write(absent)
    ..write(present)
    ..write(words)
    ..write(numbers)
    ..write(null);
  return b.toString();
}

/// `writeln()` with and without an argument; a newline is `\n` and nothing else.
String lines() {
  final b = StringBuffer()
    ..writeln()
    ..writeln('a')
    ..write('b')
    ..writeln(1)
    ..writeln(2.0);
  return visible(b.toString());
}

/// Initial content of each kind.
String initial() {
  return '${StringBuffer('x')} ${StringBuffer(7)} ${StringBuffer(true)} ${StringBuffer(1.5)} [${StringBuffer('')}] [${StringBuffer()}]';
}

/// A buffer is an object: two references see each other's writes.
String shared() {
  final a = StringBuffer('x');
  final b = a;
  b.write('y');
  a.write('z');
  return 'a=$a b=$b';
}

void fill(StringBuffer target, int count) {
  for (var i = 0; i < count; i++) {
    if (i > 0) target.write(', ');
    target.write(i);
  }
}

StringBuffer make(String seed) {
  final b = StringBuffer(seed);
  b.write('!');
  return b;
}

/// Passed to a function that mutates it, returned from one, and interpolated.
String passed() {
  final b = make('go');
  fill(b, 4);
  final other = StringBuffer('[');
  other.write(b);
  other.write(']');
  return '$b | $other';
}

/// Argument evaluation order: the receiver, then the arguments left to right, each exactly once.
String tag(StringBuffer log, String s) {
  log.write('<$s>');
  return s;
}

StringBuffer pick(StringBuffer log, StringBuffer target) {
  log.write('[pick]');
  return target;
}

String order() {
  final log = StringBuffer();
  final target = StringBuffer();
  pick(log, target).write(tag(log, 'a') + tag(log, 'b'));
  target.writeln(tag(log, 'c'));
  return 'log=${log.toString()} target=${visible(target.toString())}';
}

/// A nullable buffer, through `?.` and after a null check.
String nullable(bool present) {
  StringBuffer? maybe = present ? StringBuffer('m') : null;
  maybe?.write('!');
  final text = maybe?.toString() ?? 'none';
  if (maybe != null) maybe.write('?');
  return '$text ${maybe ?? 'null'}';
}

enum Kind { a, b }

/// An *enhanced* enum is a class; its `toString` is `Level.high`.
enum Level {
  low(1),
  high(2);

  const Level(this.n);
  final int n;
}

class Tagged {
  const Tagged(this.id);
  final int id;

  @override
  String toString() => 'Tagged#$id';
}

/// A plain enum prints `Kind.b`, an enhanced one `Level.high`, a class its own `toString()` — as `"$value"` does.
String objects() {
  final b = StringBuffer(Kind.a)
    ..write(' ')
    ..write(Kind.b)
    ..write(' ')
    ..write(Level.high)
    ..write(' ')
    ..write(const Tagged(7));
  return b.toString();
}

class General extends StatelessWidget {
  const General({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${kinds()}'),
        Text('> ${lines()}'),
        Text('> ${initial()}'),
        Text('> ${shared()}'),
        Text('> ${passed()}'),
        Text('> ${order()}'),
        Text('> ${nullable(true)} / ${nullable(false)}'),
        Text('> ${objects()}'),
      ],
    );
  }
}
