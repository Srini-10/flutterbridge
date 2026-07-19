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
  void removeListener(void Function() listener) {}
  void dispose() {}
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

enum MainAxisAlignment { start, end, center, spaceBetween, spaceAround, spaceEvenly }

enum CrossAxisAlignment { start, end, center, stretch, baseline }

enum MainAxisSize { min, max }

class Column extends Widget {
  const Column({this.mainAxisAlignment, this.crossAxisAlignment, this.mainAxisSize, this.children = const <Widget>[], super.key});
  final MainAxisAlignment? mainAxisAlignment;
  final CrossAxisAlignment? crossAxisAlignment;
  final MainAxisSize? mainAxisSize;
  final List<Widget> children;
}

class Row extends Widget {
  const Row({this.mainAxisAlignment, this.crossAxisAlignment, this.mainAxisSize, this.children = const <Widget>[], super.key});
  final MainAxisAlignment? mainAxisAlignment;
  final CrossAxisAlignment? crossAxisAlignment;
  final MainAxisSize? mainAxisSize;
  final List<Widget> children;
}

class Padding extends Widget {
  const Padding({required this.child, this.padding, super.key});
  final Widget child;
  final Object? padding;
}

class Scaffold extends Widget {
  const Scaffold({
    this.appBar,
    this.body,
    this.bottomNavigationBar,
    this.bottomSheet,
    this.drawer,
    this.endDrawer,
    this.floatingActionButton,
    this.extendBodyBehindAppBar = false,
    super.key,
  });
  final Widget? appBar;
  final Widget? body;
  final Widget? bottomNavigationBar;
  final Widget? bottomSheet;
  final Widget? drawer;
  final Widget? endDrawer;
  final Widget? floatingActionButton;
  final bool extendBodyBehindAppBar;
}

class AppBar extends Widget {
  const AppBar({
    this.title,
    this.leading,
    this.actions = const <Widget>[],
    this.bottom,
    this.flexibleSpace,
    this.centerTitle,
    this.toolbarHeight,
    super.key,
  });
  final Widget? title;
  final Widget? leading;
  final List<Widget> actions;
  final Widget? bottom;
  final Widget? flexibleSpace;
  final bool? centerTitle;
  final double? toolbarHeight;
}

class ElevatedButton extends Widget {
  const ElevatedButton({required this.onPressed, required this.child, super.key});
  final void Function()? onPressed;
  final Widget child;
}

class SizedBox extends Widget {
  const SizedBox({this.height, this.width, this.child, super.key});
  final double? height;
  final double? width;
  final Widget? child;
}

class Center extends Widget {
  const Center({this.child, super.key});
  final Widget? child;
}

class Expanded extends Widget {
  const Expanded({this.flex = 1, this.child, super.key});
  final int flex;
  final Widget? child;
}

class Flexible extends Widget {
  const Flexible({this.flex = 1, this.fit, this.child, super.key});
  final int flex;
  final Object? fit;
  final Widget? child;
}

class Spacer extends Widget {
  const Spacer({this.flex = 1, super.key});
  final int flex;
}

class Divider extends Widget {
  const Divider({this.height, this.thickness, this.color, this.indent, this.endIndent, super.key});
  final double? height;
  final double? thickness;
  final Object? color;
  final double? indent;
  final double? endIndent;
}

class VerticalDivider extends Widget {
  const VerticalDivider({this.width, this.thickness, this.color, this.indent, this.endIndent, super.key});
  final double? width;
  final double? thickness;
  final Object? color;
  final double? indent;
  final double? endIndent;
}

class Wrap extends Widget {
  const Wrap({this.spacing = 0, this.runSpacing = 0, this.alignment, this.children = const <Widget>[], super.key});
  final double spacing;
  final double runSpacing;
  final Object? alignment;
  final List<Widget> children;
}

