use async_trait::async_trait;
use serde::Deserialize;
use serde_json::Value;
use crate::shared::schema::EventPayload;
use crate::infrastructure::event_bus;
use crate::infrastructure::config;
use super::{BaseTool, ToolExecutionContext, ToolResult};

/// A tool that lets the Agent read the content of a named Skill.
pub struct SkillTool;

#[derive(Deserialize)]
struct SkillArgs {
    name: String,
}

#[async_trait]
impl BaseTool for SkillTool {
    fn name(&self) -> String { "skill".to_string() }

    fn description(&self) -> String {
        "Read the detailed instructions for a named skill (bundled or user-defined). \
         Use this when you need specialised guidance for a task such as debugging, \
         code review, making a git commit, or writing tests.".to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The name of the skill to load (e.g. 'plan', 'debug', 'review', 'commit', 'test')"
                }
            },
            "required": ["name"]
        })
    }

    fn is_read_only(&self) -> bool { true }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: SkillArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };

        let settings = config::load_settings();
        let registry = crate::skills::loader::load_skill_registry_for_cwd(&settings, &ctx.cwd);
        // Try exact name, then lowercase, then title-cased (like OpenHarness)
        let skill = registry.get(&args.name)
            .or_else(|| registry.get(&args.name.to_lowercase()))
            .or_else(|| {
                let mut chars = args.name.chars();
                let titled = chars.next().map(|c| c.to_uppercase().collect::<String>())
                    .unwrap_or_default() + chars.as_str();
                registry.get(&titled)
            });

        match skill {
            Some(s) => {
                event_bus::emit(&ctx.agent_id, &ctx.session_id, EventPayload::ToolOutput {
                    tool_id: ctx.tool_call_id.clone(),
                    log_line: format!("Loaded skill '{}'", s.name),
                });
                ToolResult::ok(s.content.clone())
            }
            None => ToolResult::error(format!(
                "Skill '{}' not found. Available skills: {}",
                args.name,
                registry.list_skills().iter().map(|s| s.name.as_str()).collect::<Vec<_>>().join(", ")
            )),
        }
    }
}
