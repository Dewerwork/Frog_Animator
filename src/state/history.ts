// Undo/redo via Immer patches, single grouped stack. Wired up in M5.

export interface HistoryEntry {
  label: string;
  // patches/inversePatches go here once we wire produceWithPatches.
}

export class History {
  private stack: HistoryEntry[] = [];
  private cursor = -1;

  push(_entry: HistoryEntry): void {
    // TODO(M5)
  }
  undo(): HistoryEntry | null {
    return null;
  }
  redo(): HistoryEntry | null {
    return null;
  }
  get size(): number {
    return this.stack.length;
  }
  get position(): number {
    return this.cursor;
  }
}
