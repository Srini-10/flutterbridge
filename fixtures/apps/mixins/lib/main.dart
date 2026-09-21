import 'package:flutter/material.dart';

import 'mixes.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Shown()));
}

String show() {
  final Person p = Person('Ada');
  p.bump();
  p.bump();
  final Talker t = Talker();
  final Switch1 s = Switch1();
  s.flip();
  final Guest g = Guest();
  final Preset q = Preset();
  q.bump();
  return '${g.title()} ${q.count} ${p.greet()} ${p.shout} ${p.title()} ${p.count} ${t.say()} ${t.who()} ${s.on} ${describe(p)} ${describe(s)} ${describe(t)}';
}

class Shown extends StatelessWidget {
  const Shown({super.key});

  @override
  Widget build(BuildContext context) => Text('> ${show()}');
}

class Interactive extends StatefulWidget {
  const Interactive({super.key});

  @override
  State<Interactive> createState() => _InteractiveState();
}

class _InteractiveState extends State<Interactive> {
  final Switch1 flag = Switch1();
  Person person = Person('Bo');

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${flag.on} ${person.count} ${person.greet()}'),
        ElevatedButton(onPressed: () => setState(() {
          flag.flip();
        }), child: const Text('flip')),
        ElevatedButton(onPressed: () => setState(() {
          person.bump();
        }), child: const Text('bump')),
      ],
    );
  }
}
