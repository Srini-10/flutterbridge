import 'package:flutter/material.dart';

import 'screens/login_screen.dart';

void main() {
  runApp(const BridgeApp());
}

/// Root of the walking-skeleton fixture.
///
/// Holds the one piece of app-wide state that is not owned by a store — the theme brightness,
/// toggled from the Home screen's AppBar action (Blueprint §5.1). Theme colours are written as
/// literal values on purpose: they are the input to the `theme-tokenize` normalization pass (N10),
/// which lifts them into `app.Token` nodes.
class BridgeApp extends StatefulWidget {
  const BridgeApp({super.key});

  @override
  State<BridgeApp> createState() => _BridgeAppState();
}

class _BridgeAppState extends State<BridgeApp> {
  bool _isDark = false;

  void _toggleTheme() {
    setState(() {
      _isDark = !_isDark;
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Hello Bridge',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.light,
        primaryColor: const Color(0xFF3F51B5),
        scaffoldBackgroundColor: const Color(0xFFF6F6FA),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        brightness: Brightness.dark,
        primaryColor: const Color(0xFF9FA8DA),
        scaffoldBackgroundColor: const Color(0xFF121212),
        useMaterial3: true,
      ),
      themeMode: _isDark ? ThemeMode.dark : ThemeMode.light,
      home: LoginScreen(
        isDark: _isDark,
        onToggleTheme: _toggleTheme,
      ),
    );
  }
}
