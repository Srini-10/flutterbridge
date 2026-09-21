import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

void main() => runApp(const RootApp());

final GoRouter router = GoRouter(
  routes: <RouteBase>[
    GoRoute(path: '/', name: 'home', builder: (BuildContext context, GoRouterState state) => const HomePage()),
    GoRoute(path: '/about', name: 'about', builder: (BuildContext context, GoRouterState state) => const AboutPage()),
    GoRoute(
      path: '/settings',
      name: 'settings',
      builder: (BuildContext context, GoRouterState state) => const SettingsPage(),
      routes: <RouteBase>[
        GoRoute(path: 'profile', name: 'profile', builder: (BuildContext context, GoRouterState state) => const ProfilePage()),
      ],
    ),
  ],
);

class RootApp extends StatelessWidget {
  const RootApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    theme: ThemeData(colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF6750A4))),
    routerConfig: router,
  );
}

class HomePage extends StatelessWidget {
  const HomePage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          const Text('page: home'),
          ElevatedButton(onPressed: () => context.goNamed('about'), child: const Text('go about by name')),
          ElevatedButton(onPressed: () => context.go('/about'), child: const Text('go about by path')),
          ElevatedButton(onPressed: () => context.pushNamed('settings'), child: const Text('push settings by name')),
          ElevatedButton(onPressed: () => context.goNamed('profile'), child: const Text('go nested profile by name')),
        ],
      ),
    );
  }
}

class AboutPage extends StatelessWidget {
  const AboutPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          const Text('page: about'),
          ElevatedButton(onPressed: () => context.goNamed('home'), child: const Text('back home by name')),
        ],
      ),
    );
  }
}

class SettingsPage extends StatelessWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Column(
        children: [
          const Text('page: settings'),
          ElevatedButton(onPressed: () => context.pushReplacementNamed('about'), child: const Text('replace with about')),
          ElevatedButton(onPressed: () => context.pop(), child: const Text('pop')),
        ],
      ),
    );
  }
}

class ProfilePage extends StatelessWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Text('page: profile'));
  }
}
