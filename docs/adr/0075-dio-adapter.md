# ADR-75 — `package:dio` on `fetch`: the first library adapter

- **Status:** Accepted (M14). Real applications use `dio` for every request; it was refused (`BRG3006` "`_dio` is not declared", "named arguments needs the callee's signature") 270 typed references in one app.
- **Date:** 2026-09-21

## Decisions

**D1 — A package adapter is a runtime class plus a table row.** `runtimes/react/src/internal/net/dio.ts` implements `Dio`, `BaseOptions`, `Options`, `Response<T>`, `DioException`, `DioExceptionType`, `LogInterceptor` over `fetch`;
`generators/react/src/internal/emit/package_kit.ts` lists the package classes the kit mirrors, by *resolved library*. With a row a class is imported from the kit, a constructor's or method's named arguments become one trailing
options object, member reads are properties of the runtime class, the `Future<Response<T>>` a call returns gives the `get<T>` type argument, and `on DioException catch` is `instanceof`. Adding a package is a class and a row.
**D2 — Measured against real dio.** `packages/runtimes/react/tests/dio_truth/truth.dart` runs real `dio` against a real local server (17 calls: JSON, list, text, 204, query parameters — values stringified, lists repeated, `null` sent as `n=` — base and per-call headers,
JSON bodies for POST/PUT/PATCH, DELETE, 404/500 as `badResponse` carrying the response, a receive timeout, an absolute URL, an unreachable server as `connectionError`); the runtime's `Dio` is run through the same calls against an equivalent Node server and every outcome matches. JSON objects arrive as
Dart `Map`s (so generated code can index them), requests encode `Map`/`Set`/`toJson()` as `jsonEncode` does.
**D3 — A repository over Dio, end to end.** `fixtures/apps/dio_client` (base options, `get`/`post`/`delete` with query parameters, a body, per-call headers, `on DioException catch`, a `switch` on `DioExceptionType`) runs in Flutter over a canned `HttpClientAdapter` and as the generated
component over a canned `fetch` built from the same `responses.json`; both echo each request, and the texts match step by step.

## Documented differences

`fetch` does not separate connecting from waiting: `receiveTimeout` bounds the whole exchange after the request is sent, `connectTimeout` bounds it when no `receiveTimeout` is set, and `sendTimeout` is not enforced; CORS applies, and a blocked request is a `connectionError` (as an unreachable server is);
a `dynamic` number that is whole prints without `.0`. **Refused by name** (`BRG3020`, per class): interceptors other than `LogInterceptor`, `FormData`/`MultipartFile`, `CancelToken`, `HttpClientAdapter`, `ResponseType`, download/progress.

## Evidence

19 runtime tests against real dio's recorded outcomes (seven mutants killed), the `dio_client` oracle (six generator mutants killed), an analyzer test for each shape fixed alongside (three mutants killed), `state_shapes` compared with Flutter.
