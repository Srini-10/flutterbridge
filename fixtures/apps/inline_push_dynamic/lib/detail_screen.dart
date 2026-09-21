import 'package:flutter/material.dart';

import 'item.dart';

class DetailScreen extends StatelessWidget {
  const DetailScreen({
    super.key,
    required this.heading,
    required this.owner,
    required this.label,
    required this.item,
    required this.header,
    required this.onPick,
  });

  final String heading;
  final String owner;
  final String label;
  final Item item;
  final Widget header;
  final void Function(String) onPick;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(label)),
      body: Column(
        children: <Widget>[
          Text('Heading: $heading'),
          header,
          Text('Owner: $owner'),
          Text('Item: ${item.name} x${item.qty}'),
          ElevatedButton(
            onPressed: () {
              onPick('picked ${item.name}');
              Navigator.pop(context);
            },
            child: const Text('Pick'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
            },
            child: const Text('Back'),
          ),
        ],
      ),
    );
  }
}
