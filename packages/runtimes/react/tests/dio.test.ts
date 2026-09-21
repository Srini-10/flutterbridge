import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { BaseOptions, Dio, DioException, Duration, Options } from '../src/index.js';

// ADR-0075. `dio_truth/expected.json` is real `dio` talking to a real server (`dio_truth/truth.dart`); this runs the same calls through the runtime's `Dio` against
// the same routes served by Node, and compares outcome by outcome — status, decoded body, exception type, the response an exception carries.

const expected = JSON.parse(readFileSync(new URL('./dio_truth/expected.json', import.meta.url), 'utf8')) as Record<string, Record<string, unknown>>;

let server: Server;
let base = '';

function body(request: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function send(response: ServerResponse, status: number, data: unknown, type = 'application/json'): void {
  response.statusCode = status;
  response.setHeader('content-type', type);
  response.end(type === 'application/json' ? JSON.stringify(data) : String(data));
}

beforeAll(async () => {
  server = createServer((request, response) => {
    void (async () => {
      const text = await body(request);
      const url = new URL(request.url ?? '/', 'http://x');
      if (url.pathname === '/json') return send(response, 200, { a: 1, b: [1, 2], s: 'x' });
      if (url.pathname === '/list') return send(response, 200, [1, 2, 3]);
      if (url.pathname === '/text') return send(response, 200, 'hello', 'text/plain');
      if (url.pathname === '/empty') {
        response.statusCode = 204;
        return response.end();
      }
      if (url.pathname.startsWith('/status/')) return send(response, Number(url.pathname.slice(8)), { error: 'nf' });
      if (url.pathname === '/slow') {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return send(response, 200, { slow: true });
      }
      if (url.pathname === '/echo') {
        return send(response, 200, {
          method: request.method,
          query: Object.fromEntries(url.searchParams.entries()),
          queryAll: Object.fromEntries([...new Set(url.searchParams.keys())].map((k) => [k, url.searchParams.getAll(k)])),
          xTest: request.headers['x-test'] ?? null,
          body: text === '' ? null : JSON.parse(text),
          contentType: (request.headers['content-type'] ?? '').split(';')[0] || null,
        });
      }
      send(response, 404, { error: 'no route' });
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

/** A Dart map, as the plain JSON the truth file holds. */
function plain(value: unknown): unknown {
  if (value instanceof Map) return Object.fromEntries([...value.entries()].map(([k, v]) => [k, plain(v)]));
  if (Array.isArray(value)) return value.map(plain);
  return value === undefined ? null : value;
}

async function attempt(call: () => Promise<{ statusCode: number | null; data: unknown }>): Promise<Record<string, unknown>> {
  try {
    const r = await call();
    return { ok: true, status: r.statusCode, data: plain(r.data) };
  } catch (error) {
    if (!(error instanceof DioException)) throw error;
    return { ok: false, type: error.type, status: error.response?.statusCode ?? null, data: plain(error.response?.data ?? null) };
  }
}

describe('Dio matches real dio, outcome by outcome', () => {
  const dio = (): Dio => new Dio(new BaseOptions({ baseUrl: base, headers: { 'x-test': 'base' } }));
  const calls: Record<string, () => Promise<{ statusCode: number | null; data: unknown }>> = {
    getJson: () => dio().get('/json'),
    getList: () => dio().get('/list'),
    getText: () => dio().get('/text'),
    getEmpty: () => dio().get('/empty'),
    query: () => dio().get('/echo', { queryParameters: new Map<string, unknown>([['x', 1], ['y', 'two']]) }),
    listQuery: () => dio().get('/echo', { queryParameters: new Map<string, unknown>([['ids', [1, 2]], ['n', null]]) }),
    headersBase: () => dio().get('/echo'),
    headersOverride: () => dio().get('/echo', { options: new Options({ headers: { 'x-test': 'call' } }) }),
    post: () => dio().post('/echo', { data: new Map<string, unknown>([['k', [1, 2]], ['n', null]]) }),
    put: () => dio().put('/echo', { data: new Map([['v', 1]]) }),
    patch: () => dio().patch('/echo', { data: new Map([['v', 2]]) }),
    delete: () => dio().delete('/echo'),
    notFound: () => dio().get('/status/404'),
    serverError: () => dio().get('/status/500'),
    receiveTimeout: () => dio().get('/slow', { options: new Options({ receiveTimeout: new Duration({ milliseconds: 100 }) }) }),
    absoluteUrl: () => new Dio().get(`${base}/json`),
    refused: () => new Dio(new BaseOptions({ baseUrl: 'http://127.0.0.1:1' })).get('/x'),
  };
  for (const [name, call] of Object.entries(calls)) {
    it(name, async () => {
      expect(await attempt(call)).toEqual(expected[name]);
    });
  }

  it('a JSON object arrives as a Dart Map (so generated code can index it), a JSON array as a list', async () => {
    const object = (await dio().get<Map<string, unknown>>('/json')).data;
    expect(object).toBeInstanceOf(Map);
    expect(object.get('b')).toEqual([1, 2]);
    expect((await dio().get<unknown[]>('/list')).data).toEqual([1, 2, 3]);
  });

  it('covers every outcome real dio recorded', () => {
    expect(Object.keys(calls).sort()).toEqual(Object.keys(expected).sort());
  });
});
