use std::collections::HashMap;
use crate::infrastructure::config::{HookConfig, HooksConfig};
use crate::infrastructure::config::RhythmSettings;
use super::events::HookEvent;
use std::path::Path;

pub struct HookRegistry {
    hooks: HashMap<String, Vec<HookConfig>>,
}

impl HookRegistry {
    pub fn new() -> Self {
        Self { hooks: HashMap::new() }
    }

    pub fn register(&mut self, event: HookEvent, hook: HookConfig) {
        self.hooks.entry(event.as_str().to_string()).or_default().push(hook);
    }

    pub fn get(&self, event: &HookEvent) -> Vec<&HookConfig> {
        self.hooks.get(event.as_str())
            .map(|v| v.iter().collect())
            .unwrap_or_default()
    }
}

impl Default for HookRegistry {
    fn default() -> Self { Self::new() }
}

/// Build a HookRegistry from the HooksConfig read from settings.
pub fn load_hook_registry(hooks_config: &HooksConfig) -> HookRegistry {
    let mut registry = HookRegistry::new();
    for hook in &hooks_config.pre_tool_use {
        registry.register(HookEvent::PreToolUse, hook.clone());
    }
    for hook in &hooks_config.post_tool_use {
        registry.register(HookEvent::PostToolUse, hook.clone());
    }
    for hook in &hooks_config.session_start {
        registry.register(HookEvent::SessionStart, hook.clone());
    }
    for hook in &hooks_config.session_end {
        registry.register(HookEvent::SessionEnd, hook.clone());
    }
    registry
}

pub fn load_hook_registry_for_cwd(settings: &RhythmSettings, cwd: &Path) -> HookRegistry {
    let mut registry = load_hook_registry(&settings.hooks);

    for plugin in crate::plugins::load_plugins(settings, cwd) {
        if !plugin.enabled {
            continue;
        }

        for (event_name, hooks) in plugin.hooks {
            let event = match event_name.as_str() {
                "pre_tool_use" => HookEvent::PreToolUse,
                "post_tool_use" => HookEvent::PostToolUse,
                "session_start" => HookEvent::SessionStart,
                "session_end" => HookEvent::SessionEnd,
                _ => continue,
            };

            for hook in hooks {
                registry.register(event.clone(), hook);
            }
        }
    }

    registry
}
