import 'package:flutter/material.dart';

import '../services/api_client.dart';
import '../services/heavy_compute.dart';
import '../services/native_bridge.dart';
import '../state/cart_store.dart';

class CheckoutScreen extends StatefulWidget {
  const CheckoutScreen({super.key});

  @override
  State<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends State<CheckoutScreen> {
  static const ApiClient _api = ApiClient();

  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _name = TextEditingController();
  final TextEditingController _address = TextEditingController();

  bool _submitting = false;
  String _serial = '';

  @override
  void initState() {
    super.initState();
    _loadSerial();
  }

  Future<void> _loadSerial() async {
    // Platform channel call on mount.
    final String serial = await deviceSerial();
    if (!mounted) {
      return;
    }
    setState(() {
      _serial = serial;
    });
  }

  @override
  void dispose() {
    _name.dispose();
    _address.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) {
      return;
    }
    setState(() {
      _submitting = true;
    });

    // Isolate-backed work in a UI flow.
    await sumOfSquares(<int>[1, 2, 3, 4, 5]);
    await _api.submitOrder(<String, String>{
      'name': _name.text,
      'address': _address.text,
    });

    if (!mounted) {
      return;
    }
    setState(() {
      _submitting = false;
    });
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Checkout')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: <Widget>[
              Text('Device: $_serial'),
              TextFormField(
                controller: _name,
                decoration: const InputDecoration(labelText: 'Name'),
                validator: (String? value) =>
                    (value == null || value.isEmpty) ? 'Name is required' : null,
              ),
              TextFormField(
                controller: _address,
                decoration: const InputDecoration(labelText: 'Address'),
                validator: (String? value) =>
                    (value == null || value.isEmpty) ? 'Address is required' : null,
              ),
              const SizedBox(height: 16),
              ListenableBuilder(
                listenable: cartStore,
                builder: (BuildContext context, Widget? child) =>
                    Text('Total: \$${cartStore.total.toStringAsFixed(2)}'),
              ),
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _submitting ? null : _submit,
                child: _submitting
                    ? const CircularProgressIndicator()
                    : const Text('Place order'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
