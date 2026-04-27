import type { Project, TargetId } from "@/model/types";

export function allTargetIds(project: Project): TargetId[] {
  const out: TargetId[] = [];
  for (const c of project.scene.characters) {
    out.push(`${c.id}:root` as TargetId);
    for (const l of c.layers) out.push(l.id as TargetId);
  }
  if (project.scene.background) out.push(`bg:${project.scene.background.id}` as TargetId);
  return out;
}

export function frameCount(project: Project | null): number {
  return project?.scene.frames.length ?? 0;
}
