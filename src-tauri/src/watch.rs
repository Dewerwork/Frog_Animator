// Filesystem watcher for assets/ — debounced events pushed to the webview
// for hot PNG reload. Wired up in M8.

use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebouncedEvent, Debouncer, FileIdMap};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Default)]
pub struct WatcherState {
    /// Holds the debouncer so it keeps running. Replaced wholesale when the
    /// user opens a different project.
    inner: Mutex<Option<Debouncer<notify::RecommendedWatcher, FileIdMap>>>,
}

impl WatcherState {
    pub fn new() -> Self {
        Self::default()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetChangedEvent {
    /// First path segment under assets/ — that's the assetId.
    pub asset_id: String,
    /// Filename within the asset directory (last path segment).
    pub file: String,
    /// Mtime in milliseconds since epoch when we observed the change. The
    /// webview can use this to debounce duplicate events further if needed.
    pub mtime_ms: i64,
}

/// Decompose an absolute path into (assetId, file) when it lives under
/// `<root>/assets/<assetId>/<file>`. Returns None for any other shape.
pub fn classify(path: &Path, assets_root: &Path) -> Option<(String, String)> {
    let rel = path.strip_prefix(assets_root).ok()?;
    let mut parts: Vec<String> = rel
        .components()
        .filter_map(|c| match c {
            Component::Normal(s) => Some(s.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect();
    if parts.len() < 2 {
        return None;
    }
    let file = parts.pop()?;
    let asset_id = parts.first()?.clone();
    if asset_id.is_empty() || file.is_empty() {
        return None;
    }
    Some((asset_id, file))
}

pub fn start(app: AppHandle, project_root: PathBuf, state: &WatcherState) -> Result<(), String> {
    let assets_root = project_root.join("assets");
    std::fs::create_dir_all(&assets_root).map_err(|e| e.to_string())?;

    // Replace any prior debouncer.
    let mut slot = state.inner.lock().unwrap();
    *slot = None;

    let (tx, rx) = std::sync::mpsc::channel();
    let mut debouncer = new_debouncer(Duration::from_millis(250), None, tx)
        .map_err(|e| format!("debouncer init: {e}"))?;
    debouncer
        .watcher()
        .watch(&assets_root, RecursiveMode::Recursive)
        .map_err(|e| format!("watch: {e}"))?;

    let app_clone = app.clone();
    let assets_root_clone = assets_root.clone();
    thread::spawn(move || {
        for events in rx {
            let events = match events {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("watcher: {e:?}");
                    continue;
                }
            };
            // De-dupe within the batch by (assetId, file) — many tools write
            // a tmp + rename, which fires multiple events for one logical
            // change.
            let mut seen: std::collections::HashSet<(String, String)> = Default::default();
            for ev in events.iter() {
                emit_for_event(&app_clone, &assets_root_clone, ev, &mut seen);
            }
        }
    });

    *slot = Some(debouncer);
    Ok(())
}

fn emit_for_event(
    app: &AppHandle,
    assets_root: &Path,
    ev: &DebouncedEvent,
    seen: &mut std::collections::HashSet<(String, String)>,
) {
    for path in ev.event.paths.iter() {
        let Some((asset_id, file)) = classify(path, assets_root) else {
            continue;
        };
        let key = (asset_id.clone(), file.clone());
        if seen.contains(&key) {
            continue;
        }
        // Skip transient zero-byte files (tools often touch the file before
        // writing). Real updates retrigger on the final close.
        let mtime_ms = match std::fs::metadata(path) {
            Ok(m) => {
                if m.len() == 0 {
                    continue;
                }
                m.modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0)
            }
            Err(_) => continue,
        };
        seen.insert(key);
        let _ = app.emit(
            "assets:changed",
            &AssetChangedEvent {
                asset_id,
                file,
                mtime_ms,
            },
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn classify_resolves_asset_id_and_file() {
        let root = PathBuf::from("/proj/assets");
        let p = PathBuf::from("/proj/assets/abc123/foo.png");
        let (id, f) = classify(&p, &root).unwrap();
        assert_eq!(id, "abc123");
        assert_eq!(f, "foo.png");
    }

    #[test]
    fn classify_rejects_paths_outside_assets() {
        let root = PathBuf::from("/proj/assets");
        let p = PathBuf::from("/elsewhere/abc123/foo.png");
        assert!(classify(&p, &root).is_none());
    }

    #[test]
    fn classify_rejects_too_shallow_paths() {
        let root = PathBuf::from("/proj/assets");
        // Just <assetId>/ — no file.
        let p = PathBuf::from("/proj/assets/abc123");
        assert!(classify(&p, &root).is_none());
    }

    /// Wires the debouncer up against a real temp directory and confirms
    /// that a file write under assets/<id>/ produces an event whose paths
    /// classify into the right (assetId, file) pair. Uses the underlying
    /// channel directly — no AppHandle needed.
    #[test]
    fn debouncer_observes_real_writes() {
        use notify_debouncer_full::new_debouncer;
        use std::sync::mpsc::channel;
        use std::time::Duration;

        let dir = std::env::temp_dir().join(format!(
            "frog-anim-watch-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let assets = dir.join("assets");
        std::fs::create_dir_all(&assets).unwrap();
        let asset_dir = assets.join("test-asset-id");
        std::fs::create_dir_all(&asset_dir).unwrap();

        let (tx, rx) = channel();
        let mut deb = new_debouncer(Duration::from_millis(150), None, tx).unwrap();
        deb.watcher().watch(&assets, RecursiveMode::Recursive).unwrap();

        // Write a file. notify needs a moment to pick it up.
        let target = asset_dir.join("frog.png");
        std::fs::write(&target, b"\x89PNG\r\n\x1a\n...").unwrap();

        // Pull events until we see one classifiable as our write, or timeout.
        let deadline = std::time::Instant::now() + Duration::from_secs(3);
        let mut found = false;
        while std::time::Instant::now() < deadline {
            match rx.recv_timeout(Duration::from_millis(500)) {
                Ok(Ok(events)) => {
                    for ev in events.iter() {
                        for p in ev.event.paths.iter() {
                            if let Some((id, file)) = classify(p, &assets) {
                                if id == "test-asset-id" && file == "frog.png" {
                                    found = true;
                                    break;
                                }
                            }
                        }
                        if found {
                            break;
                        }
                    }
                }
                _ => continue,
            }
            if found {
                break;
            }
        }
        std::fs::remove_dir_all(&dir).ok();
        assert!(found, "debouncer never reported the write");
    }
}
