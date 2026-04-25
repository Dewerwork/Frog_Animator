import type { BrowserSupport } from '@renderer/platform/browserSupport';

type Props = { support: BrowserSupport };

export function UnsupportedScreen({ support }: Props) {
  return (
    <div className="unsupported">
      <h1>Frog Animator can't run here</h1>
      <p>
        This build requires WebGL 2, WebCodecs, and IndexedDB. The packaged
        desktop app ships its own Chromium and should always satisfy these —
        if you're seeing this in development, your dev runtime is missing one
        of them.
      </p>
      <ul>
        {support.details.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </div>
  );
}
