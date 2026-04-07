use super::scan::scan_memory_files;
use super::types::MemoryHeader;
use std::collections::HashSet;
use std::path::Path;

/// Find the most relevant memory files for `query` using keyword scoring.
///
/// Scoring: meta (title + description) hits × 2.0 + body hits × 1.0.
/// English tokens ≥ 3 chars; every CJK character is its own token.
pub fn find_relevant_memories(query: &str, cwd: &Path, max_results: usize) -> Vec<MemoryHeader> {
    let tokens = tokenize(query);
    if tokens.is_empty() {
        return vec![];
    }

    let headers = scan_memory_files(cwd, 100);
    let mut scored: Vec<(f64, MemoryHeader)> = headers
        .into_iter()
        .filter_map(|h| {
            let meta = format!("{} {}", h.title, h.description).to_lowercase();
            let body = h.body_preview.to_lowercase();

            let meta_hits: usize = tokens.iter().filter(|t| meta.contains(t.as_str())).count();
            let body_hits: usize = tokens.iter().filter(|t| body.contains(t.as_str())).count();
            let score = meta_hits as f64 * 2.0 + body_hits as f64;
            if score > 0.0 {
                Some((score, h))
            } else {
                None
            }
        })
        .collect();

    // Sort by score desc, then by modified_at desc
    scored.sort_by(|a, b| {
        b.0.partial_cmp(&a.0)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(
                b.1.modified_at
                    .partial_cmp(&a.1.modified_at)
                    .unwrap_or(std::cmp::Ordering::Equal),
            )
    });

    scored
        .into_iter()
        .take(max_results)
        .map(|(_, h)| h)
        .collect()
}

fn tokenize(text: &str) -> HashSet<String> {
    let mut tokens = HashSet::new();
    // ASCII words of ≥ 3 chars
    let lower = text.to_lowercase();
    for word in lower.split(|c: char| !c.is_alphanumeric()) {
        if word.len() >= 3 {
            tokens.insert(word.to_string());
        }
    }
    // CJK characters individually
    for ch in text.chars() {
        let code = ch as u32;
        if (0x4E00..=0x9FFF).contains(&code) || (0x3400..=0x4DBF).contains(&code) {
            tokens.insert(ch.to_string());
        }
    }
    tokens
}
