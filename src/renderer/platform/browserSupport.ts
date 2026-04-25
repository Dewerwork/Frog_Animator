/**
 * Capability detection for the features the editor relies on. Per NFR-6,
 * unsupported browsers are shown a not-supported message instead of the app.
 */

export type BrowserSupport = {
  supported: boolean;
  webgl2: boolean;
  webCodecs: boolean;
  indexedDb: boolean;
  details: string[];
};

export function checkBrowserSupport(): BrowserSupport {
  const details: string[] = [];

  const webgl2 = (() => {
    try {
      const canvas = document.createElement('canvas');
      return canvas.getContext('webgl2') != null;
    } catch {
      return false;
    }
  })();
  if (!webgl2) details.push('WebGL 2 is required for the renderer.');

  const webCodecs =
    typeof globalThis.VideoEncoder === 'function' &&
    typeof globalThis.VideoFrame === 'function';
  if (!webCodecs)
    details.push('WebCodecs API is required for MP4 export.');

  const indexedDb = typeof indexedDB !== 'undefined';
  if (!indexedDb) details.push('IndexedDB is required for project storage.');

  return {
    supported: webgl2 && webCodecs && indexedDb,
    webgl2,
    webCodecs,
    indexedDb,
    details,
  };
}
