// The data root, and every file access kept inside it.
use std::fs;
use std::io;
use std::path::{Component, Path, PathBuf};

use crate::Error;

#[derive(Debug, Clone)]
pub struct Workspace {
    root: PathBuf,
}

impl Workspace {
    /// `root` must be absolute. It is not created if missing.
    pub fn new(root: impl Into<PathBuf>) -> Self {
        let root = normalize(&root.into());
        Workspace { root }
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// Resolves a path relative to the data root. Anything outside it is refused, including
    /// symlinks that point outside.
    pub fn resolve(&self, rel: &str) -> Result<PathBuf, Error> {
        if rel.contains('\0') { return Err(Error::Path("Invalid path".into())); }
        let abs = normalize(&self.root.join(rel));
        let refused = || Error::Path(format!("Refused: {rel} is outside the data root"));
        if !abs.starts_with(&self.root) { return Err(refused()); }
        if abs.exists() {
            let real = fs::canonicalize(&abs)?;
            if !real.starts_with(fs::canonicalize(&self.root)?) { return Err(refused()); }
        }
        Ok(abs)
    }

    pub fn exists(&self, rel: &str) -> Result<bool, Error> {
        Ok(self.resolve(rel)?.exists())
    }

    /// The file as text. Bytes that aren't valid UTF-8 become U+FFFD.
    pub fn read_text(&self, rel: &str) -> Result<String, Error> {
        Ok(String::from_utf8_lossy(&fs::read(self.resolve(rel)?)?).into_owned())
    }

    /// Sorted names in a folder that end with `ext`, or `None` if the folder is missing.
    pub fn list_dir(&self, rel: &str, ext: &str) -> Result<Option<Vec<String>>, Error> {
        let abs = self.resolve(rel)?;
        if !abs.exists() { return Ok(None); }
        let mut names = Vec::new();
        for entry in fs::read_dir(abs)? {
            let name = entry?.file_name().to_string_lossy().into_owned();
            if name.ends_with(ext) { names.push(name); }
        }
        names.sort_by(|a, b| crate::js::cmp_utf16(a, b));
        Ok(Some(names))
    }
}

/// Lexical normalisation: "." and ".." are folded away without touching the disk.
fn normalize(p: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for c in p.components() {
        match c {
            Component::ParentDir => { out.pop(); }
            Component::CurDir => {}
            other => out.push(other.as_os_str()),
        }
    }
    out
}

impl From<io::Error> for Error {
    fn from(e: io::Error) -> Self {
        if e.kind() == io::ErrorKind::NotFound { Error::NotFound } else { Error::Internal(e.to_string()) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn outside_paths_are_refused() {
        let ws = Workspace::new("/tmp/ws");
        assert!(ws.resolve("../etc/passwd").is_err());
        assert!(ws.resolve("/etc/passwd").is_err());
        assert!(ws.resolve("a/../../x").is_err());
        assert_eq!(ws.resolve("a/../b.md").unwrap(), PathBuf::from("/tmp/ws/b.md"));
    }
}
