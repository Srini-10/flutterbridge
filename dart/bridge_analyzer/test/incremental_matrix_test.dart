/// The incremental analyzer against a clean one, across the cross-file dependencies a Dart program has (M14, section "incremental correctness").
///
/// One property, checked over a matrix of mutations: **whatever is changed, the bytes an incremental build writes are the bytes a clean build of
/// the same sources writes.** Each case is a small multi-file program and one edit to one file; the edit is one that changes what *another* file's
/// extraction depends on — an inherited class, a mixin, an extension, a generic bound, a re-export, a part file, an enum's shape, a constant, a
/// route table, a widget's constructor. A miss here is a stale semantic served silently, the failure that destroys a compiler's credibility.
@TestOn('vm')
library;

import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

import 'support/temp_project.dart';

typedef Files = Map<String, String>;

/// One mutation: the program before, the program after (only the files that change need appear in `after`), and what is being defended.
final class Case {
  const Case(this.name, this.before, this.after);

  final String name;
  final Files before;
  final Files after;
}

const String _material = "import 'package:flutter/material.dart';\n";

/// A screen that reads [expression] (so a change to what the expression means changes this file's extraction).
String screen(String expression, {String imports = ''}) =>
    '''
$_material$imports
class Screen extends StatelessWidget {
  const Screen({super.key});
  @override
  Widget build(BuildContext context) => Text($expression);
}
''';

final List<Case> cases = <Case>[
  Case(
    'a class in file A gains a mixin from file B',
    <String, String>{
      'a.dart': "class Base { const Base(); String tag() => 'base'; }\n",
      'm.dart': "mixin Loud on Object { String shout() => 'LOUD'; }\n",
      'main.dart': screen('const Base().tag()', imports: "import 'package:app/a.dart';\n"),
    },
    <String, String>{
      'a.dart':
          "import 'package:app/m.dart';\nclass Base with Loud { const Base(); String tag() => 'base'; }\n",
    },
  ),
  Case(
    'a mixin body changes, and a class in another file uses it',
    <String, String>{
      'm.dart': "mixin Loud { String shout() => 'a'; }\n",
      'c.dart': "import 'package:app/m.dart';\nclass Thing with Loud { const Thing(); }\n",
      'main.dart': screen('const Thing().shout()', imports: "import 'package:app/c.dart';\n"),
    },
    <String, String>{'m.dart': "mixin Loud { String shout() => 'b'; }\n"},
  ),
  Case(
    'an extension in file A gains a member used from file B',
    <String, String>{
      'e.dart': 'extension Shout on String { String loud() => toUpperCase(); }\n',
      'main.dart': screen("'x'.loud()", imports: "import 'package:app/e.dart';\n"),
    },
    <String, String>{
      'e.dart': "extension Shout on String { String loud() => toUpperCase() + '!'; }\n",
    },
  ),
  Case(
    'an extension changes the type it extends',
    <String, String>{
      'e.dart': 'extension Twice on int { int twice() => this * 2; }\n',
      'main.dart': screen('3.twice().toString()', imports: "import 'package:app/e.dart';\n"),
    },
    <String, String>{'e.dart': 'extension Twice on int { int twice() => this * 3; }\n'},
  ),
  Case(
    'a superclass in file A changes a method a subclass in file B overrides',
    <String, String>{
      'a.dart': "class Animal { const Animal(); String sound() => '...'; }\n",
      'b.dart':
          "import 'package:app/a.dart';\nclass Dog extends Animal { const Dog(); @override String sound() => 'woof'; }\n",
      'main.dart': screen('const Dog().sound()', imports: "import 'package:app/b.dart';\n"),
    },
    <String, String>{
      'a.dart': "class Animal { const Animal(); String sound() => '??'; String name() => 'a'; }\n",
    },
  ),
  Case(
    'a class stops being inherited from',
    <String, String>{
      'a.dart': 'class Base { const Base(); }\n',
      'main.dart':
          "${screen("const Child().toString()", imports: "import 'package:app/a.dart';\n")}\nclass Child extends Base { const Child(); }\n",
    },
    <String, String>{
      'main.dart':
          "${screen("const Child().toString()", imports: "import 'package:app/a.dart';\n")}\nclass Child { const Child(); }\n",
    },
  ),
  Case(
    'a generic bound in file A tightens',
    <String, String>{
      'a.dart': 'class Box<T extends Object> { const Box(this.v); final T v; }\n',
      'main.dart': screen("const Box<String>('s').v", imports: "import 'package:app/a.dart';\n"),
    },
    <String, String>{
      'a.dart': 'class Box<T extends Object> { const Box(this.v); final T v; T get value => v; }\n',
    },
  ),
  Case(
    'a constant in file A changes value',
    <String, String>{
      'k.dart': "const String greeting = 'hello';\n",
      'main.dart': screen('greeting', imports: "import 'package:app/k.dart';\n"),
    },
    <String, String>{'k.dart': "const String greeting = 'bonjour';\n"},
  ),
  Case(
    'an enum gains a value used in a switch elsewhere',
    <String, String>{
      'e.dart': 'enum Mode { a, b }\n',
      'main.dart':
          "${screen("label(Mode.a)", imports: "import 'package:app/e.dart';\n")}\nString label(Mode m) => switch (m) { Mode.a => 'A', Mode.b => 'B' };\n",
    },
    <String, String>{'e.dart': 'enum Mode { a, b }\nextension on Mode { int get n => index; }\n'},
  ),
  Case(
    'a re-export is redirected to another library',
    <String, String>{
      'one.dart': "String which() => 'one';\n",
      'two.dart': "String which() => 'two';\n",
      'barrel.dart': "export 'package:app/one.dart';\n",
      'main.dart': screen('which()', imports: "import 'package:app/barrel.dart';\n"),
    },
    <String, String>{'barrel.dart': "export 'package:app/two.dart';\n"},
  ),
  const Case(
    'a widget constructor gains a required parameter, and a caller in another file must change with it',
    <String, String>{
      'w.dart':
          "$_material class Tag extends StatelessWidget { const Tag({super.key}); @override Widget build(BuildContext c) => const Text('t'); }\n",
      'main.dart':
          "$_material import 'package:app/w.dart';\nclass Screen extends StatelessWidget { const Screen({super.key}); @override Widget build(BuildContext c) => const Tag(); }\n",
    },
    <String, String>{
      'w.dart':
          "$_material class Tag extends StatelessWidget { const Tag({super.key, this.label = 'x'}); final String label; @override Widget build(BuildContext c) => Text(label); }\n",
      'main.dart':
          "$_material import 'package:app/w.dart';\nclass Screen extends StatelessWidget { const Screen({super.key}); @override Widget build(BuildContext c) => const Tag(label: 'hi'); }\n",
    },
  ),
  const Case(
    'a widget changes from stateless to stateful',
    <String, String>{
      'w.dart':
          "$_material class Tag extends StatelessWidget { const Tag({super.key}); @override Widget build(BuildContext c) => const Text('t'); }\n",
      'main.dart':
          "$_material import 'package:app/w.dart';\nclass Screen extends StatelessWidget { const Screen({super.key}); @override Widget build(BuildContext c) => const Column(children: [Tag()]); }\n",
    },
    <String, String>{
      'w.dart':
          "$_material class Tag extends StatefulWidget { const Tag({super.key}); @override State<Tag> createState() => _T(); }\nclass _T extends State<Tag> { int n = 0; @override Widget build(BuildContext c) => Text('\$n'); }\n",
    },
  ),
  Case(
    'a top-level function used by a screen changes its body in another file',
    <String, String>{
      'f.dart': 'int answer() => 41;\n',
      'main.dart': screen('answer().toString()', imports: "import 'package:app/f.dart';\n"),
    },
    <String, String>{'f.dart': 'int answer() => 42;\n'},
  ),
  Case(
    'a static member of a class in another file changes',
    <String, String>{
      'k.dart': "class Config { static const String name = 'a'; }\n",
      'main.dart': screen('Config.name', imports: "import 'package:app/k.dart';\n"),
    },
    <String, String>{'k.dart': "class Config { static const String name = 'b'; }\n"},
  ),
  const Case(
    'a route table gains a route to a screen in a file it did not import before',
    <String, String>{
      'a.dart':
          "$_material class A extends StatelessWidget { const A({super.key}); @override Widget build(BuildContext c) => const Text('a'); }\n",
      'b.dart':
          "$_material class B extends StatelessWidget { const B({super.key}); @override Widget build(BuildContext c) => const Text('b'); }\n",
      'routes.dart':
          "$_material import 'package:app/a.dart';\nclass R extends StatelessWidget { const R({super.key}); @override Widget build(BuildContext c) => MaterialApp(routes: {'/': (c) => const A()}); }\n",
    },
    <String, String>{
      'routes.dart':
          "$_material import 'package:app/a.dart';\nimport 'package:app/b.dart';\nclass R extends StatelessWidget { const R({super.key}); @override Widget build(BuildContext c) => MaterialApp(routes: {'/': (c) => const A(), '/b': (c) => const B()}); }\n",
    },
  ),
  Case(
    'an imported file is removed from the import list',
    <String, String>{
      'k.dart': "const String greeting = 'hello';\n",
      'main.dart': screen('greeting', imports: "import 'package:app/k.dart';\n"),
    },
    <String, String>{'main.dart': screen("'inline'")},
  ),
];

