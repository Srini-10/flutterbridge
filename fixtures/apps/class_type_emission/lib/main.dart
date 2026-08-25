import 'package:flutter/material.dart';

import 'model.dart';
import 'other_model.dart';

void main() => runApp(
  const MaterialApp(home: Home(model: null, other: null, repeated: null, maybeModel: null)),
);

// Every parameter here is optional and never dereferenced: this fixture's own point is that the *type*
// reaches generated TypeScript honestly, not that a value ever flows through it — construction and
// member access remain exactly as unsupported as they were before this milestone (see
// `unmodelled_class_member` for that negative coverage).
class Home extends StatelessWidget {
  const Home({super.key, this.model, this.other, this.repeated, this.maybeModel});

  // Cross-file: both classes are declared elsewhere.
  final Model? model;
  final OtherModel? other;

  // Repeated: a second, independent use of the identical class, proving the emitted type is shared, not
  // duplicated.
  final Model? repeated;

  // Nullable: `Model?` must stay a distinct declared type from `Model`.
  final Model? maybeModel;

  @override
  Widget build(BuildContext context) => const Text('ok');
}
