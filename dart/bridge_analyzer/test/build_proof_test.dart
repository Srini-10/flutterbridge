/// The analyzer half of the cross-language build-proof (M3-D).
///
/// The generator's `build.test.ts` typechecks emitted React against the real runtime kit. For years it
/// did so against a **hand-built** UIR — a program no analyzer run ever produced — and that is exactly
/// how the child-slot mismatch (validation B1) survived: the fixture put a single child in `slots`, which
/// is what the generator wants, while the real analyzer put it in `children`, which is what broke. A build
/// proof over an imagined program proves nothing about the real one.
///
/// So the build-proof is now grounded in a **committed golden UIR** (`fixtures/uir/layout_proof.ndjson`)
/// that the generator consumes. This test is the other half of the contract: it runs the **real analyzer**
/// over the fixture's Flutter source and asserts the golden is byte-for-byte what the analyzer produces.
///
/// Together they fail on drift in either direction: change the analyzer's output shape and this test fails
/// (regenerate the golden); regenerate a golden the generator cannot build and `build.test.ts` fails. The
/// source of truth is one thing — [layoutProofSource] — and the golden is derived from it, here.
@TestOn('vm')
library;

import 'dart:convert';
import 'dart:io';

import 'package:bridge_analyzer/bridge_analyzer.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

import 'support/temp_project.dart';