void main() {
  for (final Case c in cases) {
    test('incremental ≡ clean: ${c.name}', () async {
      final String project = createProject(name: 'app', libraries: c.before);
      final Directory cache = Directory.systemTemp.createTempSync('cache_');
      addTearDown(() => cache.deleteSync(recursive: true));
      final String cacheDir = p.join(cache.path, 'cas');

      Future<String> build(String? dir) async {
        final Directory out = Directory.systemTemp.createTempSync('build_');
        addTearDown(() => out.deleteSync(recursive: true));
        final AnalyzerResult result = await const BridgeAnalyzer().run(
          AnalyzerRequest(projectRoot: project, outputPath: p.join(out.path, 'uir.ndjson')),
          cacheDirectory: dir,
        );
        expect(
          result.status,
          RunStatus.completed,
          reason:
              'the build must succeed: ${result.diagnostics.map((Object d) => d.toString()).join('; ')}',
        );
        return File(result.output!.outputPath).readAsStringSync();
      }

      expect(
        await build(cacheDir),
        await build(null),
        reason: 'a cold incremental build equals a clean one',
      );
      for (final MapEntry<String, String> entry in c.after.entries) {
        File(p.join(project, 'lib', entry.key)).writeAsStringSync(entry.value);
      }
      final String incremental = await build(cacheDir);
      final String clean = await build(null);
      expect(
        incremental,
        clean,
        reason:
            'after the edit, the incremental output must equal a clean build of the edited sources',
      );
    });
  }
}
