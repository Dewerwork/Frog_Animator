// Project serialization. Validates with Zod on the way in and out so
// schema drift surfaces at the boundary, not deep in the renderer.

import type { Project } from "@/model/types";
import { ProjectSchema } from "@/model/schema";
import { migrate } from "@/model/migrate";

export function serialize(project: Project): string {
  // Round-trip through the schema to catch type drift before we hit disk.
  const validated = ProjectSchema.parse(project);
  return JSON.stringify(validated, null, 2);
}

export function deserialize(json: string): Project {
  const raw = JSON.parse(json);
  const migrated = migrate(raw);
  return ProjectSchema.parse(migrated) as Project;
}
