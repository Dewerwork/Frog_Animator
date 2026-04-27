// Tauri command surface — kept thin per the architecture plan.
// State lives in the webview; these commands move bytes (and paths) only.

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::export::{run_ffmpeg, write_frame_png, ExportRegistry, FinalizeRequest};
use crate::fs_atomic::write_atomic;
use crate::watch::{self, WatcherState};

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
pub async fn watch_assets(
    project_root: PathBuf,
    app: AppHandle,
    state: State<'_, WatcherState>,
) -> CmdResult<()> {
    watch::start(app, project_root, &state)
        .map_err(|e| CmdError::InvalidPath(format!("watch failed: {e}")))?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportStartReq {
    /// Optional override for the temporary directory (tests). If None, uses
    /// std::env::temp_dir()/frog-animator-export-<ulid>.
    pub tmp_override: Option<PathBuf>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportStartResp {
    pub job_id: String,
    pub tmp_dir: PathBuf,
    pub frames_dir: PathBuf,
}

#[tauri::command]
pub async fn export_start(
    req: ExportStartReq,
    registry: State<'_, ExportRegistry>,
) -> CmdResult<ExportStartResp> {
    let tmp = match req.tmp_override {
        Some(p) => {
            fs::create_dir_all(&p)?;
            p
        }
        None => {
            let base = std::env::temp_dir()
                .join(format!("frog-animator-export-{}", ulid::Ulid::new()));
            fs::create_dir_all(&base)?;
            base
        }
    };
    let job = registry.create(tmp)?;
    let j = job.lock().unwrap();
    Ok(ExportStartResp {
        job_id: j.job_id.clone(),
        tmp_dir: j.tmp_dir.clone(),
        frames_dir: j.frames_dir.clone(),
    })
}

#[tauri::command]
pub async fn export_write_frame(
    job_id: String,
    frame_idx: u32,
    bytes: Vec<u8>,
    registry: State<'_, ExportRegistry>,
) -> CmdResult<PathBuf> {
    let job = registry
        .get(&job_id)
        .ok_or_else(|| CmdError::InvalidPath(format!("unknown job {job_id}")))?;
    Ok(write_frame_png(&job, frame_idx, &bytes)?)
}

#[tauri::command]
pub async fn export_finalize(
    req: FinalizeRequest,
    app: AppHandle,
    registry: State<'_, ExportRegistry>,
) -> CmdResult<()> {
    let job = registry
        .get(&req.job_id)
        .ok_or_else(|| CmdError::InvalidPath(format!("unknown job {}", req.job_id)))?;
    run_ffmpeg(&job, &req, &app)
        .map_err(|e| CmdError::InvalidPath(format!("ffmpeg failed: {e}")))?;

    // Best-effort cleanup. Leave the tmp dir on error so the user can debug.
    let tmp = job.lock().unwrap().tmp_dir.clone();
    let _ = fs::remove_dir_all(&tmp);
    registry.drop_job(&req.job_id);
    Ok(())
}

#[tauri::command]
pub async fn export_cancel(
    job_id: String,
    registry: State<'_, ExportRegistry>,
) -> CmdResult<()> {
    let Some(job) = registry.get(&job_id) else {
        return Ok(());
    };
    let mut j = job.lock().unwrap();
    j.cancelled = true;
    if let Some(child) = j.child.as_mut() {
        let _ = child.kill();
    }
    Ok(())
}
