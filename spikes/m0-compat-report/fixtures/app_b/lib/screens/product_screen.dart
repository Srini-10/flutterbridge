import 'package:flutter/material.dart';

import '../models/product.dart';
import '../state/cart_store.dart';
import '../widgets/rating_painter.dart';

class ProductScreen extends StatefulWidget {
  const ProductScreen({required this.product, super.key});

  final Product product;

  @override
  State<ProductScreen> createState() => _ProductScreenState();
}

/// Explicit animation: AnimationController + a ticker mixin. Outside the MVP.
class _ProductScreenState extends State<ProductScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _fade;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _fade = CurvedAnimation(parent: _controller, curve: Curves.easeIn);
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(widget.product.title)),
      body: FadeTransition(
        opacity: _fade,
        child: Column(
          children: <Widget>[
            Hero(
              tag: 'product-${widget.product.id}',
              child: Container(height: 220, color: const Color(0xFFEEEEEE)),
            ),
            // CustomPaint — imperative canvas drawing.
            SizedBox(
              height: 32,
              width: 160,
              child: CustomPaint(
                painter: RatingPainter(rating: widget.product.rating),
              ),
            ),
            const Spacer(),
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: <Widget>[
                  Text('\$${widget.product.price.toStringAsFixed(2)}'),
                  ElevatedButton(
                    onPressed: () {
                      cartStore.add(widget.product);
                      Navigator.pop(context);
                    },
                    child: const Text('Add to cart'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
