import 'package:flutter/material.dart';

import '../data/items_repository.dart';
import '../models/item.dart';
import '../state/favorites_store.dart';

/// Screen 2 (Blueprint §5.1): a `ChangeNotifier` store, an `http.get` wrapped in a `FutureBuilder`,
/// a `ListView.builder` of `Card`/`ListTile`, and an AppBar action that toggles theme brightness.
///
/// Extraction targets:
///   * `FutureBuilder`  -> `UIAsync` (normalization pass N4), later a TanStack Query `useQuery`.
///   * `ListView.builder` -> `UIList` with a template (pass N3).
///   * `initState`/`dispose` -> `sig.Effect(timing: mount)` / `sig.Effect(timing: unmount)`.
///   * `FavoritesStore` -> `app.Store`, subscribed to here via the listener + `setState` idiom.
class HomeScreen extends StatefulWidget {
  const HomeScreen({
    required this.isDark,
    required this.onToggleTheme,
    super.key,
  });

  final bool isDark;
  final VoidCallback onToggleTheme;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  static const ItemsRepository _repository = ItemsRepository();

  final FavoritesStore _favorites = FavoritesStore();
  late Future<List<Item>> _itemsFuture;

  @override
  void initState() {
    super.initState();
    _itemsFuture = _repository.fetchItems();
    _favorites.addListener(_onFavoritesChanged);
  }

  @override
  void dispose() {
    _favorites.removeListener(_onFavoritesChanged);
    _favorites.dispose();
    super.dispose();
  }

  void _onFavoritesChanged() {
    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Items (${_favorites.favoriteCount} starred)'),
        actions: <Widget>[
          IconButton(
            icon: Icon(widget.isDark ? Icons.light_mode : Icons.dark_mode),
            onPressed: widget.onToggleTheme,
          ),
        ],
      ),
      body: FutureBuilder<List<Item>>(
        future: _itemsFuture,
        builder: (BuildContext context, AsyncSnapshot<List<Item>> snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Text('Could not load items: ${snapshot.error}'),
            );
          }

          final List<Item> items = snapshot.data ?? <Item>[];

          return ListView.builder(
            itemCount: items.length,
            itemBuilder: (BuildContext context, int index) {
              final Item item = items[index];
              final bool isFavorite = _favorites.isFavorite(item.id);

              return Card(
                margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                child: ListTile(
                  title: Text(item.title),
                  subtitle: Text(item.body),
                  trailing: IconButton(
                    icon: Icon(isFavorite ? Icons.star : Icons.star_border),
                    onPressed: () {
                      _favorites.toggle(item.id);
                    },
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
