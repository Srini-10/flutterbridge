class Dto {
  Dto(this.id, {this.label = 'none'});

  factory Dto.fromJson(Map<String, Object?> json) => Dto(json['id']! as int, label: (json['label'] as String?) ?? 'none');

  final int id;
  final String label;

  String describe() => '$id/$label';
}

T identity<T>(T value) => value;

int need(int? value) => value ?? (throw 'missing');

String tryNeed(int? value) {
  try {
    return '${need(value)}';
  } catch (e) {
    return 'caught $e';
  }
}

String rethrown() {
  final List<String> log = <String>[];
  try {
    try {
      throw 'inner';
    } catch (e) {
      log.add('saw $e');
      rethrow;
    }
  } catch (e) {
    log.add('again $e');
  }
  return log.join(',');
}

class Buffer {
  final List<int> items = <int>[];
  String label = '';
  int total = 0;

  void add(int v) {
    items.add(v);
    total += v;
  }
}

Buffer makeBuffer() => Buffer()
  ..add(1)
  ..add(2)
  ..label = 'two'
  ..add(3);

class Maker {
  int made = 0;

  Buffer? make(bool present) {
    made++;
    return present ? makeBuffer() : null;
  }
}

/// The receiver of `?.` is evaluated once: `made` counts the calls.
String once() {
  final Maker m = Maker();
  final int? total = m.make(true)?.total;
  final int? none = m.make(false)?.total;
  final int? length = m.make(true)?.items.length;
  return '$total $none $length ${m.made}';
}

double? asDouble(Map<String, Object?> json, String key) => (json[key] as num?)?.toDouble();

String describeAll(List<Map<String, Object?>> maps) => maps.map(Dto.fromJson).map((Dto d) => d.describe()).join(' ');

String lists(bool flag, List<int> xs, [List<int>? extra]) {
  final List<int> a = <int>[0, if (flag) 1, ...xs, ...?extra, for (final int x in xs) x * 10, for (var i = 0; i < 2; i++) i + 100, if (!flag) 9 else 8];
  return a.join(',');
}

String sets(List<int> xs) {
  final Set<int> s = <int>{1, ...xs, for (final int x in xs) x + 1};
  return '${s.length} ${s.contains(4)}';
}

String maps(bool flag, Map<String, int> extra) {
  final Map<String, int> m = <String, int>{'a': 1, if (flag) 'b': 2, ...extra, for (final String k in <String>['x', 'y']) k: k.length};
  return '${m.length} ${m['a']} ${m['b']} ${m['c']} ${m['x']}';
}

String adjacent(int n) => 'count: $n, '
    'twice: ${n * 2}, '
    'done';

String castInt(Object? v) {
  try {
    final int n = v as int;
    return 'int $n';
  } catch (e) {
    return 'not int';
  }
}

String castNullable(Object? v) {
  try {
    final String? s = v as String?;
    return 'string ${s ?? 'null'}';
  } catch (e) {
    return 'not string';
  }
}

String castList(Object? v) {
  try {
    final List<int> xs = v as List<int>;
    return 'list ${xs.length}';
  } catch (e) {
    return 'not list';
  }
}

String castDto(Object? v) {
  try {
    final Dto? d = v as Dto?;
    return 'dto ${d?.id}';
  } catch (e) {
    return 'not dto';
  }
}

/// `round` (half away from zero), `floor`, `ceil` and `truncate`/`toInt` of one double.
String roundings(double v) => '${v.round()}/${v.floor()}/${v.ceil()}/${v.truncate()}/${v.toInt()}';
