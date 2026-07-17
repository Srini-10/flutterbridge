import { describe, expect, it, vi } from 'vitest';

import { createRouter, effect, RuntimeError, type RouterDescriptor } from '../src/index.js';

// The navigation runtime (M3-A), against Spec v2.4 §A17.
//
// §A17 is why this module exists in the shape it does. `app.RouteTransition` had existed since v2.0 and the
// analyzer had never emitted one — because the frozen schema could not describe what real Flutter code does.
// `Navigator.push(context, MaterialPageRoute(builder: (_) => HomeScreen()))` has no URL: its destination is
// a widget built inline. §A17 amended the model rather than distorting the truth, and a transition now
// carries a route *or* a component, exactly one.
//
// These tests hold that line from the runtime side, and — just as importantly — hold the line §A17.6 draws
// around what the runtime must NOT do: invent a URL for an inline push.

/** The route table the generator will project from `app.Route` nodes. */
const routes: RouterDescriptor = {
  routes: [
    { name: 'home', path: '/' },
    { name: 'product', path: '/product/:id' },
    { name: 'wonder', path: '/wonder/:id/detail/:tab' },
  ],
  initial: 'home',
};

describe('a router starts on its initial route', () => {
  it('opens with the initial entry on the stack', () => {
    const router = createRouter(routes);
    expect(router.current.get().path).toBe('/');
    expect(router.stack.get()).toHaveLength(1);
    expect(router.canPop.get()).toBe(false);
  });

  it('resolves parameters on the initial route', () => {
    const router = createRouter({ ...routes, initial: 'product', initialParams: { id: '42' } });
    expect(router.current.get().path).toBe('/product/42');
  });

  it('refuses an initial route that is not in the table, with BRG4004', () => {
    try {
      createRouter({ ...routes, initial: 'nonexistent' });
      expect.unreachable('an unknown initial route should throw');
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeError);
      expect((error as RuntimeError).code).toBe('BRG4004');
    }
  });
});

describe('a destination is a route or a component, and they are not the same thing', () => {
  it('resolves a route destination to a URL', () => {
    const router = createRouter(routes);

    // `context.go('/wonder/3')` — the shape §A17 measured six times in `wonderous`, and the shape that names
    // a route that exists.
    router.push({ kind: 'route', route: 'product', params: { id: '42' } });

    expect(router.current.get().path).toBe('/product/42');
    expect(router.current.get().destination.kind).toBe('route');
  });

  it('gives a component destination no path, and does not invent one', () => {
    const router = createRouter(routes);

    // `Navigator.push(context, MaterialPageRoute(builder: (_) => HomeScreen()))` — `hello_bridge`'s only
    // navigation. There is no URL to give it.
    router.push({ kind: 'component', component: 'HomeScreen' });

    const entry = router.current.get();
    // `undefined`, not `'/'`, not `/_push/HomeScreen`. §A17.2 refused a synthesized path because it invents
    // a URL the developer never wrote; §A17.6 leaves the decision to the layer that knows the target. The
    // runtime reports that it has no path rather than guessing one.
    expect(entry.path).toBeUndefined();
    expect(entry.destination).toEqual({ kind: 'component', component: 'HomeScreen' });
  });

  it('carries arguments on a component destination', () => {
    const router = createRouter(routes);
    router.push({ kind: 'component', component: 'ProductScreen', params: { sku: 'a' } });
    expect(router.current.get().params).toEqual({ sku: 'a' });
  });

  it('refuses a route destination that is not in the table', () => {
    const router = createRouter(routes);
    expect(() => router.push({ kind: 'route', route: 'nonexistent' })).toThrow(RuntimeError);
  });

  it('refuses a route destination missing a parameter its path needs', () => {
    const router = createRouter(routes);
    try {
      router.push({ kind: 'route', route: 'product' });
      expect.unreachable('a route with an unfilled :id should throw');
    } catch (error) {
      // Better than navigating to the literal `/product/:id`, which is a URL that renders a 404 in
      // production and looks like a routing bug rather than a missing argument.
      expect((error as RuntimeError).code).toBe('BRG4004');
      expect((error as RuntimeError).message).toContain('id');
    }
  });

  it('fills every parameter in a multi-parameter path, and encodes them', () => {
    const router = createRouter(routes);
    router.push({ kind: 'route', route: 'wonder', params: { id: '3', tab: 'photos' } });
    expect(router.current.get().path).toBe('/wonder/3/detail/photos');

    router.push({ kind: 'route', route: 'product', params: { id: 'a/b c' } });
    expect(router.current.get().path).toBe('/product/a%2Fb%20c');
  });

  it('does not move the router when a destination is invalid', () => {
    const router = createRouter(routes);
    expect(() => router.push({ kind: 'route', route: 'product' })).toThrow();

    // The entry is built before the write. A half-navigated router — a stack entry with an unresolved path —
    // is worse than one that refused to navigate.
    expect(router.current.get().path).toBe('/');
    expect(router.stack.get()).toHaveLength(1);
  });
});

