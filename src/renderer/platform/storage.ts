/**
 * IndexedDB-backed project storage (NFR-8, NFR-9).
 *
 * Schema (single database `frog-animator`):
 *   - projects: keyPath `id`, stores serialized Project metadata + tree
 *   - assetBlobs: keyPath `id`, stores image Blobs keyed by asset id
 *   - templates: keyPath `id`, stores cross-project CharacterTemplates
 *
 * The store APIs in this file are intentionally thin — the editor's state
 * store will call them; render-time code never touches IndexedDB directly.
 */

import type { CharacterTemplate, Project } from '@renderer/domain/types';

const DB_NAME = 'frog-animator';
const DB_VERSION = 1;

export const STORES = {
  projects: 'projects',
  assetBlobs: 'assetBlobs',
  templates: 'templates',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.projects)) {
        db.createObjectStore(STORES.projects, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.assetBlobs)) {
        db.createObjectStore(STORES.assetBlobs, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.templates)) {
        db.createObjectStore(STORES.templates, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

// ---------- Projects ----------

export function saveProject(project: Project): Promise<IDBValidKey> {
  return tx(STORES.projects, 'readwrite', (s) => s.put(project));
}

export function loadProject(id: string): Promise<Project | undefined> {
  return tx(STORES.projects, 'readonly', (s) => s.get(id));
}

export function listProjects(): Promise<Project[]> {
  return tx(STORES.projects, 'readonly', (s) => s.getAll());
}

export function deleteProject(id: string): Promise<undefined> {
  return tx(STORES.projects, 'readwrite', (s) => s.delete(id));
}

// ---------- Asset blobs ----------

export type AssetBlobRecord = { id: string; blob: Blob };

export function putAssetBlob(record: AssetBlobRecord): Promise<IDBValidKey> {
  return tx(STORES.assetBlobs, 'readwrite', (s) => s.put(record));
}

export function getAssetBlob(id: string): Promise<AssetBlobRecord | undefined> {
  return tx(STORES.assetBlobs, 'readonly', (s) => s.get(id));
}

// ---------- Templates ----------

export function saveTemplate(
  template: CharacterTemplate,
): Promise<IDBValidKey> {
  return tx(STORES.templates, 'readwrite', (s) => s.put(template));
}

export function listTemplates(): Promise<CharacterTemplate[]> {
  return tx(STORES.templates, 'readonly', (s) => s.getAll());
}

export function deleteTemplate(id: string): Promise<undefined> {
  return tx(STORES.templates, 'readwrite', (s) => s.delete(id));
}