/// A stand-in `flutter` with the widgets the fixture uses. Recognition is by resolved supertype, so these
/// are genuine classes; `Center`, `EdgeInsets` and `runApp` are the ones the shared stub does not already
/// carry, and M4-G adds the application shell.
final Map<String, String> layoutFlutter = <String, String>{
  ...flutterPackage,
  'widgets.dart':
      '${flutterPackage['widgets.dart']!}\n'
      '''
class Center extends Widget {
  const Center({this.child, super.key});
  final Widget? child;
}

class EdgeInsets {
  const EdgeInsets.all(this.value);
  final double value;
}

void runApp(Widget app) {}

// ── M4-G: the application shell ──
//
// `Scaffold` and `AppBar` are in the shared stub with two slots each; the fixture exercises the whole
// surface, so they are redeclared here with it. Everything else is new.

class Drawer extends Widget {
  const Drawer({this.child, this.width, super.key});
  final Widget? child;
  final double? width;
}

class DrawerHeader extends Widget {
  const DrawerHeader({this.child, super.key});
  final Widget? child;
}

class NavigationDrawerDestination extends Widget {
  const NavigationDrawerDestination({this.icon, this.selectedIcon, this.label, super.key});
  final Widget? icon;
  final Widget? selectedIcon;
  final Widget? label;
}

class NavigationDrawer extends Widget {
  const NavigationDrawer({
    this.children = const <Widget>[],
    this.selectedIndex,
    this.onDestinationSelected,
    super.key,
  });
  final List<Widget> children;
  final int? selectedIndex;
  final void Function(int)? onDestinationSelected;
}

class NavigationDestination extends Widget {
  const NavigationDestination({this.icon, this.selectedIcon, this.label = '', super.key});
  final Widget? icon;
  final Widget? selectedIcon;
  final String label;
}

class NavigationBar extends Widget {
  const NavigationBar({
    this.destinations = const <Widget>[],
    this.selectedIndex = 0,
    this.onDestinationSelected,
    this.height,
    super.key,
  });
  final List<Widget> destinations;
  final int selectedIndex;
  final void Function(int)? onDestinationSelected;
  final double? height;
}

/// **Not a `Widget`** — and the fixture's whole point for it. See §3 of the M4-G report: naming
/// `destinations` as `NavigationRail`'s children property in the catalog is what puts these in the UI tree,
/// and without that entry the list fell into `props` and N8 reported BRG2110.
class NavigationRailDestination {
  const NavigationRailDestination({this.icon, this.selectedIcon, this.label});
  final Widget? icon;
  final Widget? selectedIcon;
  final Widget? label;
}

class NavigationRail extends Widget {
  const NavigationRail({
    this.destinations = const <NavigationRailDestination>[],
    this.selectedIndex,
    this.onDestinationSelected,
    this.extended = false,
    this.leading,
    this.trailing,
    super.key,
  });
  final List<NavigationRailDestination> destinations;
  final int? selectedIndex;
  final void Function(int)? onDestinationSelected;
  final bool extended;
  final Widget? leading;
  final Widget? trailing;
}

/// Not a `Widget` either — the same catalog mechanism carries it.
class BottomNavigationBarItem {
  const BottomNavigationBarItem({this.icon, this.activeIcon, this.label});
  final Widget? icon;
  final Widget? activeIcon;
  final String? label;
}

class BottomNavigationBar extends Widget {
  const BottomNavigationBar({
    this.items = const <BottomNavigationBarItem>[],
    this.currentIndex = 0,
    this.onTap,
    super.key,
  });
  final List<BottomNavigationBarItem> items;
  final int currentIndex;
  final void Function(int)? onTap;
}

class Size {
  const Size(this.width, this.height);
  const Size.fromHeight(this.height) : width = double.infinity;
  final double width;
  final double height;
}

class PreferredSize extends Widget {
  const PreferredSize({required this.preferredSize, required this.child, super.key});
  final Size preferredSize;
  final Widget child;
}

class IntrinsicHeight extends Widget {
  const IntrinsicHeight({this.child, super.key});
  final Widget? child;
}

class IntrinsicWidth extends Widget {
  const IntrinsicWidth({this.child, super.key});
  final Widget? child;
}

class OverflowBox extends Widget {
  const OverflowBox({
    this.minWidth,
    this.maxWidth,
    this.minHeight,
    this.maxHeight,
    this.alignment,
    this.child,
    super.key,
  });
  final double? minWidth;
  final double? maxWidth;
  final double? minHeight;
  final double? maxHeight;
  final Alignment? alignment;
  final Widget? child;
}

class MaterialBanner extends Widget {
  const MaterialBanner({
    required this.content,
    this.actions = const <Widget>[],
    this.leading,
    super.key,
  });
  final Widget content;
  final List<Widget> actions;
  final Widget? leading;
}

class BottomAppBar extends Widget {
  const BottomAppBar({this.child, this.height, super.key});
  final Widget? child;
  final double? height;
}

class IconButton extends Widget {
  const IconButton({required this.onPressed, this.icon, this.tooltip, super.key});
  final void Function()? onPressed;
  final Widget? icon;
  final String? tooltip;
}

class FloatingActionButton extends Widget {
  const FloatingActionButton({required this.onPressed, this.child, this.tooltip, this.mini = false, super.key});
  final void Function()? onPressed;
  final Widget? child;
  final String? tooltip;
  final bool mini;
}

// ── M4-H: implicit animation and lazy lists ──

class Duration {
  const Duration({this.days = 0, this.hours = 0, this.minutes = 0, this.seconds = 0, this.milliseconds = 0});
  final int days;
  final int hours;
  final int minutes;
  final int seconds;
  final int milliseconds;
}

class Curve { const Curve(); }

class Curves {
  static const Curve linear = Curve();
  static const Curve easeIn = Curve();
  static const Curve easeInOut = Curve();
  static const Curve fastOutSlowIn = Curve();
}

class AnimatedOpacity extends Widget {
  const AnimatedOpacity({required this.opacity, required this.duration, this.curve, this.child, super.key});
  final double opacity;
  final Duration duration;
  final Curve? curve;
  final Widget? child;
}

class AnimatedContainer extends Widget {
  const AnimatedContainer({
    required this.duration, this.curve, this.width, this.height, this.color,
    this.padding, this.margin, this.alignment, this.child, super.key,
  });
  final Duration duration;
  final Curve? curve;
  final double? width;
  final double? height;
  final Color? color;
  final EdgeInsets? padding;
  final EdgeInsets? margin;
  final Alignment? alignment;
  final Widget? child;
}

class AnimatedAlign extends Widget {
  const AnimatedAlign({required this.alignment, required this.duration, this.curve, this.child, super.key});
  final Alignment alignment;
  final Duration duration;
  final Curve? curve;
  final Widget? child;
}

class AnimatedPadding extends Widget {
  const AnimatedPadding({required this.padding, required this.duration, this.child, super.key});
  final EdgeInsets padding;
  final Duration duration;
  final Widget? child;
}

/// A per-item identity. In the fixture so that **N9's one real behaviour** — lifting a key the author
/// wrote from a list's template onto the list itself — is exercised against real analyzer output for the
/// first time. Without it the list keys by index, which N9 deliberately refuses to manufacture.
class ValueKey {
  const ValueKey(this.value);
  final Object value;
}

// ── M4-I ──

class ExpansionTile extends Widget {
  const ExpansionTile({
    required this.title, this.subtitle, this.leading, this.trailing,
    this.children = const <Widget>[], this.initiallyExpanded = false, super.key,
  });
  final Widget title;
  final Widget? subtitle;
  final Widget? leading;
  final Widget? trailing;
  final List<Widget> children;
  final bool initiallyExpanded;
}

class Tab extends Widget {
  const Tab({this.text, this.icon, super.key});
  final String? text;
  final Widget? icon;
}

class TabBar extends Widget {
  const TabBar({this.tabs = const <Widget>[], this.isScrollable = false, super.key});
  final List<Widget> tabs;
  final bool isScrollable;
}

class TabBarView extends Widget {
  const TabBarView({this.children = const <Widget>[], super.key});
  final List<Widget> children;
}

class ChoiceChip extends Widget {
  const ChoiceChip({required this.label, required this.selected, this.onSelected, super.key});
  final Widget label;
  final bool selected;
  final void Function(bool)? onSelected;
}

class FilterChip extends Widget {
  const FilterChip({required this.label, required this.selected, this.onSelected, super.key});
  final Widget label;
  final bool selected;
  final void Function(bool)? onSelected;
}

class ActionChip extends Widget {
  const ActionChip({required this.label, this.onPressed, super.key});
  final Widget label;
  final void Function()? onPressed;
}

/// Rebuild-scoping wrappers. In the fixture so the build proof proves they are **erased** — the emitted
/// output must contain neither, because INV-22 says a framework runtime primitive may not survive.
class ListenableBuilder extends Widget {
  const ListenableBuilder({required this.listenable, required this.builder, super.key});
  final Object listenable;
  final Widget Function(BuildContext, Widget?) builder;
}

class ValueListenableBuilder<T> extends Widget {
  const ValueListenableBuilder({required this.valueListenable, required this.builder, super.key});
  final ValueNotifier<T> valueListenable;
  final Widget Function(BuildContext, T, Widget?) builder;
}

class PageView extends Widget {
  const PageView({this.children = const <Widget>[], this.scrollDirection = Axis.horizontal, this.reverse = false, super.key});
  final List<Widget> children;
  final Axis scrollDirection;
  final bool reverse;
}

''',
};

