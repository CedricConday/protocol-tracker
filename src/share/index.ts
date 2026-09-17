/**
 * The share module's public surface.
 *
 * `shareFromConfig` lives in `send.ts`, not here: ShareSheet imports it, and
 * this file exports ShareSheet, so putting it here made a cycle that left the
 * app hanging on the splash screen with nothing in the console — the module
 * graph resolved one of the two to undefined before either had finished
 * initialising.
 */
export { shareFromConfig } from './send';
export { collectShareData, resolveRange } from './data';
export { countSections, bundleToJson } from './shape';
export type { ShareBundle } from './shape';
export { buildShareHtml } from './report';
export * from './types';
export { default as ShareSheet } from './ShareSheet';
