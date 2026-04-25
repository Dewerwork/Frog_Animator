import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': r('./src/shared'),
        '@main': r('./src/main'),
      },
    },
    build: {
      outDir: 'out/main',
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': r('./src/shared'),
      },
    },
    build: {
      outDir: 'out/preload',
      // Sandboxed preloads must be CommonJS (Electron requirement).
      rollupOptions: {
        input: r('./src/preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
        },
      },
    },
  },
  renderer: {
    plugins: [react()],
    root: 'src/renderer',
    resolve: {
      alias: {
        '@renderer': r('./src/renderer'),
        '@shared': r('./src/shared'),
      },
    },
    build: {
      outDir: r('./out/renderer'),
      target: 'es2022',
      sourcemap: true,
      rollupOptions: {
        input: r('./src/renderer/index.html'),
      },
    },
    server: {
      port: 5173,
    },
  },
});
