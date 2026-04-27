// Atomic write: write to <path>.tmp, fsync, rename onto target.
// Used by project_save and any other crash-sensitive write.

use std::fs;
use std::io::Write;
use std::path::Path;

#[allow(dead_code)] // Used starting M2 (project_save).
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension(match path.extension() {
        Some(ext) => format!("{}.tmp", ext.to_string_lossy()),
        None => "tmp".to_string(),
    });
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}
