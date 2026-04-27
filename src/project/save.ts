import { save as saveDialog } from "@tauri-apps/plugin-dialog";

import { ipc, inTauri } from "@/ipc/tauri";
import { useStore } from "@/state/store";
import { serialize } from "./serialize";

export async function saveProject(): Promise<string | null> {
  const s = useStore.getState();
  if (!s.project) return null;
  let path = s.projectPath;
  if (!path) return saveProjectAs();
  if (!inTauri()) {
    console.warn("saveProject: not in Tauri, skipping write to", path);
    return null;
  }
  const json = serialize(s.project);
  await ipc.projectSave(path, json);
  s.markSaved();
  return path;
}

export async function saveProjectAs(): Promise<string | null> {
  const s = useStore.getState();
  if (!s.project) return null;
  if (!inTauri()) {
    console.warn("saveProjectAs: not in Tauri");
    return null;
  }
  const picked = await saveDialog({
    title: "Save Frog Animator project",
    defaultPath: "untitled.faproj/project.json",
    filters: [{ name: "Frog Animator project", extensions: ["json"] }],
  });
  if (!picked) return null;
  const json = serialize(s.project);
  await ipc.projectSave(picked, json);
  // Strip the last path segment for the root. Handles both \ and / so a
  // Windows path like C:\foo\bar\project.json yields C:\foo\bar.
  const root = picked.replace(/[\\/][^\\/]+$/, "");
  useStore.setState({ projectPath: picked, projectRoot: root });
  s.markSaved();
  return picked;
}
