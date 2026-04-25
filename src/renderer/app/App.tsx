import { useMemo } from 'react';
import { checkBrowserSupport } from '@renderer/platform/browserSupport';
import { EditorShell } from './EditorShell';
import { UnsupportedScreen } from './UnsupportedScreen';

export function App() {
  // Capability check happens once at mount; an unsupported runtime can't
  // become supported without a reload.
  const support = useMemo(() => checkBrowserSupport(), []);
  if (!support.supported) return <UnsupportedScreen support={support} />;
  return <EditorShell />;
}
