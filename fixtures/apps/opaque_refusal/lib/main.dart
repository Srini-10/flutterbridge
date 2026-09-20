import 'package:flutter/material.dart';

void main() => runApp(const RootApp());

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const HomeScreen(),
      );
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: Column(children: const [
          OpaqueBuildBody(),
          OpaqueStatement(),
          OpaqueExpression(),
        ]),
      );
}

/// A build body with a statement the structured-build extractor does not admit (a call before the
/// return): the whole render becomes `ui.Opaque`.
class OpaqueBuildBody extends StatelessWidget {
  const OpaqueBuildBody({super.key});

  @override
  Widget build(BuildContext context) {
    final greeting = 'hello';
    debugPrint(greeting);
    return Text(greeting);
  }
}

/// A local function declared inside a callback: `logic.OpaqueStmt`.
class OpaqueStatement extends StatefulWidget {
  const OpaqueStatement({super.key});

  @override
  State<OpaqueStatement> createState() => _OpaqueStatementState();
}

class _OpaqueStatementState extends State<OpaqueStatement> {
  int _result = 0;

  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          int twice(int v) {
            return v * 2;
          }

          setState(() {
            _result = twice(2);
          });
        },
        child: Text('$_result'),
      );
}

/// An index assignment: the write target has no UIR shape, so the write is `logic.OpaqueExpr`.
class OpaqueExpression extends StatefulWidget {
  const OpaqueExpression({super.key});

  @override
  State<OpaqueExpression> createState() => _OpaqueExpressionState();
}

class _OpaqueExpressionState extends State<OpaqueExpression> {
  final List<int> _items = <int>[1];

  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: () {
          setState(() {
            _items[0] = 5;
          });
        },
        child: Text('${_items[0]}'),
      );
}
