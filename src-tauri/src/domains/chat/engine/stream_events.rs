/// Token-usage snapshot for one or more turns.
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct UsageSnapshot {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

/// Accumulates usage across turns within a session.
#[derive(Debug, Default)]
pub struct UsageTracker {
    pub total: UsageSnapshot,
}

impl UsageTracker {
    pub fn add(&mut self, snap: &UsageSnapshot) {
        self.total.input_tokens += snap.input_tokens;
        self.total.output_tokens += snap.output_tokens;
    }
}

impl UsageSnapshot {
    pub fn from_estimate(input_chars: usize, output_chars: usize) -> Self {
        Self {
            input_tokens: (input_chars / 3) as u64,
            output_tokens: (output_chars / 3) as u64,
        }
    }
}
