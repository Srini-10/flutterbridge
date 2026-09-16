import 'package:flutter/material.dart';

/// R4 — declared in its own file, composed from `main.dart` (cross-file, same project).
class ChildWidget extends StatelessWidget {
  const ChildWidget({super.key, required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Text(label);
}
