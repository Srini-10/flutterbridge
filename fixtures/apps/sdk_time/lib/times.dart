import 'package:collection/collection.dart';

String dates() {
  final DateTime a = DateTime(2024, 3, 5, 10, 20, 30, 4);
  final DateTime b = a.add(const Duration(days: 2, hours: 1));
  final DateTime u = DateTime.utc(2020, 1, 2, 3, 4, 5);
  final DateTime p = DateTime.parse('2021-12-31 23:59:58');
  final DateTime z = DateTime.parse('2021-12-31T23:59:58Z');
  return '$a | ${a.toIso8601String()} | ${b.day} ${b.hour} ${b.weekday} | ${b.difference(a).inMinutes} | $u ${u.toIso8601String()} | ${p.year} ${p.month} ${p.second} | ${z.isUtc} $z';
}

String compare() {
  final DateTime a = DateTime.utc(2024, 1, 1);
  final DateTime b = DateTime.utc(2024, 1, 2);
  return '${a.isBefore(b)} ${a.isAfter(b)} ${a.isAtSameMomentAs(DateTime.utc(2024, 1, 1))} ${a == DateTime.utc(2024, 1, 1)} ${a.compareTo(b)} ${a.millisecondsSinceEpoch} ${DateTime.utc(2024, 3, 10).weekday} ${DateTime.utc(2024, 3, 11).weekday}';
}

String parsed() {
  try {
    DateTime.parse('not a date');
    return 'no';
  } on FormatException {
    return 'format';
  }
}

String deep() {
  const DeepCollectionEquality eq = DeepCollectionEquality();
  final List<Object> x = <Object>[1, <int>[2, 3], <String, int>{'a': 1}];
  final List<Object> y = <Object>[1, <int>[2, 3], <String, int>{'a': 1}];
  final List<Object> z = <Object>[1, <int>[2, 4], <String, int>{'a': 1}];
  return '${eq.equals(x, y)} ${eq.equals(x, z)} ${eq.hash(x) == eq.hash(y)} ${x == y}';
}

Future<String> later() async {
  final int v = await Future<int>.value(3);
  final int w = await Future<int>.delayed(const Duration(milliseconds: 1), () => 4);
  final int m = await Future<int>.microtask(() => 5);
  return '$v $w $m';
}

String parses() {
  final int? bad = int.tryParse('x');
  final double? d = double.tryParse('1.5e2');
  return '${int.parse('12')} ${int.parse(' 7 ')} ${int.parse('ff', radix: 16)} ${int.parse('0x1f')} $bad $d ${double.parse('.5')} ${double.tryParse('1.2.3')} ${int.tryParse('')}';
}

String label(String name, {int times = 1, String? suffix, required bool loud}) {
  final String base = name * times;
  return '${loud ? base.toUpperCase() : base}${suffix ?? ''}';
}

Future<int> total({required int a, int b = 10}) async {
  await Future<void>.delayed(const Duration(milliseconds: 1));
  return a + b;
}

Future<String> awaited() async {
  final List<int> all = await Future.wait<int>(<Future<int>>[total(a: 1), total(a: 2, b: 5)]);
  return '${label('ab', times: 2, loud: true)} ${label('x', loud: false, suffix: '!')} ${all.join(',')}';
}
