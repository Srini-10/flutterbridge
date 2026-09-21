// The development build of the `dio` app: no hydration mismatch and nothing on the console through requests that succeed and requests that fail.

import { expect, test } from '@playwright/test';

import { expectNoHydrationMismatch, recordConsole } from './support.js';

test.describe('the development build', () => {
  test('requests, a failed response and a dropped connection leave the console clean apart from the browser’s own network error', async ({ page }) => {
    const transcript = recordConsole(page);
    await page.route('http://api.test/**', async (route) => {
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const path = new URL(route.request().url()).pathname.replace(/^\/v1/, '');
      if (path === '/items/down') return route.abort('connectionrefused');
      return route.fulfill({ status: path === '/items/404' ? 404 : 200, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify({ id: '1', echo: { method: route.request().method(), query: Object.fromEntries(new URL(route.request().url()).searchParams.entries()), xApp: route.request().headers()['x-app'] } }) });
    });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'get', exact: true }).click();
    await expect(page.getByText(/^> item 1 GET/)).toBeVisible();
    await page.getByRole('button', { name: 'missing' }).click();
    await expect(page.getByText('> server 404')).toBeVisible();
    await page.getByRole('button', { name: 'down' }).click();
    await expect(page.getByText('> unreachable')).toBeVisible();
    expectNoHydrationMismatch(transcript);
    // The browser itself logs a failed network request (a 404, a refused connection); nothing from the application or React may join it.
    const own = transcript.messages.filter((m) => m.type === 'error' && !/Failed to load resource|net::ERR|status of 404/.test(m.text));
    expect(own.map((m) => m.text)).toEqual([]);
    expect(transcript.pageErrors).toEqual([]);
  });
});
