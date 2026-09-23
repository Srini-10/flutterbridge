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

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          // (1) A local nothing reads.
          Builder(builder: (context) {
            final unused = 'dropped';
            return const Text('never reads it');
          }),
          // (2) An `if` deciding what is returned.
          Builder(builder: (context) {
            final flag = DateTime.now().second.isEven;
            if (flag) {
              return const Text('even');
            }
            return const Text('odd');
          }),
          // (3) A side effect before the return.
          Builder(builder: (context) {
            debugPrint('building');
            return const Text('logged');
          }),
          // (4) A local function declaration.
          Builder(builder: (context) {
            String shout(String s) => s.toUpperCase();
            return Text(shout('x'));
          }),
        ],
      ),
    );
  }
}
