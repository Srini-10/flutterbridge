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

String refusedNum(num n) => n.toString();

String refusedNullableDouble(double? d) => d.toString();

/// `ceilToDouble` is the fourth of the family; no real code in either corpus calls it, so it has no evidence and no lowering.
String refusedCeilToDouble(double d) => '${d.ceilToDouble()}';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          Text(refusedNum(1)),
          Text(refusedNullableDouble(1.5)),
          Text(refusedCeilToDouble(5.5)),
        ],
      ),
    );
  }
}
