use super::{BaseTool, ToolExecutionContext, ToolResult};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::path::Path;

pub struct PlanTasksTool;

// ─── Input schema ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct TaskDecl {
    id: String,
    description: String,
    #[serde(default)]
    depends_on: Vec<String>,
    output_file: String,
}

#[derive(Deserialize)]
struct PlanTasksArgs {
    workspace: String,
    tasks: Vec<TaskDecl>,
}

// ─── Persistent manifest types (pub so complete_task can use them) ───────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Pending,
    Done,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanTask {
    pub id: String,
    pub description: String,
    pub status: TaskStatus,
    pub output_file: String,
    /// Absolute path to the output file.
    pub output_path: String,
    pub depends_on: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlanManifest {
    pub workspace: String,
    pub workspace_path: String,
    pub created_at: String,
    pub tasks: Vec<PlanTask>,
}

impl PlanManifest {
    pub fn manifest_path(workspace_path: &Path) -> std::path::PathBuf {
        workspace_path.join("plan.json")
    }

    /// Load a manifest from disk.
    pub fn load(workspace_path: &Path) -> Result<Self, String> {
        let path = Self::manifest_path(workspace_path);
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Cannot read plan.json at '{}': {}", path.display(), e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse plan.json: {}", e))
    }

    /// Persist the manifest to disk (atomic write via tmp file).
    pub fn save(&self, workspace_path: &Path) -> Result<(), String> {
        let path = Self::manifest_path(workspace_path);
        let tmp = path.with_extension("json.tmp");
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize plan: {}", e))?;
        std::fs::write(&tmp, &json)
            .map_err(|e| format!("Failed to write tmp plan file: {}", e))?;
        std::fs::rename(&tmp, &path)
            .map_err(|e| format!("Failed to rename tmp plan file: {}", e))?;
        Ok(())
    }

    /// Return tasks whose all dependencies are done and that are still pending.
    pub fn ready_tasks(&self) -> Vec<&PlanTask> {
        let done_ids: HashSet<&str> = self
            .tasks
            .iter()
            .filter(|t| t.status == TaskStatus::Done)
            .map(|t| t.id.as_str())
            .collect();

        self.tasks
            .iter()
            .filter(|t| {
                t.status == TaskStatus::Pending
                    && t.depends_on.iter().all(|dep| done_ids.contains(dep.as_str()))
            })
            .collect()
    }

    /// Summary counts for observability.
    pub fn status_counts(&self) -> (usize, usize, usize) {
        let pending = self.tasks.iter().filter(|t| t.status == TaskStatus::Pending).count();
        let done = self.tasks.iter().filter(|t| t.status == TaskStatus::Done).count();
        let failed = self.tasks.iter().filter(|t| t.status == TaskStatus::Failed).count();
        (pending, done, failed)
    }
}

// ─── Cycle detection ──────────────────────────────────────────────────────────

/// Returns the cycle path as a Vec<String> if one is found, or None.
fn detect_cycle(tasks: &[TaskDecl]) -> Option<Vec<String>> {
    let index: HashMap<&str, &TaskDecl> =
        tasks.iter().map(|t| (t.id.as_str(), t)).collect();

    // 0 = unvisited, 1 = in stack, 2 = done
    let mut state: HashMap<&str, u8> = HashMap::new();
    let mut path: Vec<String> = Vec::new();

    fn dfs<'a>(
        id: &'a str,
        index: &HashMap<&'a str, &'a TaskDecl>,
        state: &mut HashMap<&'a str, u8>,
        path: &mut Vec<String>,
    ) -> bool {
        match state.get(id) {
            Some(2) => return false,
            Some(1) => return true, // back-edge → cycle
            _ => {}
        }
        state.insert(id, 1);
        path.push(id.to_string());
        if let Some(task) = index.get(id) {
            for dep in &task.depends_on {
                if dfs(dep.as_str(), index, state, path) {
                    return true;
                }
            }
        }
        state.insert(id, 2);
        path.pop();
        false
    }

    for task in tasks {
        if dfs(&task.id, &index, &mut state, &mut path) {
            path.push(path[0].clone()); // close the cycle for readability
            return Some(path);
        }
    }
    None
}

// ─── Tool implementation ──────────────────────────────────────────────────────

#[async_trait]
impl BaseTool for PlanTasksTool {
    fn name(&self) -> String {
        "plan_tasks".to_string()
    }

    fn description(&self) -> String {
        "Declare a complete, dependency-aware execution plan. Creates a persistent plan.json \
         manifest in a dedicated workspace directory, initialises empty output placeholder files, \
         validates the dependency graph (unknown refs, duplicates, cycles), and returns the first \
         wave of tasks that are immediately ready to start. \
         MUST be called before spawning any subagents for complex multi-step tasks. \
         After each subagent completes, call complete_task to advance the plan."
            .to_string()
    }

