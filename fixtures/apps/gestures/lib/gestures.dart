import 'package:flutter/material.dart';

// Each widget logs what its detector reports, in order, as one `> ` line; the scenario drives it with pointer steps.

class TapOnly extends StatefulWidget {
  const TapOnly({super.key});

  @override
  State<TapOnly> createState() => _TapOnlyState();
}

class _TapOnlyState extends State<TapOnly> {
  int taps = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> taps=$taps'),
        GestureDetector(
          onTap: () => setState(() => taps++),
          child: const Padding(padding: EdgeInsets.all(8), child: Text('target')),
        ),
      ],
    );
  }
}

class Phases extends StatefulWidget {
  const Phases({super.key});

  @override
  State<Phases> createState() => _PhasesState();
}

class _PhasesState extends State<Phases> {
  final List<String> log = <String>[];
  bool inside = true;

  void note(String what) => setState(() => log.add(what));

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${log.join(',')} inside=$inside'),
        GestureDetector(
          onTapDown: (TapDownDetails d) {
            inside = d.localPosition.dx >= 0 && d.globalPosition.dy >= 0;
            note('down');
          },
          onTapUp: (TapUpDetails d) => note('up'),
          onTap: () => note('tap'),
          onTapCancel: () => note('cancel'),
          child: const Padding(padding: EdgeInsets.all(8), child: Text('pad')),
        ),
      ],
    );
  }
}

class Doubles extends StatefulWidget {
  const Doubles({super.key});

  @override
  State<Doubles> createState() => _DoublesState();
}

class _DoublesState extends State<Doubles> {
  final List<String> log = <String>[];

  void note(String what) => setState(() => log.add(what));

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${log.join(',')}'),
        GestureDetector(
          onTap: () => note('tap'),
          onDoubleTap: () => note('double'),
          child: const Padding(padding: EdgeInsets.all(8), child: Text('dbl')),
        ),
      ],
    );
  }
}

class Longs extends StatefulWidget {
  const Longs({super.key});

  @override
  State<Longs> createState() => _LongsState();
}

class _LongsState extends State<Longs> {
  final List<String> log = <String>[];

  void note(String what) => setState(() => log.add(what));

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${log.join(',')}'),
        GestureDetector(
          onTapDown: (TapDownDetails d) => note('down'),
          onTap: () => note('tap'),
          onLongPress: () => note('long'),
          onTapCancel: () => note('cancel'),
          child: const Padding(padding: EdgeInsets.all(8), child: Text('lng')),
        ),
      ],
    );
  }
}

class Inks extends StatefulWidget {
  const Inks({super.key});

  @override
  State<Inks> createState() => _InksState();
}

class _InksState extends State<Inks> {
  final List<String> log = <String>[];
  bool enabled = true;

  void note(String what) => setState(() => log.add(what));

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${log.join(',')} enabled=$enabled'),
        ElevatedButton(onPressed: () => setState(() => enabled = !enabled), child: const Text('Toggle')),
        InkWell(
          onTap: enabled ? () => note('tap') : null,
          onLongPress: enabled ? () => note('long') : null,
          child: const Padding(padding: EdgeInsets.all(8), child: Text('ink')),
        ),
      ],
    );
  }
}

class Hovers extends StatefulWidget {
  const Hovers({super.key});

  @override
  State<Hovers> createState() => _HoversState();
}

class _HoversState extends State<Hovers> {
  final List<String> log = <String>[];

  void note(String what) => setState(() => log.add(what));

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${log.join(',')}'),
        InkWell(
          onTap: () => note('tap'),
          onHover: (bool h) => note(h ? 'in' : 'out'),
          child: const Padding(padding: EdgeInsets.all(8), child: Text('hov')),
        ),
      ],
    );
  }
}

class Focuses extends StatefulWidget {
  const Focuses({super.key});

  @override
  State<Focuses> createState() => _FocusesState();
}

class _FocusesState extends State<Focuses> {
  final List<String> log = <String>[];

  void note(String what) => setState(() => log.add(what));

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${log.join(',')}'),
        InkWell(
          onTap: () => note('tap'),
          onFocusChange: (bool f) => note(f ? 'focus' : 'blur'),
          child: const Padding(padding: EdgeInsets.all(8), child: Text('foc')),
        ),
      ],
    );
  }
}

class Nested extends StatefulWidget {
  const Nested({super.key});

  @override
  State<Nested> createState() => _NestedState();
}

class _NestedState extends State<Nested> {
  final List<String> log = <String>[];

  void note(String what) => setState(() => log.add(what));

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${log.join(',')}'),
        GestureDetector(
          onTap: () => note('outer'),
          child: Padding(
            padding: const EdgeInsets.all(20),
            child: GestureDetector(
              onTap: () => note('inner'),
              child: const Padding(padding: EdgeInsets.all(8), child: Text('inn')),
            ),
          ),
        ),
      ],
    );
  }
}

class Inert extends StatefulWidget {
  const Inert({super.key});

  @override
  State<Inert> createState() => _InertState();
}

class _InertState extends State<Inert> {
  int taps = 0;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> taps=$taps'),
        // A detector with no callbacks does nothing; the tap reaches the one behind it.
        GestureDetector(
          onTap: () => setState(() => taps++),
          child: GestureDetector(child: const Padding(padding: EdgeInsets.all(8), child: Text('bare'))),
        ),
      ],
    );
  }
}

class Full extends StatefulWidget {
  const Full({super.key});

  @override
  State<Full> createState() => _FullState();
}

class _FullState extends State<Full> {
  final List<String> log = <String>[];

  void note(String what) => setState(() => log.add(what));

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text('> ${log.join(',')}'),
        GestureDetector(
          onTapDown: (TapDownDetails d) => note('down'),
          onTapUp: (TapUpDetails d) => note('up'),
          onTap: () => note('tap'),
          onTapCancel: () => note('cancel'),
          onDoubleTap: () => note('double'),
          onLongPress: () => note('long'),
          child: const Padding(padding: EdgeInsets.all(8), child: Text('full')),
        ),
      ],
    );
  }
}
