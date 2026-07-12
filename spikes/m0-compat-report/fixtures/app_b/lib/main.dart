import 'package:flutter/material.dart';

import 'models/product.dart';
import 'screens/catalog_screen.dart';
import 'screens/checkout_screen.dart';
import 'screens/product_screen.dart';

void main() {
  runApp(const ShopApp());
}

class ShopApp extends StatelessWidget {
  const ShopApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Shop Bridge',
      theme: ThemeData(
        brightness: Brightness.light,
        primaryColor: const Color(0xFF00695C),
        useMaterial3: true,
      ),
      initialRoute: '/',
      // Named routes + onGenerateRoute — a different navigation shape to hello_bridge.
      routes: <String, WidgetBuilder>{
        '/': (BuildContext context) => const CatalogScreen(),
        '/checkout': (BuildContext context) => const CheckoutScreen(),
      },
      onGenerateRoute: (RouteSettings settings) {
        if (settings.name == '/product') {
          final Product product = settings.arguments! as Product;
          return MaterialPageRoute<void>(
            builder: (BuildContext context) => ProductScreen(product: product),
          );
        }
        return null;
      },
    );
  }
}
