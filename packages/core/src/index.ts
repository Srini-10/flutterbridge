// @bridge/core — Plugin host, VFS + hash-guard, diagnostics engine, config loader, structured logging.
//
// BRIDGE-STUB(M2): VFS + hash-guard, and the structured logger. See Blueprint §3 M2-T2..T5.
//
// The **config loader** this description has named since M0 is implemented as of M5-B, and it lives here
// rather than in the CLI for the reason Spec §1.2's dependency graph gives: core sits below both the
// compiler and the CLI, so it is the one place both can read the same file without either importing the
// other. There is no second parser in the workspace.

export {
  CONFIG_FILES,
  DEFAULT_CONFIG,
  defaultConfigDocument,
  parseConfig,
  type BridgeConfig,
  type ConfigProblem,
  type ConfigResult,
} from './internal/config.js';
