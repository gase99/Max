/**
 * Registers the offline service worker in production builds only.
 * In development the Vite dev server already runs from local disk.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  // Service workers are unavailable over file:// (the Electron shell). Attempting
  // to register there is a no-op at best; skip it explicitly.
  if (typeof location === 'undefined' || location.protocol === 'file:') return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline caching is an enhancement, never a hard requirement */
    });
  });
}
