use std::path::PathBuf;
use std::fs;
use anyhow::Result;
use uuid::Uuid;
use crate::core::models::{FlowTemplate, FlowInstance};

pub struct WorkflowEngine {
    workspace_path: String,
    instance_dir: PathBuf,
}

impl WorkflowEngine {
    pub fn new(workspace_path: &str) -> Self {
        let mut path = PathBuf::from(workspace_path);
        path.push(".rhythm");
        path.push("flow_instances");
        fs::create_dir_all(&path).ok();
        Self {
            workspace_path: workspace_path.to_string(),
            instance_dir: path,
        }
    }

    fn template_dir(&self) -> PathBuf {
        let mut path = PathBuf::from(&self.workspace_path);
        path.push("workflows");
        fs::create_dir_all(&path).ok();
        path
    }

    pub fn save_template(&self, template: &FlowTemplate) -> Result<()> {
        let path = self.template_dir().join(format!("{}.yaml", template.id));
        let data = serde_yaml::to_string(template)?;
        fs::write(path, data)?;
        Ok(())
    }

    pub fn list_templates(&self) -> Result<Vec<FlowTemplate>> {
        let mut templates = vec![];
        if let Ok(entries) = fs::read_dir(self.template_dir()) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "yaml" || ext == "yml" {
                        if let Ok(data) = fs::read_to_string(&path) {
                            if let Ok(tpl) = serde_yaml::from_str(&data) {
                                templates.push(tpl);
                            }
                        }
                    } else if ext == "json" {
                        if let Ok(data) = fs::read_to_string(&path) {
                            if let Ok(tpl) = serde_json::from_str(&data) {
                                templates.push(tpl);
                            }
                        }
                    }
                }
            }
        }
        Ok(templates)
    }

    pub fn get_template(&self, template_id: &str) -> Result<Option<FlowTemplate>> {
        let yaml_path = self.template_dir().join(format!("{}.yaml", template_id));
        if yaml_path.exists() {
            let data = fs::read_to_string(yaml_path)?;
            return Ok(Some(serde_yaml::from_str(&data)?));
        }
        let json_path = self.template_dir().join(format!("{}.json", template_id));
        if json_path.exists() {
            let data = fs::read_to_string(json_path)?;
            return Ok(Some(serde_json::from_str(&data)?));
        }
        Ok(None)
    }

    pub fn save_instance(&self, instance: &FlowInstance) -> Result<()> {
        let path = self.instance_dir.join(format!("{}.json", instance.id));
        let data = serde_json::to_string_pretty(instance)?;
        fs::write(path, data)?;
        Ok(())
    }

    pub fn get_instance(&self, instance_id: &str) -> Result<Option<FlowInstance>> {
        let path = self.instance_dir.join(format!("{}.json", instance_id));
        if path.exists() {
            let data = fs::read_to_string(path)?;
            return Ok(Some(serde_json::from_str(&data)?));
        }
        Ok(None)
    }

    pub fn get_instances_for_session(&self, session_id: &str) -> Result<Vec<FlowInstance>> {
        let mut instances = vec![];
        if let Ok(entries) = fs::read_dir(&self.instance_dir) {
            for entry in entries.flatten() {
                if let Ok(data) = fs::read_to_string(entry.path()) {
                    if let Ok(inst) = serde_json::from_str::<FlowInstance>(&data) {
                        if inst.session_id == session_id {
                            instances.push(inst);
                        }
                    }
                }
            }
        }
        Ok(instances)
    }

    pub fn create_instance(&self, session_id: &str, template_id: &str) -> Result<FlowInstance> {
        let inst = FlowInstance {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.to_string(),
            template_id: template_id.to_string(),
            workspace_path: self.workspace_path.clone(),
            current_step_index: 0,
            state: "RUNNING".to_string(),
            context_data: std::collections::HashMap::new(),
            pending_question: None,
            required_keys: vec![],
        };
        self.save_instance(&inst)?;
        Ok(inst)
    }
}
