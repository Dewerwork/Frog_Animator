import { useState } from "react";

import { useStore } from "@/state/store";
import { newProject, openProject } from "@/project/open";
import { saveProject, saveProjectAs } from "@/project/save";
import { importAssetForActiveLayer } from "@/project/importAsset";
import { ExportDialog } from "@/panels/ExportDialog";

export function FileMenu() {
  const projectPath = useStore((s) => s.projectPath);
  const dirty = useStore((s) => s.dirtyTick > s.lastSavedTick);
  const [exportOpen, setExportOpen] = useState(false);

  const labelSave = projectPath ? "Save" : "Save…";
  const titleBar = projectPath ? projectPath.split(/[\\/]/).pop() : "(unsaved)";

  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        onClick={() => void newProject()}
        className="rounded border border-edge px-2 py-1"
        title="New project (Ctrl+N)"
      >
        New
      </button>
      <button
        onClick={() => void openProject()}
        className="rounded border border-edge px-2 py-1"
        title="Open project (Ctrl+O)"
      >
        Open
      </button>
      <button
        onClick={() => void saveProject()}
        className="rounded border border-edge px-2 py-1"
        title="Save (Ctrl+S)"
      >
        {labelSave}
      </button>
      <button
        onClick={() => void saveProjectAs()}
        className="rounded border border-edge px-2 py-1"
        title="Save As (Ctrl+Shift+S)"
      >
        Save As…
      </button>
      <button
        onClick={() => void importAssetForActiveLayer()}
        className="rounded border border-edge px-2 py-1"
        title="Import PNG into active layer's wardrobe"
      >
        Import PNG…
      </button>
      <button
        onClick={() => setExportOpen(true)}
        className="rounded border border-edge px-2 py-1"
        title="Export video (Ctrl+E)"
      >
        Export…
      </button>
      <span className="ml-2 truncate text-ink/60" title={projectPath ?? ""}>
        {titleBar}
        {dirty ? " •" : ""}
      </span>
      {exportOpen ? <ExportDialog onClose={() => setExportOpen(false)} /> : null}
    </div>
  );
}

