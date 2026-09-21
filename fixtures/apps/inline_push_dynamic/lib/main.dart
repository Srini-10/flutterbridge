import 'package:flutter/material.dart';

import 'detail_screen.dart';
import 'item.dart';

void main() => runApp(const DynamicPushApp());

class DynamicPushApp extends StatelessWidget {
  const DynamicPushApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: Colors.teal)),
        home: const HomeScreen(owner: 'Ada'),
      );
}

/// Pushes [DetailScreen] with one constant (`heading`, which the page module binds) and five that only this call can compute: [owner] is this widget's own constructor parameter, `label` a local,
/// `item` a live object, `header` a widget, `onPick` a closure that writes this screen's own state.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.owner});

  final String owner;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _taps = 0;
  String _picked = 'nothing';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dynamic push')),
      body: Column(
        children: <Widget>[
          Text('Taps: $_taps'),
          Text('Picked: $_picked'),
          ElevatedButton(
            onPressed: () {
              setState(() {
                _taps = _taps + 1;
              });
            },
            child: const Text('Tap'),
          ),
          ElevatedButton(
            onPressed: () {
              final label = 'Tap ${_taps}';
              final item = Item('Widget', _taps + 1);
              Navigator.push(
                context,
                MaterialPageRoute<void>(
                  builder: (BuildContext context) => DetailScreen(
                    heading: 'Details',
                    owner: widget.owner,
                    label: label,
                    item: item,
                    header: Text('Header for $label'),
                    onPick: (String value) {
                      setState(() {
                        _picked = value;
                      });
                    },
                  ),
                ),
              );
            },
            child: const Text('Open detail'),
          ),
        ],
      ),
    );
  }
}
