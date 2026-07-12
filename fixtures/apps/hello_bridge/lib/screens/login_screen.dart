import 'package:flutter/material.dart';

import 'home_screen.dart';

/// Screen 1 (Blueprint §5.1): two `TextField`s, an `ElevatedButton`, local `StatefulWidget` state,
/// and a `Navigator.push` on success.
///
/// Extraction target: `_email`/`_password`/`_error`/`_isSubmitting` become component-scoped
/// `sig.Signal`s; each `setState` body becomes a `sig.Action` whose `writes` list names exactly the
/// signals it assigns; `_submit` is an async action containing an `Await`.
class LoginScreen extends StatefulWidget {
  const LoginScreen({
    required this.isDark,
    required this.onToggleTheme,
    super.key,
  });

  final bool isDark;
  final VoidCallback onToggleTheme;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  String _email = '';
  String _password = '';
  String _error = '';
  bool _isSubmitting = false;

  Future<void> _submit() async {
    if (_email.isEmpty || _password.isEmpty) {
      setState(() {
        _error = 'Enter an email and a password.';
      });
      return;
    }

    setState(() {
      _error = '';
      _isSubmitting = true;
    });

    // Stands in for a real sign-in call: the point is the await, not the network.
    await Future<void>.delayed(const Duration(milliseconds: 400));

    if (!mounted) {
      return;
    }

    setState(() {
      _isSubmitting = false;
    });

    await Navigator.push<void>(
      context,
      MaterialPageRoute<void>(
        builder: (BuildContext context) => HomeScreen(
          isDark: widget.isDark,
          onToggleTheme: widget.onToggleTheme,
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Sign in'),
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              const Text(
                'Hello Bridge',
                style: TextStyle(fontSize: 28, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 24),
              TextField(
                decoration: const InputDecoration(labelText: 'Email'),
                onChanged: (String value) {
                  setState(() {
                    _email = value;
                  });
                },
              ),
              const SizedBox(height: 12),
              TextField(
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password'),
                onChanged: (String value) {
                  setState(() {
                    _password = value;
                  });
                },
              ),
              const SizedBox(height: 16),
              // Collection-if: the input to normalization pass N2 (desugar-collection-ctrl),
              // which turns it into a `UICond` node.
              if (_error.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    _error,
                    style: const TextStyle(color: Color(0xFFB3261E)),
                  ),
                ),
              SizedBox(
                height: 48,
                child: ElevatedButton(
                  onPressed: _isSubmitting ? null : _submit,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Sign in'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
