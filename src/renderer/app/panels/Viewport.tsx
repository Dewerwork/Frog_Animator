import { useEffect, useRef } from 'react';
import { Application } from 'pixi.js';

/**
 * Hosts the PixiJS WebGL2 application that renders the active composition.
 * The Pixi stage is created once on mount and disposed on unmount; future
 * work will subscribe to the editor store and rebuild the display tree
 * whenever layers or the playhead change.
 */
export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const app = new Application();
    let disposed = false;

    void app
      .init({
        background: '#101010',
        resizeTo: host,
        antialias: true,
        preference: 'webgl',
        powerPreference: 'high-performance',
      })
      .then(() => {
        if (disposed) {
          app.destroy(true);
          return;
        }
        host.appendChild(app.canvas);
      });

    return () => {
      disposed = true;
      try {
        if (app.canvas?.parentNode === host) host.removeChild(app.canvas);
        app.destroy(true);
      } catch {
        // app may not have finished init; nothing to clean up.
      }
    };
  }, []);

  return <div className="viewport" ref={hostRef} />;
}
