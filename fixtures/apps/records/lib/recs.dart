(int, String) pair(int n) => (n, 'n$n');

({int id, String name}) named(int id) => (id: id, name: 'user$id');

(int, {String tag}) mixed() => (1, tag: 'x');

(int, int)? maybe(bool b) => b ? (1, 2) : null;

String records() {
  final (a, b) = pair(3);
  final (id: i, name: n) = named(4);
  final (int, {String tag}) r = mixed();
  final (int, int)? m = maybe(true);
  final (int, int)? none = maybe(false);
  return '$a $b $i $n ${r.$1} ${r.tag} ${pair(1) == pair(1)} ${pair(1) == pair(2)} ${named(1) == named(1)} ${m?.$2} ${none?.$1} ${none == null}';
}

String lists(List<int> xs) {
  if (xs case [var a, var b, ...var r]) {
    return 'two+ $a $b ${r.length}';
  } else if (xs case [var only]) {
    return 'one $only';
  }
  return 'none';
}

String maps(Map<String, Object?> m) {
  if (m case {'id': int id, 'n': String n} when id > 0) {
    return 'ok $id $n';
  }
  return 'no';
}

String sw(Object o) => switch (o) {
      [] => 'empty',
      [var x] => 'one $x',
      [var x, ..., var y] => 'ends $x $y',
      {'id': int i} => 'map $i',
      {'flag': _} => 'flag',
      (int a, int b) => 'rec $a$b',
      (x: int x, y: int y) => 'xy $x$y',
      _ => 'other',
    };

String flow(List<(String, int)> items) {
  final List<String> out = <String>[];
  for (final (String name, int n) in items) {
    out.add('$name=$n');
  }
  return out.join(',');
}

String note(List<int> xs) {
  String r = '';
  if (xs case [var a]) {
    r = 'one $a';
  } else {
    r = 'other';
  }
  return r;
}
