import 'dart:ffi' as ffi;
import 'dart:io';

import 'package:flutter/services.dart';

/// Platform channel — no web/React analogue.
const MethodChannel _channel = MethodChannel('shop_bridge/native');

Future<String> deviceSerial() async {
  final String? serial = await _channel.invokeMethod<String>('getSerial');
  return serial ?? 'unknown';
}

/// dart:io — not available on the web at all.
Future<String> cacheDirectoryName() async {
  final Directory dir = Directory.systemTemp;
  if (Platform.isAndroid || Platform.isIOS) {
    return dir.path;
  }
  return dir.path;
}

/// dart:ffi — native interop, no web/React analogue.
ffi.DynamicLibrary openNativeLib() {
  return ffi.DynamicLibrary.process();
}
