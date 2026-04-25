/**
 * Renderer-side helpers for native filesystem operations. All actual I/O
 * happens in the main process via `window.frog` (preload bridge).
 *
 * Project files (.frog) are zip-style bundles containing a manifest plus
 * the original image blobs, which keeps backups portable across machines
 * (FR-9.4). For v1 the bundle is a single JSON document with base64 blobs
 * — simple, robust, and trivially diffable. We can switch to a true ZIP
 * format later without breaking projects already on disk if we version
 * the manifest.
 */

import type { Project } from '@renderer/domain/types';

export type ProjectBundle = {
  schemaVersion: 1;
  project: Project;
  // assetId -> base64-encoded blob bytes
  blobs: Record<string, string>;
};

export async function saveProjectBundle(
  path: string,
  bundle: ProjectBundle,
): Promise<void> {
  const json = JSON.stringify(bundle);
  const buf = new TextEncoder().encode(json);
  await window.frog.writeFileBuffer(path, buf.buffer);
}

export async function loadProjectBundle(path: string): Promise<ProjectBundle> {
  const buf = await window.frog.readFileAsBuffer(path);
  const json = new TextDecoder().decode(buf);
  return JSON.parse(json) as ProjectBundle;
}

export async function readImageFromDisk(path: string): Promise<Blob> {
  const buf = await window.frog.readFileAsBuffer(path);
  return new Blob([buf], { type: mimeFromPath(path) });
}

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.psd')) return 'image/vnd.adobe.photoshop';
  return 'application/octet-stream';
}
