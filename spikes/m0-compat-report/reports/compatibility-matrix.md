# Compatibility matrix

> ✓ = the application uses this construct. The **Status** column is what FlutterBridge
> can do with it, per the frozen MVP (Blueprint §5.2) — it is a property of the compiler,
> not of the app.

| Feature | Status | app_a | app_b |
| --- | --- | --- | --- |
| `AppBar` | Supported | ✓ | ✓ |
| `Card` | Supported | ✓ | ✓ |
| `Center` | Supported | ✓ | ✓ |
| `CircularProgressIndicator` | Supported | ✓ | ✓ |
| `Column` | Supported | ✓ | ✓ |
| `Container` | Supported | ✗ | ✓ |
| `ElevatedButton` | Supported | ✓ | ✓ |
| `Expanded` | Supported | ✗ | ✓ |
| `FutureBuilder` | Supported | ✓ | ✓ |
| `Icon` | Supported | ✓ | ✓ |
| `IconButton` | Supported | ✓ | ✗ |
| `InkWell` | Supported | ✗ | ✓ |
| `ListTile` | Supported | ✓ | ✗ |
| `ListView.builder` | Supported | ✓ | ✗ |
| `MaterialApp` | Supported | ✓ | ✓ |
| `Padding` | Supported | ✓ | ✓ |
| `Row` | Supported | ✗ | ✓ |
| `Scaffold` | Supported | ✓ | ✓ |
| `SizedBox` | Supported | ✓ | ✓ |
| `Spacer` | Supported | ✗ | ✓ |
| `Text` | Supported | ✓ | ✓ |
| `TextField` | Supported | ✓ | ✗ |
| `FloatingActionButton` | Partial | ✗ | ✓ |
| `Form` | Partial | ✗ | ✓ |
| `GridView.builder` | Partial | ✗ | ✓ |
| `ListenableBuilder` | Partial | ✗ | ✓ |
| `SingleChildScrollView` | Partial | ✗ | ✓ |
| `StreamBuilder` | Partial | ✗ | ✓ |
| `TextFormField` | Partial | ✗ | ✓ |
| `AnimationController` | Unsupported | ✗ | ✓ |
| `CustomPaint` | Unsupported | ✗ | ✓ |
| `CustomPainter subclass` | Unsupported | ✗ | ✓ |
| `FadeTransition` | Unsupported | ✗ | ✓ |
| `Hero` | Unsupported | ✗ | ✓ |
| `Isolate.spawn` | Unsupported | ✗ | ✓ |
| `TickerProvider mixin (explicit animation)` | Unsupported | ✗ | ✓ |
| `compute() (isolate)` | Unsupported | ✗ | ✓ |
| `import dart:ffi` | Unsupported | ✗ | ✓ |
| `import dart:io` | Unsupported | ✗ | ✓ |
| `import dart:isolate` | Unsupported | ✗ | ✓ |
| `platform channel (MethodChannel)` | Unsupported | ✗ | ✓ |
| `platform channel invocation` | Unsupported | ✗ | ✓ |

