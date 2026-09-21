import 'dart:async';

import 'package:flutter/material.dart';

import 'times.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => const MaterialApp(home: Scaffold(body: Times()));
}

class Times extends StatelessWidget {
  const Times({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${dates()}'),
        Text('> ${compare()} ${parsed()}'),
        Text('> ${deep()} ${parses()}'),
      ],
    );
  }
}

class Ticker extends StatefulWidget {
  const Ticker({super.key});

  @override
  State<Ticker> createState() => _TickerState();
}

class _TickerState extends State<Ticker> {
  int ticks = 0;
  String later0 = 'waiting';
  Timer? timer;

  @override
  void initState() {
    super.initState();
    timer = Timer.periodic(const Duration(milliseconds: 10), (Timer t) {
      setState(() {
        ticks += 1;
      });
      if (ticks >= 3) {
        t.cancel();
      }
    });
    awaited().then((String v) {
      setState(() {
        later0 = '$v';
      });
    });
  }

  @override
  void dispose() {
    timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Text('> ticks=$ticks $later0');
}
