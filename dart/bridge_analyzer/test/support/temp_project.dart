/// Test support: builds throwaway Flutter-shaped projects on disk.
///
/// Fixtures are constructed here rather than committed, because a fit project needs a
/// `.dart_tool/package_config.json` — a build artifact that has no business in version control.
///
/// The projects built here are *genuinely* resolvable: the packages they import are written to disk
/// and registered in the package config. That matters since M1-T7, because the loader now checks that
/// every directive points at a file that exists, and a fixture whose imports dangle would be refused
/// — correctly, and uselessly.
@TestOn('vm')
library;

import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:test/test.dart';

/// A stand-in for the Flutter SDK: the parts of it extraction actually reasons about.
///
/// Extraction decides what a class *is* from its resolved supertypes — `StatelessWidget`, `State<T>`,
/// `ChangeNotifier` — never from its name (C1 misclassified 18 widgets by reading names). So an
/// extraction test needs those types to genuinely resolve, which means a genuine package named
/// `flutter` with genuine classes in it.
///
/// It is not the real SDK, and it does not need to be: what matters is that `package:flutter/...`
/// declares a `Widget`, and that the analyzer agrees a `Column` is one. A hundred lines buys a test
/// suite that runs on any machine, in any CI job, with no Flutter installed.
const Map<String, String> flutterPackage = <String, String>{
  'widgets.dart': '''
abstract class Widget {
  const Widget({this.key});
  final Object? key;
}

abstract class StatelessWidget extends Widget {
  const StatelessWidget({super.key});
  Widget build(BuildContext context);
}

abstract class StatefulWidget extends Widget {
  const StatefulWidget({super.key});
  State createState();
}

abstract class State<T extends StatefulWidget> {
  late T widget;
  void initState() {}
  void dispose() {}
  void setState(void Function() fn) {}
  Widget build(BuildContext context);
}

abstract class BuildContext {}

class ChangeNotifier {
  void notifyListeners() {}
  void addListener(void Function() listener) {}
}

class ValueNotifier<T> extends ChangeNotifier {
  ValueNotifier(this.value);
  T value;
}

class Text extends Widget {
  const Text(this.data, {this.style, super.key});
  final String data;
  final Object? style;
}

class Column extends Widget {
  const Column({this.children = const <Widget>[], super.key});
  final List<Widget> children;
}

class Row extends Widget {
  const Row({this.children = const <Widget>[], super.key});
  final List<Widget> children;
}

class Padding extends Widget {
  const Padding({required this.child, this.padding, super.key});
  final Widget child;
  final Object? padding;
}

class Scaffold extends Widget {
  const Scaffold({this.appBar, this.body, super.key});
  final Widget? appBar;
  final Widget? body;
}

class AppBar extends Widget {
  const AppBar({this.title, super.key});
  final Widget? title;
}

class ElevatedButton extends Widget {
  const ElevatedButton({required this.onPressed, required this.child, super.key});
  final void Function()? onPressed;
  final Widget child;
}

class SizedBox extends Widget {
  const SizedBox({this.height, this.width, super.key});
  final double? height;
  final double? width;
}

class MaterialApp extends Widget {
  const MaterialApp({this.home, this.routes = const <String, Widget Function(BuildContext)>{}, this.theme, super.key});
  final Widget? home;
  final Map<String, Widget Function(BuildContext)> routes;
  final Object? theme;
}

class Mystery extends Widget {
  const Mystery({super.key});
}
''',
  'material.dart': "export 'widgets.dart';\n",
};

/// A stand-in for `go_router`: the types the adapter reasons about.
///
/// Real enough that `AppRoute extends GoRoute` resolves, which is the whole point — the adapter decides
/// what a thing is from its **supertypes**, so a fake with no supertypes would test nothing.
const Map<String, String> goRouterPackage = <String, String>{
  'go_router.dart': '''
import 'package:flutter/widgets.dart';

class GoRouterState {
  const GoRouterState();
}

class RouteBase {
  const RouteBase();
}

class GoRoute extends RouteBase {
  const GoRoute({
    required this.path,
    this.builder,
    this.pageBuilder,
    this.redirect,
    this.routes = const <RouteBase>[],
  });
  final String path;
  final Widget Function(BuildContext, GoRouterState)? builder;
  final Object? Function(BuildContext, GoRouterState)? pageBuilder;
  final Object? redirect;
  final List<RouteBase> routes;
}

class ShellRoute extends RouteBase {
  const ShellRoute({this.builder, this.routes = const <RouteBase>[]});
  final Widget Function(BuildContext, GoRouterState, Widget)? builder;
  final List<RouteBase> routes;
}

class GoRouter {
  const GoRouter({this.routes = const <RouteBase>[], this.initialLocation});
  final List<RouteBase> routes;
  final String? initialLocation;
}
''',
};

