// Tauri command surface — kept thin per the architecture plan.
// State lives in the webview; these commands move bytes only.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

#[derive(Debug, thiserror::Error)]
pub enum CmdError {
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
pub struct ProjectFile {
    pub root: PathBuf,
    pub json: String,
}

#[tauri::command]
pub async fn project_open(_path: PathBuf) -> CmdResult<ProjectFile> {
    Err(CmdError::NotImplemented("project_open"))
}

#[tauri::command]
pub async fn project_save(_path: PathBuf, _json: String) -> CmdResult<()> {
    // TODO(M2): atomic write via fs_atomic::write_atomic.
    Err(CmdError::NotImplemented("project_save"))
}

#[tauri::command]
pub async fn asset_import(_project_root: PathBuf, _src: PathBuf) -> CmdResult<String> {
    // TODO(M2): copy into <root>/assets/<id>/, return AssetRef id.
    Err(CmdError::NotImplemented("asset_import"))
}

#[tauri::command]
pub async fn asset_read(_project_root: PathBuf, _asset_id: String) -> CmdResult<Vec<u8>> {
    Err(CmdError::NotImplemented("asset_read"))
}

#[tauri::command]
pub async fn audio_read(_project_root: PathBuf, _track_id: String) -> CmdResult<Vec<u8>> {
    Err(CmdError::NotImplemented("audio_read"))
}

#[tauri::command]
pub async fn watch_assets(_project_root: PathBuf) -> CmdResult<()> {
    // TODO(M8): notify-debouncer-full → emit `assets:changed` events.
    Err(CmdError::NotImplemented("watch_assets"))
}

#[derive(Debug, Serialize, Deserialize)]
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
