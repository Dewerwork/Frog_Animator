import { open as openDialog } from "@tauri-apps/plugin-dialog";

import { ipc, inTauri } from "@/ipc/tauri";
import { useStore } from "@/state/store";
import { preloadProjectAssets } from "@/project/preload";
import { deserialize } from "./serialize";

export async function openProject(path?: string): Promise<string | null> {
  if (!inTauri()) {
    console.warn("openProject: not in Tauri");
    return null;
  }
  let target = path;
  if (!target) {
    const picked = await openDialog({
      title: "Open Frog Animator project",
      filters: [{ name: "Frog Animator project", extensions: ["json"] }],
      multiple: false,
    });
    if (!picked || Array.isArray(picked)) return null;
    target = picked;
  }
  const file = await ipc.projectOpen(target);
  const project = deserialize(file.json);
  useStore.getState().setProject(project, file.path, file.root);
  await preloadProjectAssets(file.root, project);
  return file.path;
}

export async function newProject(): Promise<string | null> {
  if (!inTauri()) {
    console.warn("newProject: not in Tauri");
    return null;
  }
  const { save: saveDialog } = await import("@tauri-apps/plugin-dialog");
  const picked = await saveDialog({
    title: "Create new Frog Animator project",
    defaultPath: "untitled.faproj/project.json",
    filters: [{ name: "Frog Animator project", extensions: ["json"] }],
  });
  if (!picked) return null;
  const { initialProject } = await import("@/state/store");
  const project = initialProject();
  const { serialize } = await import("./serialize");
  const json = serialize(project);
  const file = await ipc.projectCreate(picked, json);
  useStore.getState().setProject(project, file.path, file.root);
  return file.path;
}
