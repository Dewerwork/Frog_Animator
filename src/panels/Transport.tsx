import { useStore } from "@/state/store";
import { frameCount } from "@/state/selectors";
import { redo, undo } from "@/state/history";
import { centerCamera, zoomCamera } from "@/render/cameraControls";

export function Transport() {
  const playing = useStore((s) => s.playing);
  const togglePlay = useStore((s) => s.togglePlay);
  const insertBlank = useStore((s) => s.insertBlank);
  const duplicateFrame = useStore((s) => s.duplicateFrame);
  const deleteFrame = useStore((s) => s.deleteFrame);
  const captureFrame = useStore((s) => s.captureFrame);
  const copySelectedFrames = useStore((s) => s.copySelectedFrames);
  const pasteFramesInsert = useStore((s) => s.pasteFramesInsert);
  const pasteFramesAppend = useStore((s) => s.pasteFramesAppend);
  const selectedFrames = useStore((s) => s.selectedFrames);
  const project = useStore((s) => s.project);
  const i = useStore((s) => s.currentFrameIndex);
  const total = frameCount(project);

  const setFrameIndex = useStore((s) => s.setFrameIndex);

  return (
    <div className="flex items-center gap-1 text-xs">
      <button
        onClick={() => setFrameIndex(0)}
        className="rounded border border-edge px-2 py-1"
        title="First frame (Home)"
      >
        |◀
      </button>
      <button
        onClick={() => setFrameIndex(Math.max(0, i - 1))}
        className="rounded border border-edge px-2 py-1"
        title="Previous frame (←)"
      >
        ◀
      </button>
      <button
        onClick={togglePlay}
        className={`rounded border px-3 py-1 ${
          playing ? "border-accent bg-accent/20 text-accent" : "border-edge"
        }`}
        title="Play / pause (\\)"
      >
        {playing ? "⏸" : "▶"}
      </button>
      <button
        onClick={() => setFrameIndex(Math.min(total - 1, i + 1))}
        className="rounded border border-edge px-2 py-1"
        title="Next frame (→)"
      >
        ▶
      </button>
      <button
        onClick={() => setFrameIndex(Math.max(0, total - 1))}
        className="rounded border border-edge px-2 py-1"
        title="Last frame (End)"
      >
        ▶|
      </button>
      <span className="mx-2 h-5 border-l border-edge" />
      <button
        onClick={() => captureFrame("all")}
        className="rounded border border-accent bg-accent/20 px-2 py-1 text-accent"
        title="Capture all changed targets (Space)"
      >
        Capture
      </button>
      <button
        onClick={() => captureFrame("selected")}
        className="rounded border border-edge px-2 py-1"
        title="Capture only the selected layer's edits (Shift+Space)"
      >
        Capture sel.
      </button>
      <button
        onClick={insertBlank}
        className="rounded border border-edge px-2 py-1"
        title="Insert blank frame (B)"
      >
        + Blank
      </button>
      <button
        onClick={() => duplicateFrame()}
        className="rounded border border-edge px-2 py-1"
        title="Duplicate current frame (Ctrl/Cmd+D)"
      >
        Dup
      </button>
      <button
        onClick={() => deleteFrame()}
        disabled={total <= 1}
        className="rounded border border-edge px-2 py-1 disabled:opacity-30"
        title="Delete current frame"
      >
        Del
      </button>
      <button
        onClick={() => copySelectedFrames()}
        className="rounded border border-edge px-2 py-1"
        title={`Copy frame${selectedFrames.length > 1 ? "s" : ""} (Ctrl/Cmd+C)`}
      >
        Copy{selectedFrames.length > 1 ? ` ${selectedFrames.length}` : ""}
      </button>
      <button
        onClick={() => pasteFramesInsert()}
        className="rounded border border-edge px-2 py-1"
        title="Paste after current frame (Ctrl/Cmd+V)"
      >
        Paste
      </button>
      <button
        onClick={() => pasteFramesAppend()}
        className="rounded border border-edge px-2 py-1"
        title="Paste at end of timeline (Ctrl/Cmd+Shift+V)"
      >
        Paste end
      </button>
      <span className="mx-2 h-5 border-l border-edge" />
      <button
        onClick={() => undo()}
        className="rounded border border-edge px-2 py-1"
        title="Undo (Ctrl/Cmd+Z)"
      >
        ↶
      </button>
      <button
        onClick={() => redo()}
        className="rounded border border-edge px-2 py-1"
        title="Redo (Ctrl/Cmd+Shift+Z)"
      >
        ↷
      </button>
      <span className="mx-2 h-5 border-l border-edge" />
      <button
        onClick={() => zoomCamera(1 / 1.25)}
        className="rounded border border-edge px-2 py-1"
        title="Zoom out"
      >
        −
      </button>
      <button
        onClick={() => centerCamera()}
        className="rounded border border-edge px-2 py-1"
        title="Center / fit canvas to viewport"
      >
        ⊙
      </button>
      <button
        onClick={() => zoomCamera(1.25)}
        className="rounded border border-edge px-2 py-1"
        title="Zoom in"
      >
        +
      </button>
    </div>
  );
}
