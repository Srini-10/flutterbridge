import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4)),
    ),
    home: const HomeScreen(),
  );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: SingleChildScrollView(child: DefaultsHost()));
}

/// Named parameters with defaults, an optional nullable one with none, and a positional required one.
class Tag extends StatelessWidget {
  const Tag(
    this.id, {
    super.key,
    this.label = 'none',
    this.count = 3,
    this.flag = false,
    this.note,
  });

  final int id;
  final String label;
  final int count;
  final bool flag;
  final String? note;

  @override
  Widget build(BuildContext context) =>
      Text('> tag$id $label $count $flag ${note ?? 'no-note'} ${note == null}');
}

class DefaultsHost extends StatefulWidget {
  const DefaultsHost({super.key});

  @override
  State<DefaultsHost> createState() => _DefaultsHostState();
}

class _DefaultsHostState extends State<DefaultsHost> {
  bool _on = false;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      ElevatedButton(
        child: const Text('toggle'),
        onPressed: () {
          setState(() {
            _on = !_on;
          });
        },
      ),
      const Tag(1),
      const Tag(2, label: 'a'),
      const Tag(3, count: 9, flag: true),
      const Tag(4, note: 'n'),
      const Tag(5, label: 'z', count: 0, flag: true, note: 'q'),
      Tag(6, label: _on ? 'on' : 'off', note: _on ? null : 'x'),
      Tag(7, count: _on ? 1 : 2),
    ],
  );
}
