import 'package:flutter/material.dart';

void main() => runApp(const App());

class App extends StatelessWidget {
  const App({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.indigo)),
        home: const HomeScreen(),
      );
}

String refusedLength() {
  final b = StringBuffer('a');
  return '${b.length}';
}

String refusedIsEmpty() {
  final b = StringBuffer();
  return b.isEmpty ? 'empty' : 'not empty';
}

String refusedWriteAll() {
  final b = StringBuffer()..writeAll(['a', 'b'], ',');
  return b.toString();
}

String refusedWriteCharCode() {
  final b = StringBuffer()..writeCharCode(65);
  return b.toString();
}

String refusedClear() {
  final b = StringBuffer('a');
  b.clear();
  return b.toString();
}

/// A `num` is an int or a double at run time, and a JavaScript number cannot say which — the same reason interpolating one is refused.
String refusedNum(num n) {
  final b = StringBuffer();
  b.write(n);
  return b.toString();
}

/// A list of `Object`s has no element text this generator can reproduce from the static type.
String refusedShape(List<Object> xs) {
  final b = StringBuffer();
  b.write(xs);
  return b.toString();
}

enum Kind { a, b }

class Plain {
  const Plain(this.v);
  final int v;
}

/// Dart prints `0:00:05.000000`; nothing here checks that the kit's `Duration` text is that.
String refusedDuration() {
  final b = StringBuffer();
  b.write(const Duration(seconds: 5));
  return b.toString();
}

/// Same for a `DateTime`: its text is not oracle-checked, so it is not written on trust.
String refusedDateTime(DateTime t) {
  final b = StringBuffer();
  b.write(t);
  return b.toString();
}

/// A plain enum value is its bare name here and Dart prints `Kind.a`; a null one prints `null`.
String refusedNullableEnum(Kind? k) {
  final b = StringBuffer();
  b.write(k);
  return b.toString();
}

/// A class that declares no `toString()` prints `Instance of 'Plain'` in Dart, which this generator has no default for.
String refusedInstance() {
  final b = StringBuffer();
  b.write(const Plain(1));
  return b.toString();
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text(refusedLength()),
          Text(refusedIsEmpty()),
          Text(refusedWriteAll()),
          Text(refusedWriteCharCode()),
          Text(refusedClear()),
          Text(refusedNum(1)),
          Text(refusedShape(const <Object>[1, 'a'])),
          Text(refusedDuration()),
          Text(refusedDateTime(DateTime(2026))),
          Text(refusedNullableEnum(Kind.a)),
          Text(refusedInstance()),
        ],
      ),
    );
  }
}