/// Creates a temporary project directory, deleted when the test ends.
///
/// [libraries] maps `lib/`-relative paths to file contents.
/// [dependencies] maps a package name to its `lib/`-relative files. Each is written to disk and
/// registered in the package config, so imports of it resolve. Defaults to a stand-in `flutter`.
/// [isFlutter] controls whether pubspec.yaml declares the `flutter` SDK dependency.
/// [withPackageConfig] controls whether the project looks "pub get"-ed.
/// [packageConfigAtParent] writes the package config one directory *above* the project, which is what
/// a Dart pub workspace looks like.
String createProject({
  required String name,
  Map<String, String> libraries = const <String, String>{'a.dart': '// empty\n'},
  Map<String, Map<String, String>> dependencies = const <String, Map<String, String>>{
    'flutter': flutterPackage,
  },
  bool isFlutter = true,
  bool withPackageConfig = true,
  bool packageConfigAtParent = false,
  bool withPubspec = true,
  bool withLib = true,
}) {
  final Directory root = Directory.systemTemp.createTempSync('bridge_analyzer_test_');
  addTearDown(() => root.deleteSync(recursive: true));

  final Directory projectDir = packageConfigAtParent
      ? (Directory(p.join(root.path, 'packages', name))..createSync(recursive: true))
      : root;

  if (withPubspec) {
    final StringBuffer pubspec = StringBuffer('name: $name\nenvironment:\n  sdk: ^3.11.0\n');
    if (isFlutter || dependencies.isNotEmpty) {
      pubspec.writeln('dependencies:');
      if (isFlutter) {
        pubspec.writeln('  flutter:\n    sdk: flutter');
      }
      for (final String dependency in dependencies.keys) {
        if (dependency != 'flutter') {
          pubspec.writeln('  $dependency: ^1.0.0');
        }
      }
    }
    File(p.join(projectDir.path, 'pubspec.yaml')).writeAsStringSync(pubspec.toString());
  }

  if (withLib) {
    for (final MapEntry<String, String> entry in libraries.entries) {
      _write(p.join(projectDir.path, 'lib', entry.key), entry.value);
    }
  }

  if (withPackageConfig) {
    final Directory configHome = packageConfigAtParent ? root : projectDir;

    // The project's own package comes first. A real package config always lists it, and the loader
    // refuses one that does not: a config that has forgotten the package it sits next to is stale.
    final List<String> entries = <String>[
      _entry(name, _uriFrom(configHome.path, projectDir.path)),
    ];

    // Dependencies live outside the project, as a pub cache does.
    for (final MapEntry<String, Map<String, String>> dependency in dependencies.entries) {
      final String packageRoot = p.join(root.path, '_packages', dependency.key);
      for (final MapEntry<String, String> file in dependency.value.entries) {
        _write(p.join(packageRoot, 'lib', file.key), file.value);
      }
      entries.add(_entry(dependency.key, _uriFrom(configHome.path, packageRoot)));
    }

    _write(
      p.join(configHome.path, '.dart_tool', 'package_config.json'),
      '{"configVersion": 2, "packages": [${entries.join(', ')}]}\n',
    );
  }

  return projectDir.path;
}

/// Replaces a project's `pubspec.yaml`, for tests about how it is *read*.
///
/// The package config is left alone, so a rewrite that changes the package name produces exactly what
/// a rename without a `pub get` produces: a stale config.
void overwritePubspec(String projectRoot, String contents) {
  _write(p.join(projectRoot, 'pubspec.yaml'), contents);
}

/// One `packages` entry of a package config, as pub writes it.
String _entry(String name, String rootUri) =>
    '{"name": "$name", "rootUri": "$rootUri", "packageUri": "lib/"}';

void _write(String path, String contents) {
  File(path)
    ..parent.createSync(recursive: true)
    ..writeAsStringSync(contents);
}

/// A `rootUri` as pub writes it: relative to the directory holding the package config, POSIX-style.
String _uriFrom(String configHome, String target) =>
    p.url.joinAll(p.split(p.relative(target, from: p.join(configHome, '.dart_tool'))));