/// The `gap` package, as a real resolvable dependency.
///
/// A *package*, not the framework, and that is the point of its presence: M4-I proved ADR-18's claim that a
/// package costs one catalog, one adapter and one line in the registry. The build proof is where that claim
/// is exercised end to end — `Gap` is the most-used widget the M0 corpus contains that the compiler could
/// not render, at 115 instantiations.
const Map<String, String> gapPackage = <String, String>{
  'gap.dart': '''
import 'package:flutter/widgets.dart';

class Gap extends Widget {
  const Gap(this.mainAxisExtent, {super.key});
  final double mainAxisExtent;
}
''',
};

/// The fixture: a realistic application shell, and the whole generatable surface inside it.
///
/// ## What each milestone added, and why none of it is decoration
///
/// **M3-D** made this a real build proof at all: the golden below is minted from *this source* by the real
/// analyzer, and `build.test.ts` takes it through the real compiler, the real generator and `tsc` against the
/// unmocked kit. A proof over a hand-built UIR proves the imagination is consistent — which is exactly how
/// the child-slot mismatch (validation B1) survived.
///
/// **M4-B** added `ColorScheme.fromSeed`. `Divider` paints `outlineVariant`, and M4-B made that a *declared*
/// capability checked against the program's own tokens (`BRG3010`) — so the seed is the difference between a
/// program that generates and one that is correctly refused, and the proof exercises the whole token path.
///
/// **M4-E** added colours in every form real code writes them, **M4-F** a form driven by a real controller.
///
/// **M4-G** made it an *application* rather than a screen. Until this milestone the fixture's root was a bare
/// `SafeArea`, and the reason is worth stating: `MaterialApp` and `Scaffold` had no mapping, so a fixture
/// that used them could not generate. That is not a small gap — `hello_bridge`, this project's own
/// walking-skeleton, emitted **zero files** for exactly that reason. So the proof now carries the shell every
/// real Flutter application has: an app root with a route table and a theme, a `Scaffold` with every
/// structural slot filled, an `AppBar` with a leading button, actions and a `PreferredSize` bottom, a
/// `Drawer` holding a `NavigationDrawer`, a `NavigationBar`, and a second screen with a `NavigationRail` and
/// a `BottomNavigationBar`.
///
/// Three things in here are load-bearing beyond coverage:
///
///  * **`onDestinationSelected: _select`** is a *method tear-off*. Every callback in this fixture before M4-G
///    was an inline lambda, which is why nothing caught that a tear-off reached the generator as a
///    `logic.Ref` with no `target` — the `sig.Action` existed and was unreachable.
///  * **`NavigationRail(destinations: …)`** holds `NavigationRailDestination`s, which are **not Flutter
///    `Widget`s**. Before M4-G's catalog entry the whole list landed in `props` and N8 reported `BRG2110`.
///  * **The two routes and the theme** prove that the app root is *consumed* rather than rendered: no
///    component file is emitted for `ProofApp`, and `app/page.tsx` renders the route at `/`.
const String layoutProofSource = r"""
import 'package:flutter/material.dart';
import 'package:gap/gap.dart';

void main() => runApp(const ProofApp());

/// The application root. It emits **no component file**: `home`/`routes` are already `app.Route` nodes and
/// `theme` is already the token set N10 expands, so the generated App Router project is its lowering.
class ProofApp extends StatelessWidget {
  const ProofApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
        home: const HomeScreen(),
        routes: <String, Widget Function(BuildContext)>{
          '/browse': (BuildContext context) => const BrowseScreen(),
        },
      );
}

/// The second route — and the screen that exercises the two navigation surfaces whose items are not widgets.
class BrowseScreen extends StatelessWidget {
  const BrowseScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: const AppBar(title: Text('Browse'), centerTitle: true),
        body: Row(
          children: <Widget>[
            const NavigationRail(
              extended: true,
              selectedIndex: 1,
              leading: Icon(Icons.star),
              destinations: <NavigationRailDestination>[
                NavigationRailDestination(icon: Icon(Icons.star), label: Text('All')),
                NavigationRailDestination(icon: Icon(Icons.star), label: Text('Starred')),
              ],
            ),
            Expanded(
              child: Column(
                children: const <Widget>[
                  MaterialBanner(
                    content: Text('Two items need attention'),
                    leading: Icon(Icons.star),
                    actions: <Widget>[Text('Dismiss')],
                  ),
                  IntrinsicHeight(
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: <Widget>[Text('left'), VerticalDivider(width: 16), Text('right')],
                    ),
                  ),
                  IntrinsicWidth(child: Text('as wide as this text')),
                  OverflowBox(maxWidth: 400, alignment: Alignment.topLeft, child: Text('overflowing')),
                ],
              ),
            ),
          ],
        ),
        bottomNavigationBar: const BottomNavigationBar(
          currentIndex: 0,
          items: <BottomNavigationBarItem>[
            BottomNavigationBarItem(icon: Icon(Icons.star), label: 'All'),
            BottomNavigationBarItem(icon: Icon(Icons.star), label: 'Starred'),
          ],
        ),
      );
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _count = 3;
  int _tab = 0;
  bool _expanded = false;
  // Mutable, so it is a `sig.Signal`. A `final` list that nothing mutates is a *constant* field, and M4-H
  // found that extraction emits nothing at all for one — no `logic.FieldDecl`, no signal — so the generator
  // reports BRG3006 for a name the program does declare. That gap is real and is recorded as an M4-I
  // blocker; the build proof stays inside the supported surface rather than smuggling it in, which is the
  // same rule M4-B applied when it kept a store out of this fixture.
  // A list of `String`, not of the application's own model type — and that is a stated limit rather than a
  // simplification. M4-H found that a construction of a user class emits a reference to a class the
  // generator never writes (M3-B lowers no `logic.ClassDecl`), which used to reach `tsc` as
  // `TS2552: Cannot find name`. It is now refused by name, and the build proof stays inside the supported
  // surface — the same rule M4-B applied when it kept a store out of this fixture. Recorded as an M4-I
  // blocker: a list of models is the shape every real list-backed screen has.
  //
  // Mutable, so it is a `sig.Signal`: a `final` field nothing mutates is a *constant*, and extraction emits
  // nothing at all for one, which is the other gap M4-H found here.
  List<String> _wonders = const <String>['Petra', 'Colosseum'];

  /// A `ValueNotifier` is a signal — the catalog lists it among its `stateHolders` — which is what makes a
  /// `ValueListenableBuilder` erasable rather than merely renderable.
  final ValueNotifier<int> _ticks = ValueNotifier<int>(0);
  final TextEditingController _email = TextEditingController();
  final FocusNode _emailFocus = FocusNode();
  bool _accepted = false;
  double _volume = 0.5;
  String _note = '';

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  /// A method that writes state, so it is a `sig.Action`. Passed below as a **tear-off**, which is the shape
  /// that found the missing binding — see this fixture's header.
  void _select(int index) {
    setState(() {
      _tab = index;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(
          title: Text('count: $_count'),
          leading: IconButton(
            tooltip: 'Menu',
            icon: const Icon(Icons.star),
            onPressed: () {
              setState(() {
                _count = _count + 1;
              });
            },
          ),
          actions: <Widget>[
            IconButton(
              tooltip: 'Star',
              icon: const Icon(Icons.star),
              onPressed: () {
                setState(() {
                  _count = 0;
                });
              },
            ),
          ],
          bottom: const PreferredSize(
            preferredSize: Size.fromHeight(32),
            child: Text('a subtitle bar'),
          ),
        ),
        drawer: Drawer(
          child: NavigationDrawer(
            selectedIndex: _tab,
            onDestinationSelected: _select,
            children: const <Widget>[
              DrawerHeader(child: Text('FlutterBridge')),
              NavigationDrawerDestination(icon: Icon(Icons.star), label: Text('Home')),
              NavigationDrawerDestination(icon: Icon(Icons.star), label: Text('Browse')),
            ],
          ),
        ),
        floatingActionButton: FloatingActionButton(
          tooltip: 'Add',
          onPressed: () {
            setState(() {
              _count = _count + 1;
            });
          },
          child: const Icon(Icons.star),
        ),
        bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: _select,
          destinations: const <Widget>[
            NavigationDestination(icon: Icon(Icons.star), label: 'Home'),
            NavigationDestination(icon: Icon(Icons.star), label: 'Browse'),
          ],
        ),
        body: SafeArea(
          top: false,
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                // ── header: an avatar, a title and a badge ──
                Row(
                  children: <Widget>[
                    const CircleAvatar(radius: 24, child: Text('FB')),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: <Widget>[
                          Text('count: $_count'),
                          const SelectableText('tap and hold to select'),
                        ],
                      ),
                    ),
                    const Badge(label: Text('9'), child: Icon(Icons.star, size: 20)),
                  ],
                ),
                const Divider(height: 24, thickness: 1),

                // ── progress ──
                const LinearProgressIndicator(value: 0.4),
                const SizedBox(height: 8),
                const Align(
                  alignment: Alignment.center,
                  child: CircularProgressIndicator(value: 0.75),
                ),
                const SizedBox(height: 12),

                // ── a card holding a list of tiles ──
                Card(
                  elevation: 2,
                  child: ListView(
                    shrinkWrap: true,
                    children: const <Widget>[
                      ListTile(
                        leading: Icon(Icons.star),
                        title: Text('First item'),
                        subtitle: Text('with a subtitle'),
                        trailing: Icon(Icons.star),
                      ),
                      ListTile(title: Text('Second item')),
                    ],
                  ),
                ),
                const SizedBox(height: 12),

                // ── chips, wrapped ──
                Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: const <Widget>[
                    Chip(label: Text('layout')),
                    Chip(label: Text('assets'), avatar: Icon(Icons.star)),
                  ],
                ),
                const SizedBox(height: 12),

                // ── a grid of clipped images ──
                GridView.count(
                  crossAxisCount: 2,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  shrinkWrap: true,
                  children: <Widget>[
                    ClipRRect(
                      borderRadius: const BorderRadius.circular(12),
                      child: const Image(image: AssetImage('images/bg.png')),
                    ),
                    const ClipRect(
                      child: Image.asset('images/logo.png', fit: BoxFit.cover),
                    ),
                    const AspectRatio(
                      aspectRatio: 1.5,
                      child: Image.network('https://example.com/a.png'),
                    ),
                    const Tooltip(message: 'a hint', child: Text('hover me')),
                  ],
                ),
                const SizedBox(height: 12),

                // ── M4-E: colours and decoration, in every form real code writes them ──
                const ColoredBox(color: Color(0xFF2196F3), child: Text('literal colour')),
                const ColoredBox(color: Colors.white, child: Text('named colour')),
                const ColoredBox(
                  color: Color.fromARGB(255, 33, 150, 243),
                  child: Text('argb colour'),
                ),
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: const BorderRadius.circular(8),
                    border: const Border.all(color: Colors.black12, width: 2),
                    boxShadow: const <BoxShadow>[
                      BoxShadow(color: Colors.black12, blurRadius: 4, offset: Offset(0, 2)),
                    ],
                  ),
                  child: const Text('decorated'),
                ),
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: <Color>[Colors.white, Colors.black12]),
                  ),
                  child: Text('gradient'),
                ),
                const Material(
                  color: Colors.white,
                  elevation: 3,
                  borderRadius: BorderRadius.circular(4),
                  child: Text('material surface'),
                ),
                const Ink(
                  decoration: BoxDecoration(color: Colors.black12),
                  width: 80,
                  height: 24,
                  child: Text('ink'),
                ),

                // ── M4-F: forms and input, driven by a real controller ──
                Form(
                  child: Column(
                    children: <Widget>[
                      TextField(
                        controller: _email,
                        focusNode: _emailFocus,
                        decoration: const InputDecoration(
                          labelText: 'Email',
                          hintText: 'you@example.com',
                        ),
                        keyboardType: TextInputType.emailAddress,
                        textInputAction: TextInputAction.next,
                        autofocus: true,
                        onChanged: (String value) {
                          setState(() {
                            _note = value;
                          });
                        },
                      ),
                      const TextField(
                        obscureText: true,
                        enabled: false,
                        readOnly: true,
                        decoration: InputDecoration(labelText: 'Password', errorText: 'too short'),
                      ),
                      const TextField(
                        maxLines: 4,
                        minLines: 2,
                        decoration: InputDecoration(hintText: 'Notes'),
                      ),
                      TextFormField(
                        initialValue: 'seed',
                        decoration: const InputDecoration(labelText: 'Name'),
                        validator: (String? value) {
                          if (value == null) {
                            return 'required';
                          }
                          return null;
                        },
                      ),
                      Checkbox(
                        value: _accepted,
                        onChanged: (bool? value) {
                          setState(() {
                            _accepted = value ?? false;
                          });
                        },
                      ),
                      Switch(
                        value: _accepted,
                        onChanged: (bool value) {
                          setState(() {
                            _accepted = value;
                          });
                        },
                      ),
                      Slider(
                        value: _volume,
                        min: 0,
                        max: 10,
                        divisions: 10,
                        onChanged: (double value) {
                          setState(() {
                            _volume = value;
                          });
                        },
                      ),
                      Text(_note),
                    ],
                  ),
                ),

                // ── constrained, aligned, fractional and rich content ──
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 400),
                  child: Container(
                    width: 200,
                    padding: const EdgeInsets.all(8),
                    alignment: Alignment.center,
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const FractionallySizedBox(
                      widthFactor: 0.5,
                      child: Opacity(opacity: 0.8, child: Text('half, faded')),
                    ),
                  ),
                ),
                const RichText(
                  maxLines: 2,
                  text: TextSpan(
                    text: 'a paragraph with ',
                    children: <TextSpan>[TextSpan(text: 'bold', fontWeight: 700)],
                  ),
                ),
                Stack(
                  alignment: Alignment.center,
                  children: <Widget>[
                    const SizedBox(width: 40, height: 40),
                    Positioned(top: 4, left: 4, child: const Text('badge')),
                  ],
                ),
                Row(
                  children: <Widget>[
                    Expanded(flex: 2, child: const Text('a')),
                    const Spacer(),
                    Flexible(child: const Text('b')),
                    const VerticalDivider(width: 16),
                  ],
                ),

              // ── M4-H: implicit animation. A target value and a duration, which is a CSS transition —
              //    not the animation engine. Every prop below is an ordinary binding: `_expanded` is a
              //    component signal, so `width` arrives as a `bind.Signal` exactly as a plain Container's
              //    would, and the curve resolves through the same kit static-const path `BoxFit.cover`
              //    takes. Nothing here needed a construct that does not already exist.
              AnimatedOpacity(
                opacity: _expanded ? 1.0 : 0.25,
                duration: const Duration(milliseconds: 300),
                curve: Curves.easeInOut,
                child: const Text('fades'),
              ),
              AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                curve: Curves.fastOutSlowIn,
                width: _expanded ? 240 : 120,
                height: 48,
                color: Colors.white,
                padding: const EdgeInsets.all(8),
                child: const Text('resizes'),
              ),
              const AnimatedAlign(
                alignment: Alignment.bottomRight,
                duration: Duration(milliseconds: 150),
                child: Text('realigns'),
              ),
              const AnimatedPadding(
                padding: EdgeInsets.all(12),
                duration: Duration(milliseconds: 150),
                child: Text('repads'),
              ),

              // ── M4-H: a lazy list, expanded into a `ui.List` by extraction ──
              //
              // `itemCount` is `_wonders.length` and the builder's index is used for nothing but
              // `_wonders[index]`, so this **is** a for-each over `_wonders` and is proved to be one before
              // it is rewritten. Until M4-H `_wonders[index]` reached UIR as an opaque expression, which is
              // why the collection was invisible and the whole builder unsupported.
              ListView.builder(
                shrinkWrap: true,
                itemCount: _wonders.length,
                itemBuilder: (BuildContext context, int index) => ListTile(
                  key: ValueKey(_wonders[index]),
                  title: Text(_wonders[index]),
                ),
              ),

              // ── M4-H: paged scrolling, via CSS scroll snapping ──
              const PageView(
                children: <Widget>[Text('page one'), Text('page two')],
              ),

              // ── M4-I: the `gap` package. Not a Flutter widget at all — resolved through a *package*
              //    catalog and adapter (ADR-18). 115 uses in the M0 corpus, more than Container.
              const Gap(16),

              // ── M4-I: disclosure and tabs, each on a native element that already owns the semantics ──
              const ExpansionTile(
                title: Text('Details'),
                subtitle: Text('tap to open'),
                initiallyExpanded: true,
                children: <Widget>[Text('the body')],
              ),
              TabBar(
                tabs: const <Widget>[Tab(text: 'One'), Tab(text: 'Two')],
              ),
              const TabBarView(children: <Widget>[Text('first'), Text('second')]),

              // ── M4-I: the selectable chips ──
              ChoiceChip(label: const Text('choice'), selected: _expanded),
              FilterChip(label: const Text('filter'), selected: _accepted),
              ActionChip(label: const Text('action'), onPressed: () {}),

              // ── M4-I: rebuild-scoping wrappers, which must NOT survive extraction (INV-22) ──
              //
              // Under ADR-4 a signal read *is* the subscription, so the rebuild scope these declare by hand
              // is what the signal graph computes. The build proof asserts the emitted output contains
              // neither wrapper — only the bodies.
              ValueListenableBuilder<int>(
                valueListenable: _ticks,
                builder: (BuildContext context, int value, Widget? child) => Text('ticks'),
              ),
              ListenableBuilder(
                listenable: _ticks,
                builder: (BuildContext context, Widget? child) => const Text('listening'),
              ),
              ],
            ),
          ),
        ),
      );
}
""";

