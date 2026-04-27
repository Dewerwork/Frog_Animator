// Atomic write: write to <path>.tmp, fsync, rename onto target.
// Used by project_save and any other crash-sensitive write.

use std::fs;
use std::io::Write;
use std::path::Path;

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

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir() -> std::path::PathBuf {
        let base = std::env::temp_dir().join(format!(
            "frog-anim-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        base
    }

    #[test]
    fn replaces_target_in_place() {
        let dir = tmpdir();
        let path = dir.join("project.json");

        write_atomic(&path, br#"{"schemaVersion":1}"#).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), r#"{"schemaVersion":1}"#);

        // Second write must clobber.
        write_atomic(&path, br#"{"schemaVersion":1,"x":42}"#).unwrap();
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            r#"{"schemaVersion":1,"x":42}"#
        );

        // Tmp sibling must not be left behind after a successful rename.
        let tmp = path.with_extension("json.tmp");
        assert!(!tmp.exists());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn handles_extensionless_paths() {
        let dir = tmpdir();
        let path = dir.join("data");
        write_atomic(&path, b"hello").unwrap();
        assert_eq!(fs::read(&path).unwrap(), b"hello");
        assert!(!dir.join("data.tmp").exists());
        fs::remove_dir_all(&dir).ok();
    }
}
