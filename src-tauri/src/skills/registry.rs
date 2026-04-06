use std::collections::HashMap;
use super::types::SkillDefinition;

pub struct SkillRegistry {
    skills: HashMap<String, SkillDefinition>,
}

impl SkillRegistry {
    pub fn new() -> Self {
        Self { skills: HashMap::new() }
    }

    /// Register a skill. Later registrations with the same name win.
    pub fn register(&mut self, skill: SkillDefinition) {
        self.skills.insert(skill.name.clone(), skill);
    }

    pub fn get(&self, name: &str) -> Option<&SkillDefinition> {
        self.skills.get(name)
    }

    /// All registered skills, sorted by name.
    pub fn list_skills(&self) -> Vec<&SkillDefinition> {
        let mut v: Vec<&SkillDefinition> = self.skills.values().collect();
        v.sort_by(|a, b| a.name.cmp(&b.name));
        v
    }
}

impl Default for SkillRegistry {
    fn default() -> Self { Self::new() }
}