void main() {
  test('the committed build-proof golden is exactly what the analyzer produces', () async {
    final String project = createProject(
      name: 'layout_proof',
      libraries: <String, String>{'main.dart': layoutProofSource},
      dependencies: <String, Map<String, String>>{'flutter': layoutFlutter, 'gap': gapPackage},
    );
    final Directory out = Directory.systemTemp.createTempSync('build_proof_');
    addTearDown(() => out.deleteSync(recursive: true));

    final AnalyzerResult result = await const BridgeAnalyzer().run(
      AnalyzerRequest(projectRoot: project, outputPath: p.join(out.path, 'uir.ndjson')),
    );
    expect(result.status, RunStatus.completed, reason: 'the fixture must analyze cleanly');
    expect(
      result.diagnostics.where((Diagnostic d) => d.severity == Severity.error),
      isEmpty,
    );

    final String produced = File(result.output!.outputPath).readAsStringSync();

    // The golden lives beside the other UIR fixtures, four directories up from this test file.
    final String goldenPath = p.normalize(
      p.join(
        p.dirname(Platform.script.toFilePath()),
        '..',
        '..',
        '..',
        'fixtures',
        'uir',
        'layout_proof.ndjson',
      ),
    );
    final File golden = File(goldenPath);
    // A relative path from the package root also works when the test is run from there; prefer whichever
    // exists so the test is robust to how `dart test` computes `Platform.script`.
    final File resolved = golden.existsSync()
        ? golden
        : File('../../fixtures/uir/layout_proof.ndjson').existsSync()
        ? File('../../fixtures/uir/layout_proof.ndjson')
        : File('fixtures/uir/layout_proof.ndjson');

    expect(
      resolved.existsSync(),
      isTrue,
      reason: 'fixtures/uir/layout_proof.ndjson is missing — regenerate it from this fixture',
    );

    expect(
      produced,
      resolved.readAsStringSync(),
      reason:
          'The analyzer no longer produces the committed build-proof golden. If this is an intended change, '
          'regenerate fixtures/uir/layout_proof.ndjson and re-run build.test.ts to confirm the generator '
          'still builds it. If it is not, the analyzer has drifted from what the generator expects.',
    );

    // A guard on the fixture itself: it must exercise the shapes the proof exists for, so a future edit
    // cannot quietly reduce it to something that proves less.
    final List<Map<String, Object?>> nodes = produced
        .split('\n')
        .where((String l) => l.isNotEmpty)
        .map((String l) => jsonDecode(l) as Map<String, Object?>)
        .toList();
    bool anyElementWithChildSlot = false;
    void walk(Object? value) {
      if (value is Map<String, Object?>) {
        final Object? slots = value['slots'];
        if (value['kind'] == 'ui.Element' && slots is Map<String, Object?> && slots.containsKey('child')) {
          anyElementWithChildSlot = true;
        }
        value.values.forEach(walk);
      } else if (value is List<Object?>) {
        value.forEach(walk);
      }
    }

    nodes.forEach(walk);
    expect(
      anyElementWithChildSlot,
      isTrue,
      reason: 'the fixture must keep a single-child wrapper, whose `child` is a slot — that is B1',
    );
  });
}
