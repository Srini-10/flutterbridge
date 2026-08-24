import 'package:flutter/material.dart';

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

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          ElevatedButton(
            onPressed: () {
              showDialog<void>(
                context: context,
                builder: (context) => const AlertDialog(
                  title: Text('Delete item?'),
                  content: Text('This cannot be undone.'),
                ),
              );
            },
            child: const Text('delete'),
          ),
          ElevatedButton(
            onPressed: () {
              showDialog<void>(
                context: context,
                builder: (context) => const AlertDialog(
                  title: Text('Sign out?'),
                  content: Text('You can sign back in at any time.'),
                ),
              );
            },
            child: const Text('sign out'),
          ),
        ],
      ),
    );
  }
}
