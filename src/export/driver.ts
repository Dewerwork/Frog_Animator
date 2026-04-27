// Orchestrates rasterize → write_frame → ffmpeg sidecar mux. Wired in M7.

export interface ExportProgress {
  jobId: string;
  frame: number;
  total: number;
}

export async function startExport(): Promise<string> {
  throw new Error("export/driver: not implemented (M7)");
}
