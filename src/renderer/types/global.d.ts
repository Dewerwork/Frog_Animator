import type { FrogApi } from '../../preload/index';

declare global {
  interface Window {
    frog: FrogApi;
  }
}

export {};
