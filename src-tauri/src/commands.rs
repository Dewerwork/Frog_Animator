// Tauri command surface — kept thin per the architecture plan.
// State lives in the webview; these commands move bytes (and paths) only.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::fs_atomic::write_atomic;

#[derive(Debug, thiserror::Error)]
pub enum CmdError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("invalid path: {0}")]
    InvalidPath(String),
    #[error("not implemented yet: {0}")]
    NotImplemented(&'static str),
}

impl serde::Serialize for CmdError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

type CmdResult<T> = Result<T, CmdError>;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    /// Absolute path to project.json.
    pub path: PathBuf,
    /// Absolute path to the project root (parent of project.json).
    pub root: PathBuf,
    /// Project JSON contents.
    pub json: String,
}

fn project_root_of(path: &Path) -> Result<PathBuf, CmdError> {
    path.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| CmdError::InvalidPath(format!("{} has no parent", path.display())))
}

fn ensure_project_dirs(root: &Path) -> std::io::Result<()> {
    fs::create_dir_all(root.join("assets"))?;
    fs::create_dir_all(root.join("audio"))?;
    Ok(())
}

#[tauri::command]
pub async fn project_open(path: PathBuf) -> CmdResult<ProjectFile> {
    let json = fs::read_to_string(&path)?;
    let root = project_root_of(&path)?;
    Ok(ProjectFile { path, root, json })
}

/// Create a new project skeleton at `path` (a project.json path) with the
/// caller-supplied initial JSON. Returns the same shape as `project_open`.
#[tauri::command]
pub async fn project_create(path: PathBuf, initial_json: String) -> CmdResult<ProjectFile> {
    let root = project_root_of(&path)?;
    fs::create_dir_all(&root)?;
    ensure_project_dirs(&root)?;
    write_atomic(&path, initial_json.as_bytes())?;
    Ok(ProjectFile {
        path,
        root,
        json: initial_json,
    })
}

#[tauri::command]
pub async fn project_save(path: PathBuf, json: String) -> CmdResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let root = project_root_of(&path)?;
    ensure_project_dirs(&root)?;
    write_atomic(&path, json.as_bytes())?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAsset {
    pub asset_id: String,
    pub file: String,
    /// Absolute path to the copied file — webview uses this with convertFileSrc.
    pub abs_path: PathBuf,
}

#[tauri::command]
pub async fn asset_import(project_root: PathBuf, src: PathBuf) -> CmdResult<ImportedAsset> {
    let file = src
        .file_name()
        .ok_or_else(|| CmdError::InvalidPath(format!("{} has no file name", src.display())))?
        .to_string_lossy()
        .to_string();
    let asset_id = ulid::Ulid::new().to_string();
    let dst_dir = project_root.join("assets").join(&asset_id);
    fs::create_dir_all(&dst_dir)?;
    let dst = dst_dir.join(&file);
    fs::copy(&src, &dst)?;
    Ok(ImportedAsset {
        asset_id,
        file,
        abs_path: dst,
    })
}

#[tauri::command]
pub async fn asset_read(project_root: PathBuf, asset_id: String, file: String) -> CmdResult<Vec<u8>> {
    let p = project_root.join("assets").join(&asset_id).join(&file);
    Ok(fs::read(p)?)
}

/// Resolve the absolute path of an asset on disk. Webview converts this to a
/// loadable URL via @tauri-apps/api/core convertFileSrc.
#[tauri::command]
pub async fn asset_path(project_root: PathBuf, asset_id: String, file: String) -> CmdResult<PathBuf> {
    Ok(project_root.join("assets").join(&asset_id).join(&file))
}

#[tauri::command]
pub async fn audio_read(project_root: PathBuf, track_id: String, file: String) -> CmdResult<Vec<u8>> {
    let p = project_root.join("audio").join(&track_id).join(&file);
    Ok(fs::read(p)?)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedAudio {
    pub track_id: String,
    pub file: String,
    pub abs_path: PathBuf,
}

#[tauri::command]
pub async fn audio_import(project_root: PathBuf, src: PathBuf) -> CmdResult<ImportedAudio> {
    let file = src
        .file_name()
        .ok_or_else(|| CmdError::InvalidPath(format!("{} has no file name", src.display())))?
        .to_string_lossy()
        .to_string();
    let track_id = ulid::Ulid::new().to_string();
    let dst_dir = project_root.join("audio").join(&track_id);
    fs::create_dir_all(&dst_dir)?;
    let dst = dst_dir.join(&file);
    fs::copy(&src, &dst)?;
    Ok(ImportedAudio {
        track_id,
        file,
        abs_path: dst,
    })
}

#[tauri::command]
pub async fn audio_path(project_root: PathBuf, track_id: String, file: String) -> CmdResult<PathBuf> {
    Ok(project_root.join("audio").join(&track_id).join(&file))
}

#[tauri::command]
pub async fn watch_assets(_project_root: PathBuf) -> CmdResult<()> {
    // TODO(M8): notify-debouncer-full → emit `assets:changed` events.
    Err(CmdError::NotImplemented("watch_assets"))
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub project_root: PathBuf,
    pub out_path: PathBuf,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub async fn export_start(_req: ExportRequest) -> CmdResult<String> {
    // TODO(M7): spawn ffmpeg sidecar, return jobId.
    Err(CmdError::NotImplemented("export_start"))
}

#[tauri::command]
pub async fn export_cancel(_job_id: String) -> CmdResult<()> {
    Err(CmdError::NotImplemented("export_cancel"))
}
