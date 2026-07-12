import 'package:flutter/material.dart';

import '../models/product.dart';
import '../services/api_client.dart';
import '../state/cart_store.dart';

class CatalogScreen extends StatefulWidget {
  const CatalogScreen({super.key});

  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  static const ApiClient _api = ApiClient();

  late Future<List<Product>> _products;

  @override
  void initState() {
    super.initState();
    _products = _api.fetchProducts();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Catalog'),
        actions: <Widget>[
          // ListenableBuilder — a store subscription without setState.
          ListenableBuilder(
            listenable: cartStore,
            builder: (BuildContext context, Widget? child) {
              return Padding(
                padding: const EdgeInsets.only(right: 16),
                child: Center(child: Text('Cart: ${cartStore.count}')),
              );
            },
          ),
        ],
      ),
      body: FutureBuilder<List<Product>>(
        future: _products,
        builder: (BuildContext context, AsyncSnapshot<List<Product>> snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snapshot.hasError) {
            return Center(child: Text('Error: ${snapshot.error}'));
          }
          final List<Product> products = snapshot.data ?? <Product>[];

          return GridView.builder(
            padding: const EdgeInsets.all(12),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
            ),
            itemCount: products.length,
            itemBuilder: (BuildContext context, int index) {
              final Product product = products[index];
              return InkWell(
                onTap: () {
                  Navigator.pushNamed(context, '/product', arguments: product);
                },
                child: Card(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: <Widget>[
                      Expanded(
                        // Hero — a shared-element transition across routes.
                        child: Hero(
                          tag: 'product-${product.id}',
                          child: Container(color: const Color(0xFFEEEEEE)),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text(product.title),
                      ),
                      // StreamBuilder — live price ticker.
                      StreamBuilder<double>(
                        stream: _api.priceTicker(product.id),
                        builder: (BuildContext context, AsyncSnapshot<double> snap) {
                          return Padding(
                            padding: const EdgeInsets.only(left: 8, bottom: 8),
                            child: Text('\$${(snap.data ?? product.price).toStringAsFixed(2)}'),
                          );
                        },
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          Navigator.pushNamed(context, '/checkout');
        },
        child: const Icon(Icons.shopping_cart),
      ),
    );
  }
}
