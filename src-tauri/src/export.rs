// ffmpeg sidecar lifecycle: spawn, parse stderr for progress, allow cancel.
//
// Production builds should bundle per-target ffmpeg binaries via Tauri's
// `bundle.externalBin` and invoke them through tauri-plugin-shell. For now
// we shell out to `ffmpeg` from PATH, which is sufficient for development
// and lets the export pipeline be exercised end-to-end.

use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

#[derive(Debug)]
pub struct Job {
    pub job_id: String,
    pub tmp_dir: PathBuf,
    pub frames_dir: PathBuf,
    pub child: Option<Child>,
    pub cancelled: bool,
    pub frame_count: u32,
}

#[derive(Default)]
pub struct ExportRegistry {
    jobs: Mutex<HashMap<String, Arc<Mutex<Job>>>>,
}

impl ExportRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn create(&self, tmp_dir: PathBuf) -> std::io::Result<Arc<Mutex<Job>>> {
        let job_id = ulid::Ulid::new().to_string();
        let frames_dir = tmp_dir.join("frames");
        fs::create_dir_all(&frames_dir)?;
        let job = Arc::new(Mutex::new(Job {
            job_id: job_id.clone(),
            tmp_dir,
            frames_dir,
            child: None,
            cancelled: false,
            frame_count: 0,
        }));
        self.jobs.lock().unwrap().insert(job_id, job.clone());
        Ok(job)
    }

    pub fn get(&self, job_id: &str) -> Option<Arc<Mutex<Job>>> {
        self.jobs.lock().unwrap().get(job_id).cloned()
    }

    pub fn drop_job(&self, job_id: &str) {
        self.jobs.lock().unwrap().remove(job_id);
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportProgress {
    pub job_id: String,
    pub kind: String, // "rasterize" | "ffmpeg" | "done" | "error" | "cancelled"
    pub current: u32,
    pub total: u32,
    pub message: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportAudioClip {
    /// Absolute path to the source audio file on disk.
    pub abs_path: String,
    /// When in the timeline (in seconds) this clip starts.
    pub offset_seconds: f32,
    /// Linear gain multiplier (already converted from dB by the caller).
    pub gain: f32,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinalizeRequest {
    pub job_id: String,
    pub out_path: String,
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    pub audio: Vec<ExportAudioClip>,
    pub frame_count: u32,
}

/// Build the ffmpeg argv. Public so the unit test can sanity-check it without
/// actually spawning ffmpeg.
pub fn build_ffmpeg_args(req: &FinalizeRequest, frames_glob: &str) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-y".into(),
        "-framerate".into(),
        req.fps.to_string(),
        "-i".into(),
        frames_glob.into(),
    ];

    for clip in &req.audio {
        if clip.offset_seconds > 0.0 {
            args.push("-itsoffset".into());
            args.push(format!("{:.6}", clip.offset_seconds));
        }
        args.push("-i".into());
        args.push(clip.abs_path.clone());
    }

    let n = req.audio.len();
    if n > 0 {
        // Build amix filter. Per-track gain is applied via volume= filters.
        let mut filter = String::new();
        for (i, clip) in req.audio.iter().enumerate() {
            // Input index: video is 0, audio inputs start at 1.
            let inp = i + 1;
            filter.push_str(&format!("[{inp}:a]volume={:.4}[a{i}];", clip.gain));
        }
        for i in 0..n {
            filter.push_str(&format!("[a{i}]"));
        }
        filter.push_str(&format!("amix=inputs={n}:duration=longest[aout]"));
        args.push("-filter_complex".into());
        args.push(filter);
        args.push("-map".into());
        args.push("0:v".into());
        args.push("-map".into());
        args.push("[aout]".into());
        args.push("-c:a".into());
        args.push("aac".into());
        args.push("-b:a".into());
        args.push("192k".into());
    }

    args.push("-c:v".into());
    args.push("libx264".into());
    args.push("-pix_fmt".into());
    args.push("yuv420p".into());
    args.push("-crf".into());
    args.push("18".into());
    args.push("-movflags".into());
    args.push("+faststart".into());
    args.push("-progress".into());
    args.push("pipe:2".into());
    args.push(req.out_path.clone());
    args
}

pub fn parse_progress_line(line: &str, total_frames: u32) -> Option<ExportProgress> {
    // ffmpeg `-progress pipe:2` emits "frame=NN" lines among others.
    if let Some(rest) = line.strip_prefix("frame=") {
        if let Ok(frame) = rest.trim().parse::<u32>() {
            return Some(ExportProgress {
                job_id: String::new(),
                kind: "ffmpeg".into(),
                current: frame,
                total: total_frames,
                message: None,
            });
        }
    }
    None
}

pub fn run_ffmpeg(
    job: &Arc<Mutex<Job>>,
    req: &FinalizeRequest,
    app: &AppHandle,
) -> Result<(), String> {
    // Resolve frames glob. Frames are written as 000000.png, 000001.png, …
    let frames_glob = {
        let j = job.lock().unwrap();
        j.frames_dir.join("%06d.png").to_string_lossy().into_owned()
    };

    let args = build_ffmpeg_args(req, &frames_glob);

    let mut cmd = Command::new("ffmpeg");
    cmd.args(&args);
    cmd.stderr(Stdio::piped());
    cmd.stdout(Stdio::null());
    cmd.stdin(Stdio::null());

    let mut child = cmd.spawn().map_err(|e| format!("spawn ffmpeg failed: {e}"))?;
    let stderr = child.stderr.take().ok_or("no stderr")?;

    {
        let mut j = job.lock().unwrap();
        j.child = Some(child);
    }

    // Drain stderr in a worker thread so progress events flow without blocking.
    let job_id = job.lock().unwrap().job_id.clone();
    let total = req.frame_count;
    let app_clone = app.clone();
    let progress_thread = thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().flatten() {
            if let Some(mut p) = parse_progress_line(&line, total) {
                p.job_id = job_id.clone();
                let _ = app_clone.emit("export:progress", &p);
            }
        }
    });

    // Wait for the child.
    let exit = {
        let mut j = job.lock().unwrap();
        let child = j.child.as_mut().ok_or("child went away")?;
        match child.wait() {
            Ok(code) => code,
            Err(e) => return Err(format!("wait failed: {e}")),
        }
    };
    let _ = progress_thread.join();

    {
        let j = job.lock().unwrap();
        if j.cancelled {
            return Err("cancelled".into());
        }
    }

    if !exit.success() {
        return Err(format!("ffmpeg exited {exit:?}"));
    }
    Ok(())
}

