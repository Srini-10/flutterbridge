import 'package:flutter/material.dart';
import 'package:module_emission_utils/format_utils.dart';
import 'package:module_emission_utils/prefix_utils.dart';
import 'package:module_emission_utils/collide_a.dart' as collide_a;
import 'package:module_emission_utils/collide_b.dart' as collide_b;

void main() => runApp(const App());

class App extends StatelessWidget {
  const App({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF3F51B5))),
      home: const HomeScreen(),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text(greet()),
          Text(greetName('Ada')),
          Text('${addTwo(2, 3)}'),
          Text(describeCount(3)),
          Text(classify(-1)),
          Text('${square(4)}'),
          Text(shout('hi')),
          Text(describeBoth(1, 2)),
          Text(withPrefix('Bridge')),
          Text(collide_a.sameName()),
          Text(collide_b.sameName()),
        ],
      ),
    );
  }
}
