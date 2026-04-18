use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct MemoryHeader {
    pub path: PathBuf,
    pub title: String,
    pub description: String,
    pub modified_at: f64,
    pub body_preview: String,
}
