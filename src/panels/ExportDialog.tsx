import { useEffect, useRef, useState } from "react";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";

import { ExportJob, type ExportProgress } from "@/export/driver";
import { inTauri } from "@/ipc/tauri";
import { useStore } from "@/state/store";

export function ExportDialog(props: { onClose: () => void }) {
  const project = useStore((s) => s.project);
  const projectPath = useStore((s) => s.projectPath);
  const [outPath, setOutPath] = useState<string | null>(null);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const jobRef = useRef<ExportJob | null>(null);

  useEffect(() => {
    if (!projectPath) return;
    // Default the output to <projectName>.mp4 next to the project.
    const base = projectPath.replace(/\.json$/, "").replace(/[\\/]project$/, "");
    setOutPath(`${base}.mp4`);
  }, [projectPath]);

  async function pickOutput() {
    if (!inTauri()) return;
    const picked = await saveDialog({
      title: "Export video",
      defaultPath: outPath ?? "output.mp4",
      filters: [{ name: "MP4 video", extensions: ["mp4"] }],
    });
    if (picked) setOutPath(picked);
  }

  async function start() {
    if (!project || !outPath || running) return;
    setError(null);
    setRunning(true);
    setProgress({ jobId: "", kind: "rasterize", current: 0, total: project.scene.frames.length });
    const job = new ExportJob();
    jobRef.current = job;
    try {
      await job.run(project, {
        outPath,
        onProgress: (p) => setProgress(p),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
      jobRef.current = null;
    }
  }

  async function cancel() {
    await jobRef.current?.cancel();
    setRunning(false);
  }

  if (!project) return null;
  const total = project.scene.frames.length;
  const fps = project.settings.fps;
  const seconds = total / fps;

  const pct = progress
    ? progress.kind === "done"
      ? 100
      : Math.min(99, Math.round((progress.current / Math.max(1, progress.total)) * 100))
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => e.target === e.currentTarget && !running && props.onClose()}
    >
      <div className="w-[440px] rounded border border-edge bg-panel p-4 text-xs text-ink shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Export video</h2>
          <button
            onClick={() => !running && props.onClose()}
            disabled={running}
            className="text-ink/40 hover:text-ink disabled:opacity-30"
          >
            ×
          </button>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2 text-ink/70">
          <div>
            Frames: <span className="font-mono text-ink">{total}</span>
          </div>
          <div>
            FPS: <span className="font-mono text-ink">{fps}</span>
          </div>
          <div>
            Duration: <span className="font-mono text-ink">{seconds.toFixed(2)}s</span>
          </div>
          <div>
            Audio:{" "}
            <span className="font-mono text-ink">
              {project.scene.audio.filter((t) => !t.muted).length} track(s)
            </span>
          </div>
        </div>

        <label className="mb-2 block">
          <div className="mb-1 text-ink/60">Output file</div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={outPath ?? ""}
              onChange={(e) => setOutPath(e.currentTarget.value)}
              className="flex-1 rounded border border-edge bg-panel2 px-2 py-1 font-mono"
            />
            <button onClick={pickOutput} className="rounded border border-edge px-2 py-1">
              Browse…
            </button>
          </div>
        </label>

        {progress ? (
          <div className="mb-2">
            <div className="flex justify-between text-[10px] text-ink/60">
              <span>{progress.kind}</span>
              <span>
                {progress.current}/{progress.total} ({pct}%)
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-panel2">
              <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
            </div>
          </div>
        ) : null}

        {error ? <div className="mb-2 rounded bg-red-500/10 p-2 text-red-300">{error}</div> : null}

        <div className="flex justify-end gap-1">
          {running ? (
            <button onClick={cancel} className="rounded border border-edge px-3 py-1">
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={() => props.onClose()}
                className="rounded border border-edge px-3 py-1"
              >
                Close
              </button>
              <button
                onClick={start}
                disabled={!outPath}
                className="rounded border border-accent bg-accent/20 px-3 py-1 text-accent disabled:opacity-30"
              >
                Export
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