class Stack extends Widget {
  const Stack({this.alignment, this.fit, this.children = const <Widget>[], super.key});
  final Object? alignment;
  final Object? fit;
  final List<Widget> children;
}

class Positioned extends Widget {
  const Positioned({this.top, this.left, this.right, this.bottom, this.width, this.height, this.child, super.key});
  final double? top;
  final double? left;
  final double? right;
  final double? bottom;
  final double? width;
  final double? height;
  final Widget? child;
}

class Alignment {
  const Alignment(this.x, this.y);
  final double x;
  final double y;
  static const Alignment topLeft = Alignment(-1, -1);
  static const Alignment center = Alignment(0, 0);
  static const Alignment bottomRight = Alignment(1, 1);
}

class AlignmentDirectional {
  const AlignmentDirectional(this.start, this.y);
  final double start;
  final double y;
  static const AlignmentDirectional topStart = AlignmentDirectional(-1, -1);
  static const AlignmentDirectional center = AlignmentDirectional(0, 0);
}

class BoxConstraints {
  const BoxConstraints({
    this.minWidth = 0,
    this.maxWidth = double.infinity,
    this.minHeight = 0,
    this.maxHeight = double.infinity,
  });
  final double minWidth;
  final double maxWidth;
  final double minHeight;
  final double maxHeight;
}

class Align extends Widget {
  const Align({this.alignment = Alignment.center, this.child, super.key});
  final Object alignment;
  final Widget? child;
}

class ConstrainedBox extends Widget {
  const ConstrainedBox({required this.constraints, this.child, super.key});
  final BoxConstraints constraints;
  final Widget? child;
}

class AspectRatio extends Widget {
  const AspectRatio({required this.aspectRatio, this.child, super.key});
  final double aspectRatio;
  final Widget? child;
}

class FractionallySizedBox extends Widget {
  const FractionallySizedBox({this.widthFactor, this.heightFactor, this.child, super.key});
  final double? widthFactor;
  final double? heightFactor;
  final Widget? child;
}

class SafeArea extends Widget {
  const SafeArea({this.top = true, this.bottom = true, this.left = true, this.right = true, this.child, super.key});
  final bool top;
  final bool bottom;
  final bool left;
  final bool right;
  final Widget? child;
}

