// tinykeys 3.x ships types at dist/tinykeys.d.ts but its package.json `exports`
// map omits a "types" condition, so TS bundler resolution can't find them.
// Re-export the ones we use.
declare module "tinykeys" {
  export interface KeyBindingMap {
    [keybinding: string]: (event: KeyboardEvent) => void;
  }
  export interface KeyBindingOptions {
    event?: "keydown" | "keyup";
    capture?: boolean;
    timeout?: number;
  }
  export function tinykeys(
    target: Window | HTMLElement,
    keyBindingMap: KeyBindingMap,
    options?: KeyBindingOptions,
  ): () => void;
}
