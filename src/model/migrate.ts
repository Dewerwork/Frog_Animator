// Schema migrations. Always migrate forward; never read raw JSON without
// going through this gate.

import type { Project } from "./types";

export function migrate(raw: unknown): Project {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("project.json: not an object");
  }
  const v = (raw as { schemaVersion?: number }).schemaVersion ?? 0;
  if (v === 1) return raw as Project;
  // Future: chain v0 → v1 → v2 transformers here.
  throw new Error(`project.json: unsupported schemaVersion ${v}`);
}
