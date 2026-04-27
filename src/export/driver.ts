// Orchestrates an export: rasterize → write_frame for every frame, then
// export_finalize to mux. Subscribes to "export:progress" Tauri events and
// invokes the supplied callbacks.

import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { ipc, inTauri } from "@/ipc/tauri";
import type { Project } from "@/model/types";
import { useStore } from "@/state/store";
import { audioRuntime } from "@/audio/runtime";
import { createRasterizer, rasterizeFrame } from "./rasterize";

export interface ExportProgress {
  jobId: string;
  kind: "rasterize" | "ffmpeg" | "done" | "error" | "cancelled";
  current: number;
  total: number;
  message?: string;
}

export interface ExportOptions {
  outPath: string;
  width?: number;
  height?: number;
  onProgress?: (p: ExportProgress) => void;
}

export class ExportJob {
  jobId: string | null = null;
  cancelled = false;
  private unlisten: UnlistenFn | null = null;

  async run(project: Project, opts: ExportOptions): Promise<void> {
    if (!inTauri()) throw new Error("export requires Tauri");
    const fps = project.settings.fps;
    const width = opts.width ?? project.scene.canvas.width;
    const height = opts.height ?? project.scene.canvas.height;
    const total = project.scene.frames.length;
    const onProgress = opts.onProgress ?? (() => {});

    // Wire ffmpeg progress events before spawning the job, so we don't miss
    // any early frame= reports.
    this.unlisten = await listen<ExportProgress>("export:progress", (e) => {
      if (this.cancelled) return;
      onProgress(e.payload);
    });

    const start = await ipc.exportStart({});
    this.jobId = start.jobId;

    // Resolve audio clip paths up front. We need ABS paths and linear gains.
    const projectRoot = useStore.getState().projectRoot;
    const audioClips: { absPath: string; offsetSeconds: number; gain: number }[] = [];
    if (projectRoot) {
      for (const t of project.scene.audio) {
        if (t.muted) continue;
        if (!audioRuntime.hasTrack(t.id)) continue; // missing on disk
        const absPath = await ipc.audioPath(projectRoot, t.id, t.file);
        audioClips.push({
          absPath,
          offsetSeconds: t.offsetSeconds,
          gain: dbToLinear(t.gainDb),
        });
      }
    }

    // Rasterize every frame.
    const rast = await createRasterizer(width, height);
    try {
      for (let i = 0; i < total; i++) {
        if (this.cancelled) {
          onProgress({ jobId: start.jobId, kind: "cancelled", current: i, total });
          await ipc.exportCancel(start.jobId);
          return;
        }
        const bytes = await rasterizeFrame(rast, project, i);
        await ipc.exportWriteFrame(start.jobId, i, bytes);
        onProgress({ jobId: start.jobId, kind: "rasterize", current: i + 1, total });
      }
    } finally {
      rast.destroy();
    }

    if (this.cancelled) {
      await ipc.exportCancel(start.jobId);
      onProgress({ jobId: start.jobId, kind: "cancelled", current: total, total });
      return;
    }

    onProgress({
      jobId: start.jobId,
      kind: "ffmpeg",
      current: 0,
      total,
      message: "muxing",
    });

    try {
      await ipc.exportFinalize({
        jobId: start.jobId,
        outPath: opts.outPath,
        fps,
        width,
        height,
        audio: audioClips,
        frameCount: total,
      });
      onProgress({ jobId: start.jobId, kind: "done", current: total, total });
    } catch (e) {
      onProgress({
        jobId: start.jobId,
        kind: "error",
        current: 0,
        total,
        message: String(e),
      });
      throw e;
    } finally {
      if (this.unlisten) this.unlisten();
      this.unlisten = null;
    }
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    if (this.jobId) await ipc.exportCancel(this.jobId).catch(() => {});
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
  }
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}
