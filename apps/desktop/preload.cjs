/*
 * Preload — intentionally minimal.
 *
 * The renderer runs sandboxed with context isolation and does not need any Node
 * capability: calculation, storage and export are all browser APIs. Only the
 * version handshake is exposed so the UI can show the desktop build info.
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('cabinetDesktop', {
  isDesktop: true,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