    fn parameters(&self) -> Value {
        serde_json::json!({
            "type": "object",
            "properties": {
                "workspace": {
                    "type": "string",
                    "description": "Unique name for this plan's workspace folder. Simple name only — no slashes or dots. Fails if the workspace already exists to prevent accidental overwrites."
                },
                "tasks": {
                    "type": "array",
                    "description": "Complete list of ALL tasks in the plan. Every task that will be executed must be declared here upfront.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {
                                "type": "string",
                                "description": "Unique task identifier (e.g. 'research_market'). Used in depends_on by other tasks."
                            },
                            "description": {
                                "type": "string",
                                "description": "What this task accomplishes. Stored in the plan manifest for traceability."
                            },
                            "depends_on": {
                                "type": "array",
                                "items": { "type": "string" },
                                "description": "IDs of tasks that must be marked done before this task can start. All IDs must exist in this plan. Leave empty for tasks that have no prerequisites."
                            },
                            "output_file": {
                                "type": "string",
                                "description": "Filename (not path) this task will write its output to, e.g. 'research.md'. The tool creates an empty file at this path inside the workspace."
                            }
                        },
                        "required": ["id", "description", "output_file"]
                    }
                }
            },
            "required": ["workspace", "tasks"]
        })
    }

    fn is_read_only(&self) -> bool {
        false
    }

    async fn execute(&self, args: Value, ctx: &ToolExecutionContext) -> ToolResult {
        let args: PlanTasksArgs = match serde_json::from_value(args) {
            Ok(a) => a,
            Err(e) => return ToolResult::error(e.to_string()),
        };

        // ── Validate workspace name ───────────────────────────────────────────
        if args.workspace.is_empty()
            || args.workspace.contains("..")
            || args.workspace.contains('/')
            || args.workspace.contains('\\')
        {
            return ToolResult::error(
                "Workspace name must be a non-empty simple name with no path separators."
                    .to_string(),
            );
        }

        // ── Validate task list not empty ──────────────────────────────────────
        if args.tasks.is_empty() {
            return ToolResult::error("Task list must not be empty.".to_string());
        }

        // ── Validate unique IDs and non-empty fields ──────────────────────────
        let mut seen_ids: HashSet<String> = HashSet::new();
        for task in &args.tasks {
            if task.id.is_empty() {
                return ToolResult::error("Every task must have a non-empty id.".to_string());
            }
            if !seen_ids.insert(task.id.clone()) {
                return ToolResult::error(format!("Duplicate task id: '{}'.", task.id));
            }
            if task.output_file.is_empty()
                || task.output_file.contains("..")
                || task.output_file.contains('/')
                || task.output_file.contains('\\')
            {
                return ToolResult::error(format!(
                    "Task '{}': output_file must be a simple filename with no path separators.",
                    task.id
                ));
            }
        }

        // ── Validate depends_on references ────────────────────────────────────
        for task in &args.tasks {
            for dep in &task.depends_on {
                if dep == &task.id {
                    return ToolResult::error(format!(
                        "Task '{}' cannot depend on itself.",
                        task.id
                    ));
                }
                if !seen_ids.contains(dep) {
                    return ToolResult::error(format!(
                        "Task '{}' depends on '{}', which is not declared in this plan.",
                        task.id, dep
                    ));
                }
            }
        }

        // ── Detect circular dependencies ──────────────────────────────────────
        if let Some(cycle) = detect_cycle(&args.tasks) {
            return ToolResult::error(format!(
                "Circular dependency detected: {}",
                cycle.join(" → ")
            ));
        }

        // ── Create workspace (fail if already exists) ─────────────────────────
        let tasks_dir = ctx.cwd.join(".rhythm").join("tasks");
        let workspace_path = tasks_dir.join(&args.workspace);

        if workspace_path.exists() {
            return ToolResult::error(format!(
                "Workspace '{}' already exists at '{}'. \
                 Use a unique workspace name or remove the existing directory first.",
                args.workspace,
                workspace_path.display()
            ));
        }

        if let Err(e) = std::fs::create_dir_all(&workspace_path) {
            return ToolResult::error(format!("Failed to create workspace directory: {}", e));
        }

        // ── Build manifest and create placeholder files ───────────────────────
        let created_at = chrono::Utc::now().to_rfc3339();
        let mut manifest_tasks: Vec<PlanTask> = Vec::new();

        for task in &args.tasks {
            let output_path = workspace_path.join(&task.output_file);
            if let Err(e) = std::fs::write(&output_path, "") {
                return ToolResult::error(format!(
                    "Failed to create placeholder file for task '{}': {}",
                    task.id, e
                ));
            }
            manifest_tasks.push(PlanTask {
                id: task.id.clone(),
                description: task.description.clone(),
                status: TaskStatus::Pending,
                output_file: task.output_file.clone(),
                output_path: output_path.to_string_lossy().to_string(),
                depends_on: task.depends_on.clone(),
            });
        }

        let manifest = PlanManifest {
            workspace: args.workspace.clone(),
            workspace_path: workspace_path.to_string_lossy().to_string(),
            created_at,
            tasks: manifest_tasks,
        };

        // ── Persist plan.json ─────────────────────────────────────────────────
        if let Err(e) = manifest.save(&workspace_path) {
            return ToolResult::error(e);
        }

        // ── Compute first wave ────────────────────────────────────────────────
        let ready_tasks: Vec<Value> = manifest
            .ready_tasks()
            .iter()
            .map(|t| {
                serde_json::json!({
                    "id": t.id,
                    "description": t.description,
                    "output_path": t.output_path,
                })
            })
            .collect();

        let manifest_path = PlanManifest::manifest_path(&workspace_path);
        let result = serde_json::json!({
            "workspace_path": manifest.workspace_path,
            "plan_file": manifest_path.to_string_lossy().to_string(),
            "total_tasks": manifest.tasks.len(),
            "ready_tasks": ready_tasks,
            "message": "Plan accepted and persisted to plan.json. Spawn subagents for each ready task, providing the exact output_path. After each subagent completes, call complete_task to advance the plan and receive the next wave."
        });

        ToolResult::ok(result.to_string())
    }
}
