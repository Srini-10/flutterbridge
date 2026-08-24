import 'package:flutter/material.dart';

void main() => runApp(const SnackbarPresentationApp());

class SnackbarPresentationApp extends StatelessWidget {
  const SnackbarPresentationApp({super.key});

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
  String _message = 'Saved';
  int _undoCount = 0;

  void _showBasic() {
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Saved')));
  }

  void _showVariableContent() {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_message)));
  }

  void _showTimedAction() {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: const Text('Item deleted'),
      duration: const Duration(seconds: 2),
      action: SnackBarAction(
        label: 'Undo',
        onPressed: () {
          setState(() {
            _undoCount = _undoCount + 1;
          });
        },
      ),
    ));
  }

  void _showViaLocalMessenger() {
    final ScaffoldMessengerState messenger = ScaffoldMessenger.of(context);
    messenger.showSnackBar(const SnackBar(content: Text('Via a local reference')));
  }

  void _hideCurrent() {
    ScaffoldMessenger.of(context).hideCurrentSnackBar();
  }

  void _removeCurrent() {
    ScaffoldMessenger.of(context).removeCurrentSnackBar();
  }

  void _clearAll() {
    ScaffoldMessenger.of(context).clearSnackBars();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(children: [
        ElevatedButton(onPressed: _showBasic, child: const Text('show basic')),
        ElevatedButton(onPressed: _showVariableContent, child: const Text('show variable')),
        ElevatedButton(onPressed: _showTimedAction, child: const Text('show timed action')),
        ElevatedButton(onPressed: _showViaLocalMessenger, child: const Text('show via local')),
        ElevatedButton(onPressed: _hideCurrent, child: const Text('hide current')),
        ElevatedButton(onPressed: _removeCurrent, child: const Text('remove current')),
        ElevatedButton(onPressed: _clearAll, child: const Text('clear all')),
        Text('undo count: $_undoCount'),
      ]),
    );
  }
}
