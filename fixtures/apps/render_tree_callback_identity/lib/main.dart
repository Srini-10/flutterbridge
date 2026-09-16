import 'package:flutter/material.dart';

void main() => runApp(const RenderTreeCallbackIdentityApp());

class RenderTreeCallbackIdentityApp extends StatelessWidget {
  const RenderTreeCallbackIdentityApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const DemoScreen(),
      );
}

// Each rung below is its own top-level `StatefulWidget`, extracted and emitted as its own standalone
// `ui.Component` (this compiler extracts every widget class in the project; a component need not be
// reachable from `main()` to be extracted and generated — confirmed against this same fixture. Composing
// one application-defined widget as a CHILD of another's render tree is a separate, pre-existing,
// unrelated gap — BRG3001 — not something this milestone touches).
class DemoScreen extends StatelessWidget {
  const DemoScreen({super.key});

  @override
  Widget build(BuildContext context) => const Scaffold(body: Text('render tree callback identity'));
}

/// R1 — one callback, one local, read DIRECTLY in the same callback (no nested closure at all). Proves
/// the gap M11-C's own R5 reported is not specific to nesting: an ordinary local declared inside ANY
/// inline render-tree callback had no declaration-tier `target`, regardless of how it was read.
class DirectReadWidget extends StatefulWidget {
  const DirectReadWidget({super.key});
  @override
  State<DirectReadWidget> createState() => _DirectReadWidgetState();
}

class _DirectReadWidgetState extends State<DirectReadWidget> {
  int _result = 0;
  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          final r = 1;
          _result = r;
        },
        child: Text('$_result'),
      );
}

/// R2 — one callback, one local, read from a NESTED callback (`setState`) — the original M11-C R5 shape.
class NestedReadWidget extends StatefulWidget {
  const NestedReadWidget({super.key});
  @override
  State<NestedReadWidget> createState() => _NestedReadWidgetState();
}

class _NestedReadWidgetState extends State<NestedReadWidget> {
  int _result = 0;
  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          final value = 5;
          setState(() {
            _result = value;
          });
        },
        child: Text('$_result'),
      );
}

/// R3 — two SIBLING outer callbacks (two buttons in the same widget), the SAME local name in each,
/// nested read — each must resolve to its OWN declaration, never its sibling's.
class SiblingSameNameWidget extends StatefulWidget {
  const SiblingSameNameWidget({super.key});
  @override
  State<SiblingSameNameWidget> createState() => _SiblingSameNameWidgetState();
}

class _SiblingSameNameWidgetState extends State<SiblingSameNameWidget> {
  int _resultA = 0;
  int _resultB = 0;
  @override
  Widget build(BuildContext context) => Row(children: [
        ElevatedButton(
          onPressed: () {
            final value = 10;
            setState(() {
              _resultA = value;
            });
          },
          child: Text('$_resultA'),
        ),
        ElevatedButton(
          onPressed: () {
            final value = 20;
            setState(() {
              _resultB = value;
            });
          },
          child: Text('$_resultB'),
        ),
      ]);
}

/// R4 — two sibling outer callbacks, DIFFERENT local names, nested read.
class SiblingDifferentNameWidget extends StatefulWidget {
  const SiblingDifferentNameWidget({super.key});
  @override
  State<SiblingDifferentNameWidget> createState() => _SiblingDifferentNameWidgetState();
}

class _SiblingDifferentNameWidgetState extends State<SiblingDifferentNameWidget> {
  int _resultA = 0;
  int _resultB = 0;
  @override
  Widget build(BuildContext context) => Row(children: [
        ElevatedButton(
          onPressed: () {
            final alpha = 10;
            setState(() {
              _resultA = alpha;
            });
          },
          child: Text('$_resultA'),
        ),
        ElevatedButton(
          onPressed: () {
            final beta = 20;
            setState(() {
              _resultB = beta;
            });
          },
          child: Text('$_resultB'),
        ),
      ]);
}

