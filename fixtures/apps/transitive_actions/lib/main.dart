import 'package:flutter/material.dart';

void main() => runApp(const App());

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return const MaterialApp(home: Example());
  }
}

// H. same action name (`b`) as `_ExampleState`'s own, in a different owner — the transitive
// discovery of `SecondScreen`'s `b` must never resolve to `_ExampleState`'s `b` or vice versa.
class SecondScreen extends StatefulWidget {
  const SecondScreen({super.key});

  @override
  State<SecondScreen> createState() => _SecondScreenState();
}

class _SecondScreenState extends State<SecondScreen> {
  int total = 0;

  void a() {
    b();
  }

  void b() {
    setState(() {
      total++;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('$total'),
        ElevatedButton(onPressed: a, child: const Text('second-a')),
      ],
    );
  }
}

class Example extends StatefulWidget {
  const Example({super.key});

  @override
  State<Example> createState() => _ExampleState();
}

class _ExampleState extends State<Example> {
  int count = 0;

  // B. render -> A -> B (two-hop via one level of indirection)
  void a() {
    b();
  }

  void b() {
    setState(() {
      count++;
    });
  }

  // C. render -> A2 -> B2 -> C2 (three-hop)
  void a2() {
    b2();
  }

  void b2() {
    c2();
  }

  void c2() {
    setState(() {
      count++;
    });
  }

  // D. render -> A3 -> B3 and A3 -> C3 (fan-out)
  void a3() {
    b3();
    c3();
  }

  void b3() {
    setState(() {
      count++;
    });
  }

  void c3() {
    setState(() {
      count++;
    });
  }

  // F. self-cycle guard (A4 -> A4) — deliberately never actually called, just present so the
  // generator would have to handle it if it were ever reachable; guarded to keep runtime sane.
  void a4() {
    if (count > 1000) {
      a4();
    }
    setState(() {
      count++;
    });
  }

  // G. mutual cycle (A4b -> B4b -> A4b), guarded to terminate at runtime.
  void a4b() {
    if (count < 1000) {
      b4b();
    }
  }

  void b4b() {
    setState(() {
      count++;
    });
    if (count < 1000) {
      a4b();
    }
  }

  // I. parameterized transitive action
  void a5() {
    b5(3);
  }

  void b5(int value) {
    setState(() {
      count += value;
    });
  }

  // J. async transitive action
  void a6() {
    b6();
  }

  Future<void> b6() async {
    setState(() {
      count++;
    });
  }

  // K. write-nothing transitive action (M8-H domain)
  void a7() {
    b7();
  }

  void b7() {
    if (count > 1 << 30) {
      return;
    }
  }

  // L. referenced both directly by render AND transitively by another action
  void a8() {
    b8();
  }

  void b8() {
    setState(() {
      count++;
    });
  }

  // M. unrelated/unreferenced action — must remain un-emitted
  void unused() {
    setState(() {
      count = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('$count'),
        ElevatedButton(onPressed: a, child: const Text('a')),
        ElevatedButton(onPressed: a2, child: const Text('a2')),
        ElevatedButton(onPressed: a3, child: const Text('a3')),
        ElevatedButton(onPressed: a5, child: const Text('a5')),
        ElevatedButton(onPressed: a6, child: const Text('a6')),
        ElevatedButton(onPressed: a7, child: const Text('a7')),
        ElevatedButton(onPressed: a8, child: const Text('a8')),
        ElevatedButton(onPressed: b8, child: const Text('b8-direct')),
        ElevatedButton(onPressed: a4, child: const Text('a4')),
        ElevatedButton(onPressed: a4b, child: const Text('a4b')),
      ],
    );
  }
}
