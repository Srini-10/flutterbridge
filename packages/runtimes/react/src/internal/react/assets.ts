// The asset manifest, in scope — provision and consumption, the same shape the theme uses.
//
// A manifest is immutable data the generator emits, so unlike a store it holds no per-request state and
// ADR-15's privacy argument does not apply to it. It is still a provider rather than a module constant, for a
// different reason: the kit is a *library*, and a module-scope manifest would mean one manifest per process,
// so a host rendering two generated applications in one server — which is exactly what a preview or a
// screenshot service does — would serve one app's assets to the other.

import { createContext, createElement, useContext, type ReactElement, type ReactNode } from 'react';

import { EMPTY_ASSET_MANIFEST, type AssetManifest } from '../assets/image_provider.js';

/**
 * The manifest in scope.
 *
 * Defaults to the empty manifest rather than `null`, which is the one place this differs from the theme and
 * the router. Those throw `BRG4005` outside their provider because there is no meaningful empty theme; an app
 * that declares no assets genuinely *has* no assets, and a `NetworkImage` needs no manifest at all. So the
 * absence is a real state rather than a misconfiguration, and a missing key still refuses loudly (`BRG4010`)
 * at the point an asset is actually asked for.
 */
const AssetContext = createContext<AssetManifest>(EMPTY_ASSET_MANIFEST);

/** Props for {@link AssetProvider}. */
export interface AssetProviderProps {
  /** The manifest, as the generator emitted it. */
  readonly manifest: AssetManifest;
  /** The subtree whose assets resolve against it. */
  readonly children?: ReactNode;
}

/**
 * Puts an asset manifest in scope for a subtree.
 *
 * @param props - see {@link AssetProviderProps}.
 * @returns the subtree, with the manifest in scope.
 */
export function AssetProvider(props: AssetProviderProps): ReactElement {
  // No `useState` wrapper: the manifest is immutable data, not an instance with a lifetime, so there is
  // nothing to create once per mount and nothing to dispose. Passing it straight through also means the
  // context value is referentially stable whenever the caller's is, which for a module-scope generated
  // constant is always.
  return createElement(AssetContext.Provider, { value: props.manifest }, props.children);
}

/**
 * The asset manifest in scope.
 *
 * @returns the manifest, or the empty one outside any provider.
 */
export function useAssetManifest(): AssetManifest {
  return useContext(AssetContext);
}