/// The packed-int form of `Color`. `_colourOf` reads `value` for pre-3.27 Flutter, which is what this is.
class Color {
  const Color(this.value);
  const Color.fromARGB(int a, int r, int g, int b)
      : value = (((a & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) & 0xFFFFFFFF;
  const Color.fromRGBO(int r, int g, int b, double opacity)
      : value = ((((opacity * 0xff ~/ 1) & 0xff) << 24) |
                ((r & 0xff) << 16) |
                ((g & 0xff) << 8) |
                (b & 0xff)) &
            0xFFFFFFFF;
  final int value;
}

/// Only `fromSeed` is modelled: it is the constructor that makes N10 derive the Material role set, and the
/// one an app that wants a themed `Divider` has to use.
class ColorScheme {
  const ColorScheme.fromSeed({required this.seedColor});
  final Color seedColor;
}

class ThemeData {
  const ThemeData({this.colorScheme});
  final ColorScheme? colorScheme;
}

enum BoxFit { fill, contain, cover, fitWidth, fitHeight, none, scaleDown }

abstract class ImageProvider {
  const ImageProvider();
}

class AssetImage extends ImageProvider {
  const AssetImage(this.assetName, {this.package});
  final String assetName;
  final String? package;
}

class NetworkImage extends ImageProvider {
  const NetworkImage(this.url, {this.scale = 1.0});
  final String url;
  final double scale;
}

class Image extends Widget {
  const Image({required this.image, this.width, this.height, this.fit, this.semanticLabel, super.key})
      : name = null;
  const Image.asset(this.name, {this.width, this.height, this.fit, this.semanticLabel, super.key})
      : image = null;
  const Image.network(this.name, {this.width, this.height, this.fit, this.semanticLabel, super.key})
      : image = null;
  final Object? image;
  final String? name;
  final double? width;
  final double? height;
  final BoxFit? fit;
  final String? semanticLabel;
}

class IconData {
  const IconData(this.codePoint, {this.fontFamily, this.fontPackage});
  final int codePoint;
  final String? fontFamily;
  final String? fontPackage;
}

class Icons {
  static const IconData star = IconData(0xe5f9, fontFamily: 'MaterialIcons');
}

class Icon extends Widget {
  const Icon(this.icon, {this.size, this.semanticLabel, super.key});
  final IconData? icon;
  final double? size;
  final String? semanticLabel;
}

class Card extends Widget {
  const Card({this.elevation, this.child, super.key});
  final double? elevation;
  final Widget? child;
}

class Opacity extends Widget {
  const Opacity({required this.opacity, this.child, super.key});
  final double opacity;
  final Widget? child;
}

class Container extends Widget {
  const Container({this.width, this.height, this.padding, this.margin, this.constraints, this.alignment, this.color, this.decoration, this.child, super.key});
  final double? width;
  final double? height;
  final Object? padding;
  final Object? margin;
  final BoxConstraints? constraints;
  final Object? alignment;
  final Color? color;
  final BoxDecoration? decoration;
  final Widget? child;
}

enum Clip { none, hardEdge, antiAlias, antiAliasWithSaveLayer }

enum Axis { horizontal, vertical }

class Radius {
  const Radius.circular(this.value);
  final double value;
}

class BorderRadius {
  const BorderRadius.circular(this.value);
  final double value;
}

class ClipRect extends Widget {
  const ClipRect({this.clipBehavior = Clip.hardEdge, this.child, super.key});
  final Clip clipBehavior;
  final Widget? child;
}

class ClipRRect extends Widget {
  const ClipRRect({this.borderRadius, this.clipBehavior = Clip.antiAlias, this.child, super.key});
  final BorderRadius? borderRadius;
  final Clip clipBehavior;
  final Widget? child;
}

class ListView extends Widget {
  const ListView({this.scrollDirection = Axis.vertical, this.padding, this.shrinkWrap = false, this.children = const <Widget>[], super.key});
  const ListView.builder({required this.itemCount, required this.itemBuilder, this.scrollDirection = Axis.vertical, this.padding, this.shrinkWrap = false, super.key}) : children = const <Widget>[];
  const ListView.separated({required this.itemCount, required this.itemBuilder, required Widget Function(BuildContext, int) separatorBuilder, this.scrollDirection = Axis.vertical, this.padding, this.shrinkWrap = false, super.key}) : children = const <Widget>[];
  final Axis scrollDirection;
  final Object? padding;
  final bool shrinkWrap;
  final List<Widget> children;
  final int? itemCount;
  final Widget Function(BuildContext, int)? itemBuilder;
}

class SingleChildScrollView extends Widget {
  const SingleChildScrollView({this.scrollDirection = Axis.vertical, this.padding, this.child, super.key});
  final Axis scrollDirection;
  final Object? padding;
  final Widget? child;
}

class GridView extends Widget {
  const GridView.count({required this.crossAxisCount, this.mainAxisSpacing = 0, this.crossAxisSpacing = 0, this.childAspectRatio = 1, this.shrinkWrap = false, this.children = const <Widget>[], super.key})
      : gridDelegate = null, itemCount = null, itemBuilder = null;
  const GridView.builder({required this.gridDelegate, required this.itemCount, required this.itemBuilder, this.shrinkWrap = false, super.key})
      : crossAxisCount = 0, mainAxisSpacing = 0, crossAxisSpacing = 0, childAspectRatio = 1, children = const <Widget>[];
  final Object? gridDelegate;
  final int? itemCount;
  final Widget Function(BuildContext, int)? itemBuilder;
  final int crossAxisCount;
  final double mainAxisSpacing;
  final double crossAxisSpacing;
  final double childAspectRatio;
  final bool shrinkWrap;
  final List<Widget> children;
}

class ListTile extends Widget {
  const ListTile({this.leading, this.title, this.subtitle, this.trailing, this.isThreeLine = false, super.key});
  final Widget? leading;
  final Widget? title;
  final Widget? subtitle;
  final Widget? trailing;
  final bool isThreeLine;
}

class Chip extends Widget {
  const Chip({required this.label, this.avatar, super.key});
  final Widget label;
  final Widget? avatar;
}

class CircleAvatar extends Widget {
  const CircleAvatar({this.radius, this.child, super.key});
  final double? radius;
  final Widget? child;
}

class Badge extends Widget {
  const Badge({this.label, this.child, this.isLabelVisible = true, super.key});
  final Widget? label;
  final Widget? child;
  final bool isLabelVisible;
}

class LinearProgressIndicator extends Widget {
  const LinearProgressIndicator({this.value, this.minHeight, super.key});
  final double? value;
  final double? minHeight;
}

class CircularProgressIndicator extends Widget {
  const CircularProgressIndicator({this.value, this.strokeWidth, super.key});
  final double? value;
  final double? strokeWidth;
}

class Tooltip extends Widget {
  const Tooltip({this.message, this.child, super.key});
  final String? message;
  final Widget? child;
}

class SelectableText extends Widget {
  const SelectableText(this.data, {super.key});
  final String data;
}

class TextSpan {
  const TextSpan({this.text, this.children, this.fontSize, this.fontWeight});
  final String? text;
  final List<TextSpan>? children;
  final double? fontSize;
  final int? fontWeight;
}

class RichText extends Widget {
  const RichText({required this.text, this.maxLines, super.key});
  final TextSpan text;
  final int? maxLines;
}

class Hero extends Widget {
  const Hero({required this.tag, this.child, super.key});
  final Object tag;
  final Widget? child;
}

/// A colour that also indexes a set of shades — Flutter's `ColorSwatch`, and the shape that made M5-A's
/// D1/D2 invisible to this fixture for five milestones.
///
/// Two things about it matter, and both are structural rather than incidental:
///
///  1. **It extends `Color`,** so recognising it demands a *supertype* test. A name test sees
///     `MaterialColor`, not `Color`, and silently declines to read it (D1).
///  2. **Its channels are declared on `Color`, not on itself,** so the constant model puts them behind a
///     synthetic `(super)` object two levels up. `getField('value')` on a `MaterialColor` returns null,
///     and a reader that does not walk finds nothing (D2).
///
/// Before this existed, the stub could only express plain `Color`s — which is exactly why the build proof
/// passed while every `Colors.<swatch>` in a real application resolved to nothing.
class ColorSwatch<T> extends Color {
  const ColorSwatch(super.primary, this._swatch);
  final Map<T, Color> _swatch;
  Color? operator [](T index) => _swatch[index];
}

class MaterialColor extends ColorSwatch<int> {
  const MaterialColor(super.primary, super.swatch);
}

class Colors {
  static const Color black12 = Color(0x1F000000);
  static const Color white = Color(0xFFFFFFFF);
  static const Color transparent = Color(0x00000000);

  /// A swatch, with its primary two `(super)` levels below the constant a user writes.
  static const MaterialColor indigo = MaterialColor(0xFF3F51B5, <int, Color>{
    500: Color(0xFF3F51B5),
    200: Color(0xFF9FA8DA),
  });
}

class BorderSide {
  const BorderSide({this.color = const Color(0xFF000000), this.width = 1.0});
  final Color color;
  final double width;
}

class Border {
  const Border.all({this.color = const Color(0xFF000000), this.width = 1.0});
  final Color color;
  final double width;
}

class Offset {
  const Offset(this.dx, this.dy);
  final double dx;
  final double dy;
}

class BoxShadow {
  const BoxShadow({this.color = const Color(0xFF000000), this.blurRadius = 0.0, this.spreadRadius = 0.0, this.offset = const Offset(0, 0)});
  final Color color;
  final double blurRadius;
  final double spreadRadius;
  final Offset offset;
}

class LinearGradient {
  const LinearGradient({required this.colors, this.begin, this.end});
  final List<Color> colors;
  final Object? begin;
  final Object? end;
}

enum BoxShape { rectangle, circle }

class BoxDecoration {
  const BoxDecoration({this.color, this.border, this.borderRadius, this.boxShadow, this.gradient, this.shape = BoxShape.rectangle});
  final Color? color;
  final Border? border;
  final BorderRadius? borderRadius;
  final List<BoxShadow>? boxShadow;
  final LinearGradient? gradient;
  final BoxShape shape;
}

class ColoredBox extends Widget {
  const ColoredBox({required this.color, this.child, super.key});
  final Color color;
  final Widget? child;
}

class DecoratedBox extends Widget {
  const DecoratedBox({required this.decoration, this.child, super.key});
  final BoxDecoration decoration;
  final Widget? child;
}

class Material extends Widget {
  const Material({this.color, this.elevation, this.borderRadius, this.child, super.key});
  final Color? color;
  final double? elevation;
  final BorderRadius? borderRadius;
  final Widget? child;
}

class Ink extends Widget {
  const Ink({this.color, this.decoration, this.width, this.height, this.child, super.key});
  final Color? color;
  final BoxDecoration? decoration;
  final double? width;
  final double? height;
  final Widget? child;
}

class TextEditingController extends ChangeNotifier {
  TextEditingController({this.text = ''});
  String text;
  void clear() {}
}

class FocusNode extends ChangeNotifier {
  FocusNode();
  bool get hasFocus => false;
  void requestFocus() {}
}

enum TextInputType { text, number, emailAddress, phone, url, multiline }

enum TextInputAction { done, next, send, search, go }

enum TextCapitalization { none, words, sentences, characters }

class InputDecoration {
  const InputDecoration({this.labelText, this.hintText, this.helperText, this.errorText, this.filled});
  final String? labelText;
  final String? hintText;
  final String? helperText;
  final String? errorText;
  final bool? filled;
}

class TextField extends Widget {
  const TextField({
    this.controller,
    this.focusNode,
    this.decoration,
    this.keyboardType,
    this.textInputAction,
    this.obscureText = false,
    this.maxLines = 1,
    this.minLines,
    this.enabled,
    this.readOnly = false,
    this.autofocus = false,
    this.onChanged,
    this.onSubmitted,
    super.key,
  });
  final TextEditingController? controller;
  final FocusNode? focusNode;
  final InputDecoration? decoration;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool obscureText;
  final int? maxLines;
  final int? minLines;
  final bool? enabled;
  final bool readOnly;
  final bool autofocus;
  final void Function(String)? onChanged;
  final void Function(String)? onSubmitted;
}

class TextFormField extends Widget {
  const TextFormField({this.controller, this.initialValue, this.decoration, this.validator, this.onChanged, super.key});
  final TextEditingController? controller;
  final String? initialValue;
  final InputDecoration? decoration;
  final String? Function(String?)? validator;
  final void Function(String)? onChanged;
}

class Form extends Widget {
  const Form({this.child, super.key});
  final Widget? child;
}

class Checkbox extends Widget {
  const Checkbox({required this.value, required this.onChanged, super.key});
  final bool? value;
  final void Function(bool?)? onChanged;
}

class Switch extends Widget {
  const Switch({required this.value, required this.onChanged, super.key});
  final bool value;
  final void Function(bool)? onChanged;
}

class Slider extends Widget {
  const Slider({required this.value, required this.onChanged, this.min = 0.0, this.max = 1.0, this.divisions, super.key});
  final double value;
  final void Function(double)? onChanged;
  final double min;
  final double max;
  final int? divisions;
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
