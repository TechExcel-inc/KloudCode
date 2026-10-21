//! The store plugin writes each settings file (`*.dat`) in place, and at load it treats a file it
//! cannot read as empty; the next save then overwrites it. A save cut short (the app stopped while
//! writing) therefore erased the EAD Pilot sign-in and other settings for good.
//!
//! At startup, before any store loads, each settings file that reads correctly is copied to
//! `<name>.bak`. A file that does not read is set aside as `<name>.damaged-<seconds>` and the last
//! good copy is put back, so an interrupted save costs at most the changes since the last start.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, PartialEq)]
pub enum Outcome {
    BackedUp,
    Restored,
    /// Damaged and no good copy to restore: set aside, so the app starts empty without losing the evidence.
    SetAside,
    Skipped,
}

pub fn protect(dir: &Path) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("dat") {
            continue;
        }
        match check(&path) {
            Outcome::Restored => tracing::warn!(file = %path.display(), "Settings file was damaged; restored the last good copy"),
            Outcome::SetAside => tracing::warn!(file = %path.display(), "Settings file was damaged and had no good copy; set it aside"),
            _ => {}
        }
    }
}

fn readable(bytes: &[u8]) -> bool {
    serde_json::from_slice::<serde_json::Map<String, serde_json::Value>>(bytes).is_ok()
}

fn with_suffix(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.as_os_str().to_owned();
    name.push(suffix);
    PathBuf::from(name)
}

pub fn check(path: &Path) -> Outcome {
    let Ok(bytes) = fs::read(path) else { return Outcome::Skipped };
    let backup = with_suffix(path, ".bak");
    if readable(&bytes) {
        return match fs::copy(path, &backup) {
            Ok(_) => Outcome::BackedUp,
            Err(_) => Outcome::Skipped,
        };
    }
    let seconds = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    if fs::rename(path, with_suffix(path, &format!(".damaged-{seconds}"))).is_err() {
        return Outcome::Skipped;
    }
    let good = fs::read(&backup).map(|saved| readable(&saved)).unwrap_or(false);
    if good && fs::copy(&backup, path).is_ok() {
        return Outcome::Restored;
    }
    Outcome::SetAside
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("sicode-settings-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_cut_short_save_is_replaced_by_the_last_good_copy() {
        let dir = scratch("restore");
        let file = dir.join("default.dat");
        fs::write(&file, r#"{"ead.v1":"{\"token\":\"t\"}"}"#).unwrap();
        assert_eq!(check(&file), Outcome::BackedUp);

        // The app was stopped halfway through a save.
        fs::write(&file, r#"{"ead.v1":"{\"tok"#).unwrap();
        assert_eq!(check(&file), Outcome::Restored);
        assert_eq!(fs::read_to_string(&file).unwrap(), r#"{"ead.v1":"{\"token\":\"t\"}"}"#);
        let damaged = fs::read_dir(&dir).unwrap().flatten().any(|e| e.file_name().to_string_lossy().contains(".damaged-"));
        assert!(damaged, "the damaged file is kept for inspection");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn an_empty_file_without_a_good_copy_is_set_aside() {
        let dir = scratch("aside");
        let file = dir.join("default.dat");
        fs::write(&file, "").unwrap();
        assert_eq!(check(&file), Outcome::SetAside);
        assert!(!file.exists());
        let _ = fs::remove_dir_all(&dir);
    }
}
