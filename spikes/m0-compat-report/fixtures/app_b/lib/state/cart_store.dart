import 'package:flutter/foundation.dart';

import '../models/product.dart';

/// ChangeNotifier store — inside the MVP's state model.
class CartStore extends ChangeNotifier {
  final List<Product> _items = <Product>[];

  List<Product> get items => List<Product>.unmodifiable(_items);

  int get count => _items.length;

  double get total =>
      _items.fold<double>(0, (double sum, Product p) => sum + p.price);

  void add(Product product) {
    _items.add(product);
    notifyListeners();
  }

  void remove(int id) {
    _items.removeWhere((Product p) => p.id == id);
    notifyListeners();
  }
}

/// App-wide singleton store. Common in real apps; relevant to how the compiler scopes signals.
final CartStore cartStore = CartStore();
