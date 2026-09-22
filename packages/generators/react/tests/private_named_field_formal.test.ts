import { describe, expect, it } from 'vitest';

import { callArguments } from '../src/internal/emit/dart_classes.js';

// A real, general (non-Riverpod) compiler bug, found and fixed while burning down the real-application
// taxonomy after the M14 StateNotifier work: `class X { X({required this._repository}); final Repository
// _repository; }` — a *private* named field-formal parameter, Dart's "private named parameters" language
// feature, and the shape every one of App A's `StateNotifier` controllers with an injected dependency uses
// (`MapListController({required this._repository})`, `GameRoundController({required this._audioRecorder,
// ...})`).
//
// Dart calls such a parameter by its name **with the leading underscore stripped**
// (`MapListController(repository: value)`) — the field keeps it, the call-site label does not. The analyzer
// records the parameter's own declared name (`_repository`, with the underscore: that is what the source
// says), so `callArguments` — which matches a construction's `namedArgs` (keyed by the label the *caller*
// wrote, `repository`) against each parameter's own `name` — looked up a key that was never in `namedArgs`
// and refused the call as "passes an argument the declaration has no parameter for", for every one of these
// controllers. Real UIR, taken from `MapListController`'s own constructor (`fixtures/uir` does not carry a
// fixture for the "private named parameters" language feature — this repository's own Flutter SDK does not
// yet enable it by default — so this is a direct, hand-built regression test of the pure function the fix
// lives in, matching real analyzer output field for field).

describe('a private named field-formal parameter is matched by its call-site label, not its declared name', () => {
  const repositoryParam = {
    name: '_repository',
    named: true,
    required: true,
    initializesField: '_repository',
    type: { library: 'package:app/repo.dart', name: 'MapRepository', target: 'r1' },
  };

  it('`callArguments` resolves `repository: value` against a param declared `_repository`', () => {
    const result = callArguments([repositoryParam], [], { repository: 'theRepo' });
    expect(result).toEqual(['theRepo']);
  });

  it('a genuinely unknown named argument is still refused (the fix narrows the match, it does not widen it)', () => {
    const result = callArguments([repositoryParam], [], { somethingElse: 'x' });
    expect(result).toEqual({ unknown: 'somethingElse' });
  });

  it('an ordinary (non-underscored) named parameter is unaffected', () => {
    const param = { name: 'retries', named: true, required: false };
    expect(callArguments([param], [], { retries: '3' })).toEqual(['3']);
  });

  it('multiple private named field-formals, in declaration order (GameRoundController’s own shape)', () => {
    const params = [
      { name: '_repository', named: true, required: true, initializesField: '_repository' },
      { name: '_audioRecorder', named: true, required: true, initializesField: '_audioRecorder' },
      { name: '_bgmPlayer', named: true, required: true, initializesField: '_bgmPlayer' },
    ];
    const result = callArguments(params, [], { repository: 'repo', audioRecorder: 'rec', bgmPlayer: 'bgm' });
    expect(result).toEqual(['repo', 'rec', 'bgm']);
  });
});
