import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(body: ReservedNames(label: 'x'));
}

/// State fields whose names the generated code also uses: `signal`/`useState`/`delay`/`extent` are the runtime
/// kit's, `props` is the component function's own parameter, `arguments`/`eval` cannot be bound in a module.
/// The widget prop `label` makes the component read `props`, so a field of that name would shadow it.
class ReservedNames extends StatefulWidget {
  const ReservedNames({super.key, required this.label});

  final String label;

  @override
  State<ReservedNames> createState() => _ReservedNamesState();
}

class _ReservedNamesState extends State<ReservedNames> {
  int signal = 0;
  int useState = 0;
  int delay = 0;
  int arguments = 0;
  int eval = 0;
  int props = 0;
  int extent = 0;

  @override
  Widget build(BuildContext context) => Column(
        children: [
          ElevatedButton(
            onPressed: () {
              setState(() {
                signal++;
                useState++;
                delay++;
                arguments++;
                eval++;
                props++;
                extent++;
              });
            },
            child: const Text('go'),
          ),
          Text('$signal $useState $delay $arguments $eval $props $extent ${widget.label}'),
        ],
      );
}
