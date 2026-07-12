import 'package:flutter/material.dart';

/// CustomPainter — imperative canvas drawing. This is the automation boundary.
class RatingPainter extends CustomPainter {
  const RatingPainter({required this.rating});

  final double rating;

  @override
  void paint(Canvas canvas, Size size) {
    final Paint paint = Paint()
      ..color = const Color(0xFFFFC107)
      ..style = PaintingStyle.fill;

    final double step = size.width / 5;
    for (int i = 0; i < rating.round(); i++) {
      canvas.drawCircle(
        Offset(step * i + step / 2, size.height / 2),
        size.height / 3,
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(RatingPainter oldDelegate) => oldDelegate.rating != rating;
}
