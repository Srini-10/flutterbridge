import 'package:flutter/material.dart';

// Each widget hosts a LayoutBuilder in a box whose width the scenario changes with the buttons.

class Widths extends StatefulWidget {
  const Widths({super.key});

  @override
  State<Widths> createState() => _WidthsState();
}

class _WidthsState extends State<Widths> {
  double width = 300;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ElevatedButton(onPressed: () => setState(() => width = 300), child: const Text('300')),
        ElevatedButton(onPressed: () => setState(() => width = 500), child: const Text('500')),
        ElevatedButton(onPressed: () => setState(() => width = 700), child: const Text('700')),
        SizedBox(
          width: width,
          height: 80,
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              return Text('> w=${constraints.maxWidth} h=${constraints.maxHeight}');
            },
          ),
        ),
      ],
    );
  }
}

class Responsive extends StatefulWidget {
  const Responsive({super.key});

  @override
  State<Responsive> createState() => _ResponsiveState();
}

class _ResponsiveState extends State<Responsive> {
  double width = 300;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ElevatedButton(onPressed: () => setState(() => width = 300), child: const Text('narrow')),
        ElevatedButton(onPressed: () => setState(() => width = 800), child: const Text('wide')),
        SizedBox(
          width: width,
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints constraints) {
              if (constraints.maxWidth >= 600) {
                return const Row(children: [Text('> wide layout'), Text('> two columns')]);
              }
              return const Column(children: [Text('> narrow layout'), Text('> one column')]);
            },
          ),
        ),
      ],
    );
  }
}

class NestedBuilders extends StatefulWidget {
  const NestedBuilders({super.key});

  @override
  State<NestedBuilders> createState() => _NestedBuildersState();
}

class _NestedBuildersState extends State<NestedBuilders> {
  double width = 400;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ElevatedButton(onPressed: () => setState(() => width = 400), child: const Text('400')),
        ElevatedButton(onPressed: () => setState(() => width = 200), child: const Text('200')),
        SizedBox(
          width: width,
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints outer) {
              return Column(
                children: [
                  Text('> outer=${outer.maxWidth}'),
                  Padding(
                    padding: const EdgeInsets.all(25),
                    child: LayoutBuilder(
                      builder: (BuildContext context, BoxConstraints inner) {
                        return Text('> inner=${inner.maxWidth}');
                      },
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ],
    );
  }
}

class Ratios extends StatefulWidget {
  const Ratios({super.key});

  @override
  State<Ratios> createState() => _RatiosState();
}

class _RatiosState extends State<Ratios> {
  double width = 400;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        ElevatedButton(onPressed: () => setState(() => width = 400), child: const Text('w400')),
        ElevatedButton(onPressed: () => setState(() => width = 250), child: const Text('w250')),
        SizedBox(
          width: width,
          height: 100,
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints c) {
              final double half = c.maxWidth / 2;
              final bool wide = c.maxWidth > c.maxHeight * 3;
              return Text('> half=$half wide=$wide boundedH=${c.hasBoundedHeight} boundedW=${c.hasBoundedWidth}');
            },
          ),
        ),
      ],
    );
  }
}

class Unbounded extends StatelessWidget {
  const Unbounded({super.key});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        // A child of a Column has no height limit; the one under a SizedBox has one.
        LayoutBuilder(
          builder: (BuildContext context, BoxConstraints c) => Text('> free h=${c.maxHeight} bounded=${c.hasBoundedHeight}'),
        ),
        SizedBox(
          height: 60,
          child: LayoutBuilder(
            builder: (BuildContext context, BoxConstraints c) => Text('> fixed h=${c.maxHeight} bounded=${c.hasBoundedHeight}'),
          ),
        ),
      ],
    );
  }
}
