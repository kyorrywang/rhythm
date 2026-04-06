/// Source of a skill definition.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SkillSource {
    Bundled,
    User,
    /// Contributed by a plugin (Phase 10).
    Plugin { plugin_name: String },
}

/// A single named skill with its Markdown content.
#[derive(Debug, Clone)]
pub struct SkillDefinition {
    pub name: String,
    pub description: String,
    /// Raw Markdown content (shown to the LLM when the skill is invoked).
    pub content: String,
    pub source: SkillSource,
}
