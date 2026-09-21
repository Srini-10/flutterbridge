import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
    theme: ThemeData(
      colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4)),
    ),
    home: const HomeScreen(),
  );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(
    body: SingleChildScrollView(child: Column(children: [GestureSection(), LayoutSection()])),
  );
}

// ---- gestures (ADR-0070): a detector with every tap-family callback, an InkWell with hover and focus --------------

class GestureSection extends StatefulWidget {
  const GestureSection({super.key});

  @override
  State<GestureSection> createState() => _GestureSectionState();
}

class _GestureSectionState extends State<GestureSection> {
  final List<String> pad = <String>[];
  final List<String> ink = <String>[];
  bool inkEnabled = true;
  int detail = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('pad: ${pad.join(',')}'),
        GestureDetector(
          onTapDown: (TapDownDetails d) => setState(() {
            pad.add('down');
            detail = d.localPosition.dx.round();
          }),
          onTapUp: (TapUpDetails d) => setState(() => pad.add('up')),
          onTap: () => setState(() => pad.add('tap')),
          onTapCancel: () => setState(() => pad.add('cancel')),
          onDoubleTap: () => setState(() => pad.add('double')),
          onLongPress: () => setState(() => pad.add('long')),
          child: const SizedBox(width: 120, height: 40, child: Text('press pad')),
        ),
        Text('local x: $detail'),
        Text('ink: ${ink.join(',')} enabled=$inkEnabled'),
        InkWell(
          onTap: inkEnabled ? () => setState(() => ink.add('tap')) : null,
          onHover: (bool h) => setState(() => ink.add(h ? 'in' : 'out')),
          onFocusChange: (bool f) => setState(() => ink.add(f ? 'focus' : 'blur')),
          child: const SizedBox(width: 120, height: 40, child: Text('ink well')),
        ),
        ElevatedButton(
          onPressed: () => setState(() => inkEnabled = !inkEnabled),
          child: const Text('toggle ink'),
        ),
      ],
    );
  }
}

// ---- constraints (ADR-0071): LayoutBuilder in a box the buttons resize, one that follows the viewport, and a nested one ----

class LayoutSection extends StatefulWidget {
  const LayoutSection({super.key});

  @override
  State<LayoutSection> createState() => _LayoutSectionState();
}

class _LayoutSectionState extends State<LayoutSection> {
  double boxWidth = 300;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ElevatedButton(onPressed: () => setState(() => boxWidth = 300), child: const Text('narrow box')),
        ElevatedButton(onPressed: () => setState(() => boxWidth = 640), child: const Text('wide box')),
        SizedBox(
          width: boxWidth,
          height: 90,
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints c) {
              if (c.maxWidth >= 600) {
                return Text('box: wide ${c.maxWidth} x ${c.maxHeight}');
              }
              return Text('box: narrow ${c.maxWidth} x ${c.maxHeight}');
            },
          ),
        ),
        LayoutBuilder(
          builder: (BuildContext context, BoxConstraints c) => Text('page: ${c.maxWidth.round()} free=${!c.hasBoundedHeight}'),
        ),
        // A shrink-wrapped, padded parent: the builder is offered the page's width less the padding, not the width of the box.
        Container(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              const SizedBox(width: 100, child: Text('narrow sibling')),
              LayoutBuilder(
                builder: (BuildContext context, BoxConstraints c) => Text('padded: ${c.maxWidth.round()}'),
              ),
            ],
          ),
        ),
        SizedBox(
          width: 400,
          child: Padding(
            padding: const EdgeInsets.all(25),
            child: LayoutBuilder(
              builder: (BuildContext context, BoxConstraints c) => Text('nested: ${c.maxWidth}'),
            ),
          ),
        ),
      ],
    );
  }
}