/// Write `bytes` as the PNG for `frame_idx` under the job's frames_dir.
/// Returns the path written.
pub fn write_frame_png(job: &Arc<Mutex<Job>>, frame_idx: u32, bytes: &[u8]) -> std::io::Result<PathBuf> {
    let path = {
        let mut j = job.lock().unwrap();
        if frame_idx + 1 > j.frame_count {
            j.frame_count = frame_idx + 1;
        }
        j.frames_dir.join(format!("{:06}.png", frame_idx))
    };
    let mut f = fs::File::create(&path)?;
    f.write_all(bytes)?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mock_req() -> FinalizeRequest {
        FinalizeRequest {
            job_id: "j".into(),
            out_path: "/tmp/out.mp4".into(),
            fps: 24,
            width: 1280,
            height: 720,
            audio: vec![],
            frame_count: 60,
        }
    }

    #[test]
    fn ffmpeg_args_video_only() {
        let req = mock_req();
        let args = build_ffmpeg_args(&req, "/tmp/job/frames/%06d.png");
        assert!(args.iter().any(|a| a == "-framerate"));
        assert!(args.iter().any(|a| a == "24"));
        assert!(args.iter().any(|a| a == "libx264"));
        assert!(args.iter().any(|a| a == "yuv420p"));
        assert!(args.iter().any(|a| a == "+faststart"));
        // No audio plumbing when there are no clips.
        assert!(!args.iter().any(|a| a == "-filter_complex"));
        assert!(!args.iter().any(|a| a == "[aout]"));
    }

    #[test]
    fn ffmpeg_args_with_audio_builds_amix() {
        let mut req = mock_req();
        req.audio.push(ExportAudioClip {
            abs_path: "/tmp/a.wav".into(),
            offset_seconds: 0.5,
            gain: 0.7,
        });
        req.audio.push(ExportAudioClip {
            abs_path: "/tmp/b.wav".into(),
            offset_seconds: 0.0,
            gain: 1.0,
        });
        let args = build_ffmpeg_args(&req, "/tmp/job/frames/%06d.png");
        // First track has -itsoffset; second doesn't (offset == 0).
        let itsoffset_idx = args.iter().position(|a| a == "-itsoffset");
        assert!(itsoffset_idx.is_some());
        let filter_idx = args
            .iter()
            .position(|a| a == "-filter_complex")
            .expect("filter_complex");
        let filter = &args[filter_idx + 1];
        assert!(filter.contains("[1:a]volume="), "filter={filter}");
        assert!(filter.contains("[2:a]volume="), "filter={filter}");
        assert!(filter.contains("amix=inputs=2"), "filter={filter}");
        assert!(args.iter().any(|a| a == "[aout]"));
        assert!(args.iter().any(|a| a == "aac"));
    }

    #[test]
    fn parses_frame_progress_line() {
        let p = parse_progress_line("frame=42", 100).unwrap();
        assert_eq!(p.current, 42);
        assert_eq!(p.total, 100);
        assert_eq!(p.kind, "ffmpeg");
        assert!(parse_progress_line("bitrate=N/A", 100).is_none());
    }

    /// End-to-end ffmpeg invocation: synthesize a few solid-color PNGs,
    /// run the real ffmpeg with the args we'd generate, and confirm the
    /// resulting MP4 is non-trivially sized and starts with the ftyp box.
    /// Skipped when ffmpeg isn't on PATH.
    #[test]
    fn ffmpeg_end_to_end() {
        if std::process::Command::new("ffmpeg")
            .arg("-version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .is_err()
        {
            eprintln!("skipping: ffmpeg not on PATH");
            return;
        }
        let dir = std::env::temp_dir().join(format!(
            "frog-anim-export-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let frames = dir.join("frames");
        fs::create_dir_all(&frames).unwrap();

        // 4x4 RGB PNG — 8-byte magic, IHDR, IDAT (pre-deflated), IEND.
        // Generated via Python; embedded as raw bytes for the test.
        let red = include_bytes!("test_data/red_4x4.png");
        for i in 0..3u32 {
            let p = frames.join(format!("{:06}.png", i));
            fs::write(&p, red).unwrap();
        }

        let out = dir.join("out.mp4");
        let req = FinalizeRequest {
            job_id: "test".into(),
            out_path: out.to_string_lossy().into_owned(),
            fps: 24,
            width: 4,
            height: 4,
            audio: vec![],
            frame_count: 3,
        };
        let glob = frames.join("%06d.png").to_string_lossy().into_owned();
        let args = build_ffmpeg_args(&req, &glob);

        let status = std::process::Command::new("ffmpeg")
            .args(&args)
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .expect("spawn ffmpeg");
        assert!(status.success(), "ffmpeg exit {status:?}");

        let mp4 = fs::read(&out).unwrap();
        assert!(mp4.len() > 200, "mp4 too small: {} bytes", mp4.len());
        // ISO BMFF: bytes 4..8 of an MP4 are "ftyp".
        assert_eq!(&mp4[4..8], b"ftyp", "missing ftyp box");

        fs::remove_dir_all(&dir).ok();
    }
}
