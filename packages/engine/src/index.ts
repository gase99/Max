/**
 * Cabinet Analysis Pro — calculation engine.
 *
 * Framework-free, dependency-free TypeScript. The engine knows nothing about
 * React, the DOM, Electron or any cloud service, so it can be unit-tested and
 * reused by the web app, the desktop shell and any future CLI.
 */

export * from './types.js';
export * from './units.js';
export * from './rounding.js';
export * from './validation.js';

export * from './legacy/constants.js';
export * from './legacy/doorRule.js';
export * from './legacy/groundCabinet.js';
export * from './legacy/wallCabinet.js';
export * from './legacy/drawer.js';

export * from './cuttingList.js';
export * from './optimize/nesting.js';
export * from './pricing.js';
export * from './exploded.js';
export * from './dxf.js';
