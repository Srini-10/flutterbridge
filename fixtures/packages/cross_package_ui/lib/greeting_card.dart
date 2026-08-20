import 'package:flutter/material.dart';

class GreetingCard extends StatefulWidget {
  const GreetingCard({required this.name, super.key});

  final String name;

  @override
  State<GreetingCard> createState() => _GreetingCardState();
}

class _GreetingCardState extends State<GreetingCard> {
  int _count = 0;

  void _increment() {
    setState(() {
      _count = _count + 1;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Text('Hello, ${widget.name}! ($_count)'),
            ElevatedButton(onPressed: _increment, child: const Text('Greet')),
          ],
        ),
      ),
    );
  }
}
