/**
 * Registers the offline service worker in production builds only.
 * In development the Vite dev server already runs from local disk.
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* offline caching is an enhancement, never a hard requirement */
    });
  });
}
