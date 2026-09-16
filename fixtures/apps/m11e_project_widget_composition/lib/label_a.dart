import 'package:flutter/material.dart';

/// R5 — a distinct class, declared in a different file from `label_b.dart`'s own `LabelB`.
class LabelA extends StatelessWidget {
  const LabelA({super.key});

  @override
  Widget build(BuildContext context) => const Text('label a');
}
