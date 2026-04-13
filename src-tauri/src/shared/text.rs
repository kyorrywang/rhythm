pub fn truncate_chars(value: &str, max_chars: usize) -> &str {
    if max_chars == 0 {
        return "";
    }

    match value.char_indices().nth(max_chars) {
        Some((idx, _)) => &value[..idx],
        None => value,
    }
}

pub fn truncate_with_suffix(value: &str, max_chars: usize, suffix: &str) -> String {
    let truncated = truncate_chars(value, max_chars);
    if truncated.len() == value.len() {
        value.to_string()
    } else {
        format!("{truncated}{suffix}")
    }
}

#[cfg(test)]
mod tests {
    use super::{truncate_chars, truncate_with_suffix};

    #[test]
    fn truncates_on_char_boundary_for_multibyte_text() {
        assert_eq!(truncate_chars("abc集def", 4), "abc集");
    }

    #[test]
    fn returns_original_text_when_short_enough() {
        assert_eq!(truncate_chars("hello", 10), "hello");
    }

    #[test]
    fn appends_suffix_only_when_text_is_truncated() {
        assert_eq!(truncate_with_suffix("你好世界", 2, "..."), "你好...");
        assert_eq!(truncate_with_suffix("test", 10, "..."), "test");
    }
}
