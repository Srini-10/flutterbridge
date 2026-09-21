// @vitest-environment jsdom

import { defineOracleSuite } from './oracle.js';

// M14 (ADR-0075): `package:dio` — a repository over Dio (base options, get/post/delete with query parameters, a body and per-call headers, typed
// `DioException` handling, a `switch` on `DioExceptionType`). Flutter runs it over a canned HttpClientAdapter, the generated component over a canned `fetch`
// built from the same `responses.json`; both echo each request, so a wrong URL, query, header or body shows in the text.
defineOracleSuite({ fixture: 'dio_client', providers: true, waitMs: 60 });
