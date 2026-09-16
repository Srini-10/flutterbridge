import 'package:flutter/material.dart';

/// R5 — a distinct class, declared in a different file from `label_a.dart`'s own `LabelA`.
class LabelB extends StatelessWidget {
  const LabelB({super.key});

  @override
  Widget build(BuildContext context) => const Text('label b');
}
