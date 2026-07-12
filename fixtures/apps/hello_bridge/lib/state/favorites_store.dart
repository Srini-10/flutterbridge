import 'package:flutter/foundation.dart';

/// The fixture's `ChangeNotifier` store.
///
/// Extraction target (Spec §2.3, the extraction contract): the class becomes an `app.Store`,
/// `_favoriteIds` becomes a `sig.Signal`, `favoriteCount` becomes a `sig.Derived`, and `toggle`
/// becomes a `sig.Action` whose `writes` list contains that signal. No generator ever sees
/// `notifyListeners`.
class FavoritesStore extends ChangeNotifier {
  final Set<int> _favoriteIds = <int>{};

  int get favoriteCount => _favoriteIds.length;

  bool isFavorite(int id) => _favoriteIds.contains(id);

  void toggle(int id) {
    if (_favoriteIds.contains(id)) {
      _favoriteIds.remove(id);
    } else {
      _favoriteIds.add(id);
    }
    notifyListeners();
  }
}
