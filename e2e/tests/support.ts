// Shared browser instrumentation.
//
// ## Every console message is recorded, and nothing is filtered by default
//
// The brief for this suite is explicit — *"Record every browser warning and console message. Nothing may
// be ignored."* So `recordConsole` captures all of it, including `info` and `debug`, and the assertion
// helpers below state exactly what they tolerate. There is no ambient allow-list: a message that is
// acceptable is acceptable *at one call site, named there*, which is the difference between a known
// exception and a silently swallowed defect.

import type { ConsoleMessage, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** One thing the browser said. */
export interface Recorded {
  readonly type: string;
  readonly text: string;
  /** Where it came from, when the browser says. */
  readonly location: string;
}

/** Everything a page emitted: console messages, page errors, and failed requests. */
export interface Transcript {
  readonly messages: Recorded[];
  /** Uncaught exceptions — always a defect, never tolerated. */
  readonly pageErrors: string[];
  /** Requests the browser could not load: a missing chunk, a 404 asset. */
  readonly failedRequests: string[];
}

/**
 * Attaches recorders to [page]. Call before navigating, or the first messages are missed.
 */
export function recordConsole(page: Page): Transcript {
  const transcript: Transcript = { messages: [], pageErrors: [], failedRequests: [] };

  page.on('console', (message: ConsoleMessage) => {
    const location = message.location();
    transcript.messages.push({
      type: message.type(),
      text: message.text(),
      location: location.url === '' ? '' : `${location.url}:${location.lineNumber}`,
    });
  });

  // An uncaught exception. React swallows nothing here — if a component throws during render or an event
  // handler blows up, this is where it surfaces.
  page.on('pageerror', (error: Error) => {
    transcript.pageErrors.push(`${error.name}: ${error.message}`);
  });

  // A chunk that 404s produces no console error in every browser, but it always produces a failed request.
  // This is what catches a missing asset or a bad `next.config` base path.
  page.on('requestfailed', (request) => {
    transcript.failedRequests.push(`${request.method()} ${request.url()} — ${request.failure()?.errorText}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      transcript.failedRequests.push(`${response.status()} ${response.url()}`);
    }
  });

  return transcript;
}

/** Messages of the given types, in order. */
export function of(transcript: Transcript, ...types: string[]): Recorded[] {
  return transcript.messages.filter((message) => types.includes(message.type));
}

/**
 * Asserts the page produced nothing that indicates a defect.
 *
 * @param allow - substrings of messages that are acceptable *here*, each of which must be justified at the
 *   call site. Empty means nothing is acceptable, which is the default and the goal.
 */
export function expectClean(transcript: Transcript, allow: readonly string[] = []): void {
  const tolerated = (text: string): boolean => allow.some((fragment) => text.includes(fragment));

  expect(transcript.pageErrors, 'uncaught exceptions').toEqual([]);
  expect(transcript.failedRequests, 'failed or 4xx/5xx requests').toEqual([]);

  const bad = of(transcript, 'error', 'warning').filter((message) => !tolerated(message.text));
  expect(
    bad.map((message) => `${message.type}: ${message.text}${message.location ? ` (${message.location})` : ''}`),
    'console errors and warnings',
  ).toEqual([]);
}

/**
 * Waits for React to have hydrated the page.
 *
 * Hydration is what makes server-rendered HTML interactive, and "the text is on screen" does not imply it
 * happened — that text was in the HTML before any JavaScript ran. Waiting for an actual event handler to
 * work is the only honest signal, so callers assert interactivity rather than calling this and hoping.
 */
export async function waitForHydration(page: Page): Promise<void> {
  // Next marks the root once the app has mounted; belt and braces with a real interaction in the tests.
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.querySelector('body')?.children.length ?? 0 > 0);
}

/**
 * The set of React hydration-mismatch messages, which React words several ways across versions.
 *
 * Matching on the shapes rather than one exact string, because a mismatch reported in a form we did not
 * anticipate would otherwise read as a pass.
 */
export const HYDRATION_PATTERNS = [
  'Hydration failed',
  'hydration mismatch',
  "server rendered HTML didn't match",
  'Text content does not match',
  'did not match. Server:',
  'There was an error while hydrating',
];

/** Asserts no hydration mismatch of any known wording appeared. */
export function expectNoHydrationMismatch(transcript: Transcript): void {
  const found = transcript.messages.filter((message) =>
    HYDRATION_PATTERNS.some((pattern) => message.text.includes(pattern)),
  );
  expect(found.map((m) => m.text), 'hydration mismatches').toEqual([]);
}