/// R5 — two DIFFERENT WIDGETS independently declaring a structurally-identical local (same name, same
/// literal initializer), each read from its own nested closure. Before M11-D both declarations' own
/// `logic.VarDecl` fell back to the SAME content-addressed `NodeId` (no `symbol`, identical structure) —
/// a real cross-widget collision. Split across two classes so each gets its own component scope.
class CrossWidgetCollisionA extends StatefulWidget {
  const CrossWidgetCollisionA({super.key});
  @override
  State<CrossWidgetCollisionA> createState() => _CrossWidgetCollisionAState();
}

class _CrossWidgetCollisionAState extends State<CrossWidgetCollisionA> {
  int _result = 0;
  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          final value = 5;
          setState(() {
            _result = value;
          });
        },
        child: Text('$_result'),
      );
}

class CrossWidgetCollisionB extends StatefulWidget {
  const CrossWidgetCollisionB({super.key});
  @override
  State<CrossWidgetCollisionB> createState() => _CrossWidgetCollisionBState();
}

class _CrossWidgetCollisionBState extends State<CrossWidgetCollisionB> {
  int _result = 0;
  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          final value = 5;
          setState(() {
            _result = value;
          });
        },
        child: Text('$_result'),
      );
}

/// R8 — a MUTABLE local (`var`, reassigned in the outer callback) captured by a nested closure.
class MutableCaptureWidget extends StatefulWidget {
  const MutableCaptureWidget({super.key});
  @override
  State<MutableCaptureWidget> createState() => _MutableCaptureWidgetState();
}

class _MutableCaptureWidgetState extends State<MutableCaptureWidget> {
  int _result = 0;
  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          var count = 0;
          count = count + 1;
          setState(() {
            _result = count;
          });
        },
        child: Text('$_result'),
      );
}

/// R9 — multiple reads of the SAME captured declaration, from the SAME nested callback.
class MultipleReadsWidget extends StatefulWidget {
  const MultipleReadsWidget({super.key});
  @override
  State<MultipleReadsWidget> createState() => _MultipleReadsWidgetState();
}

class _MultipleReadsWidgetState extends State<MultipleReadsWidget> {
  int _result = 0;
  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          final value = 3;
          setState(() {
            _result = value + value;
          });
        },
        child: Text('$_result'),
      );
}

/// R10 — multiple CAPTURED locals from the same enclosing callback.
class MultipleCapturesWidget extends StatefulWidget {
  const MultipleCapturesWidget({super.key});
  @override
  State<MultipleCapturesWidget> createState() => _MultipleCapturesWidgetState();
}

class _MultipleCapturesWidgetState extends State<MultipleCapturesWidget> {
  int _result = 0;
  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          final a = 1;
          final b = 2;
          setState(() {
            _result = a + b;
          });
        },
        child: Text('$_result'),
      );
}

/// R11 — an ordinary captured local sharing a name with a collection-for loop item (M9-F) declared
/// elsewhere in the SAME render tree — a deliberately separate identity mechanism (`Scope.forWidgetTree`'s
/// own widget-ordinal pair). Proves the two never cross-resolve even though both now draw ordinals from
/// the same `_ordinalsOf` pass.
class CollectionForNameClashWidget extends StatefulWidget {
  const CollectionForNameClashWidget({super.key});
  @override
  State<CollectionForNameClashWidget> createState() => _CollectionForNameClashWidgetState();
}

class _CollectionForNameClashWidgetState extends State<CollectionForNameClashWidget> {
  int _result = 0;
  @override
  Widget build(BuildContext context) {
    final items = ['a', 'b'];
    return Column(children: [
      for (final value in items) Text(value),
      ElevatedButton(
        onPressed: () {
          final value = 1;
          setState(() {
            _result = value;
          });
        },
        child: Text('$_result'),
      ),
    ]);
  }
}

/// R12 — a captured local whose name collides with a class member's (getter) spelling — the read must
/// resolve to the local, never the member.
class MemberNameClashWidget extends StatefulWidget {
  const MemberNameClashWidget({super.key});
  @override
  State<MemberNameClashWidget> createState() => _MemberNameClashWidgetState();
}

class _MemberNameClashWidgetState extends State<MemberNameClashWidget> {
  int _result = 0;
  int get helper => 99;
  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          final helper = 5;
          setState(() {
            _result = helper;
          });
        },
        child: Text('$_result'),
      );
}
