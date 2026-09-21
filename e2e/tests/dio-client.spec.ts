// The M14 browser proof for the `dio` adapter (`fixtures/apps/dio_client`, ADR-0075): a repository over Dio running on the browser's real `fetch`,
// production build, against network routes this test fulfils (`page.route`) — so the request the browser actually sends (URL, query, method, headers,
// body) is asserted, and the responses it gets back (200, 201, 404, 500, a dropped connection) are real network outcomes, not stubs in the page.

import { expect, test, type Page, type Route } from '@playwright/test';

import { expectClean, expectNoHydrationMismatch, recordConsole } from './support.js';

interface Seen {
  method: string;
  path: string;
  query: Record<string, string>;
  xApp: string | undefined;
  xReason: string | undefined;
  contentType: string | undefined;
  body: unknown;
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

async function serve(page: Page): Promise<Seen[]> {
  const seen: Seen[] = [];
  await page.route('http://api.test/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: CORS });
      return;
    }
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/v1/, '');
    const headers = request.headers();
    seen.push({
      method: request.method(),
      path,
      query: Object.fromEntries(url.searchParams.entries()),
      xApp: headers['x-app'],
      xReason: headers['x-reason'],
      contentType: headers['content-type']?.split(';')[0],
      body: request.postData() === null ? null : JSON.parse(request.postData() as string),
    });
    if (path === '/items/down') {
      await route.abort('connectionrefused');
      return;
    }
    const status = path === '/items/404' ? 404 : path === '/items/500' ? 500 : request.method() === 'POST' ? 201 : 200;
    const last = seen[seen.length - 1];
    await route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/json' },
      body: JSON.stringify({ id: '1', error: status >= 400 ? 'x' : undefined, echo: { method: last?.method, path: last?.path, query: last?.query, xApp: last?.xApp } }),
    });
  });
  return seen;
}

test.describe('a repository over Dio, in a real browser (ADR-0075)', () => {
  test('server-renders, hydrates and says nothing', async ({ page }) => {
    const transcript = recordConsole(page);
    await serve(page);
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    await expect(page.getByText('> idle')).toBeVisible();
    expectNoHydrationMismatch(transcript);
    expectClean(transcript);
  });

  test('get sends the base URL, the query parameters (stringified) and the base header; the JSON reply is indexable', async ({ page }) => {
    const seen = await serve(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'get', exact: true }).click();
    await expect(page.getByText('> item 1 GET true 2 bridge')).toBeVisible();
    expect(seen.at(-1)).toMatchObject({ method: 'GET', path: '/items/1', query: { verbose: 'true', page: '2' }, xApp: 'bridge' });
  });

  test('create posts a JSON body (a Map with a list) as application/json; a 201 is a success', async ({ page }) => {
    const seen = await serve(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'create' }).click();
    await expect(page.getByText('> created 201')).toBeVisible();
    expect(seen.at(-1)).toMatchObject({ method: 'POST', path: '/items', contentType: 'application/json', body: { name: 'widget', tags: ['a', 'b'] } });
  });

  test('delete carries the per-call header on top of the base one', async ({ page }) => {
    const seen = await serve(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'remove' }).click();
    await expect(page.getByText('> removed')).toBeVisible();
    expect(seen.at(-1)).toMatchObject({ method: 'DELETE', path: '/items/9', xApp: 'bridge', xReason: 'cleanup' });
  });

  test('a 404 and a 500 are DioException(badResponse) with the status; a dropped connection is a connectionError', async ({ page }) => {
    await serve(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'missing' }).click();
    await expect(page.getByText('> server 404')).toBeVisible();
    await page.getByRole('button', { name: 'boom' }).click();
    await expect(page.getByText('> server 500')).toBeVisible();
    await page.getByRole('button', { name: 'down' }).click();
    await expect(page.getByText('> unreachable')).toBeVisible();
  });
});
