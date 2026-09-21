`expected.json` is the output of `truth.dart` — real `dio` against a real local HTTP server. Regenerate with
`cd tests/dio_truth && dart pub get && dart run truth.dart > expected.json`. `../dio.test.ts` runs the same calls through the runtime's `Dio` against an
equivalent Node server and compares (ADR-0075).