describe('the stack', () => {
  it('pushes and pops', () => {
    const router = createRouter(routes);
    router.push({ kind: 'route', route: 'product', params: { id: '1' } });
    router.push({ kind: 'route', route: 'product', params: { id: '2' } });
    expect(router.stack.get()).toHaveLength(3);
    expect(router.canPop.get()).toBe(true);

    expect(router.pop()).toBe(true);
    expect(router.current.get().path).toBe('/product/1');
    expect(router.pop()).toBe(true);
    expect(router.current.get().path).toBe('/');
  });

  it('refuses to pop the root', () => {
    const router = createRouter(routes);

    // A router with an empty stack has no state to be in. `Navigator.pop()` on the root route is a no-op in
    // Flutter too — it does not produce a blank screen.
    expect(router.pop()).toBe(false);
    expect(router.current.get().path).toBe('/');
  });

  it('replaces the current entry without growing the stack', () => {
    const router = createRouter(routes);
    router.push({ kind: 'route', route: 'product', params: { id: '1' } });
    router.replace({ kind: 'route', route: 'product', params: { id: '2' } });

    expect(router.stack.get()).toHaveLength(2);
    expect(router.current.get().path).toBe('/product/2');
    router.pop();
    expect(router.current.get().path).toBe('/');
  });

  it('keeps the stack immutable', () => {
    const router = createRouter(routes);
    const before = router.stack.get();
    router.push({ kind: 'route', route: 'product', params: { id: '1' } });

    // The old array is untouched, and a new one is published. Anything that captured the previous stack — a
    // rendered frame, a transition — still sees what it rendered.
    expect(before).toHaveLength(1);
    expect(Object.isFrozen(before)).toBe(true);
    expect(router.stack.get()).not.toBe(before);
  });

  it('mixes route and component destinations on one stack', () => {
    const router = createRouter(routes);
    router.push({ kind: 'route', route: 'product', params: { id: '1' } });
    router.push({ kind: 'component', component: 'DetailSheet' });

    expect(router.stack.get().map((entry) => entry.path)).toEqual(['/', '/product/1', undefined]);
    router.pop();
    expect(router.current.get().path).toBe('/product/1');
  });
});

describe('routing state is reactive, like any other state', () => {
  it('re-runs an effect that read the current route', () => {
    const router = createRouter(routes);
    const seen: Array<string | undefined> = [];
    effect(() => {
      seen.push(router.current.get().path);
    });

    router.push({ kind: 'route', route: 'product', params: { id: '1' } });
    router.pop();

    expect(seen).toEqual(['/', '/product/1', '/']);
  });

  it('does not re-run a canPop reader for a navigation that does not change it', () => {
    const router = createRouter(routes);
    const runs = vi.fn();
    effect(() => {
      router.canPop.get();
      runs();
    });
    runs.mockClear();

    router.push({ kind: 'route', route: 'product', params: { id: '1' } });
    expect(runs).toHaveBeenCalledTimes(1); // false → true

    router.push({ kind: 'route', route: 'product', params: { id: '2' } });

    // The stack changed; `canPop` did not. ADR-20 R3: a back button must not re-render because an unrelated
    // route was pushed.
    expect(runs).toHaveBeenCalledTimes(1);
  });

  it('emits one update per navigation', () => {
    const router = createRouter(routes);
    const runs = vi.fn();
    effect(() => {
      router.current.get();
      runs();
    });
    runs.mockClear();

    router.push({ kind: 'route', route: 'product', params: { id: '1' } });

    expect(runs).toHaveBeenCalledTimes(1);
  });

  it('gives two routers independent stacks', () => {
    const first = createRouter(routes);
    const second = createRouter(routes);
    first.push({ kind: 'route', route: 'product', params: { id: '1' } });

    expect(first.current.get().path).toBe('/product/1');
    expect(second.current.get().path).toBe('/');
  });
});
