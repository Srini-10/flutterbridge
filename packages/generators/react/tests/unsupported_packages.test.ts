import { describe, expect, it } from 'vitest';

import { packageNameOf, packageRefusal, unsupportedPackageOf, unsupportedPackagesIn } from '../src/internal/emit/packages.js';

// ADR-0073: a package the generator has no adapter for is named, with whether a browser equivalent exists — never the generic
// "not declared in this program". Two statuses, two promises: `not-implemented` (a roadmap) and `no-browser-equivalent` (a boundary).

describe('package recognition', () => {
  it('reads the package from a library URI', () => {
    expect(packageNameOf('package:dio/src/dio.dart')).toBe('dio');
    expect(packageNameOf('dart:core')).toBeUndefined();
    expect(packageNameOf(undefined)).toBeUndefined();
  });

  it('knows the packages of a real application, and none of the ones with adapters', () => {
    for (const library of [
      'package:flutter_riverpod/src/consumer.dart',
      'package:riverpod/src/framework.dart',
      'package:dio/src/dio.dart',
      'package:just_audio/just_audio.dart',
      'package:record/record.dart',
      'package:file_picker_platform_interface/x.dart',
      'package:supabase_flutter/supabase_flutter.dart',
    ]) {
      expect(unsupportedPackageOf(library), library).toBeDefined();
    }
    for (const library of ['package:flutter/src/widgets/text.dart', 'package:go_router/go_router.dart', 'package:collection/collection.dart', 'package:gap/gap.dart', 'package:app/main.dart']) {
      expect(unsupportedPackageOf(library), library).toBeUndefined();
    }
  });
});

describe('the two refusals are different promises', () => {
  it('a package with a browser equivalent says the mapping is not built yet', () => {
    const text = packageRefusal(unsupportedPackageOf('package:dio/src/dio.dart')!);
    expect(text).toContain('A browser equivalent exists');
    expect(text).toContain('fetch');
    expect(text).toContain('not built yet');
    expect(text).not.toContain('no browser equivalent');
  });

  it('a package with none says so, and why', () => {
    const text = packageRefusal(unsupportedPackageOf('package:path_provider/path_provider.dart')!);
    expect(text).toContain('no browser equivalent');
    expect(text).not.toContain('not built yet');
  });
});

describe('the per-package summary', () => {
  it('counts typed references by package, across nested nodes, sorted', () => {
    const nodes = [
      { kind: 'a', type: { library: 'package:dio/src/dio.dart', name: 'Dio' }, inner: [{ type: { library: 'package:dio/src/response.dart' } }] },
      { kind: 'b', type: { library: 'package:flutter_riverpod/src/x.dart' } },
      { kind: 'c', type: { library: 'package:go_router/go_router.dart' } },
    ];
    const found = unsupportedPackagesIn(nodes).map((entry) => [entry.model.label, entry.references]);
    expect(found).toEqual([['dio', 2], ['Riverpod', 1]]);
  });

  it('reports nothing for a program that uses only supported packages', () => {
    expect(unsupportedPackagesIn([{ type: { library: 'package:flutter/src/widgets/text.dart' } }])).toEqual([]);
  });
});
