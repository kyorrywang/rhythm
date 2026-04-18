#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TaskNotification {
    pub task_id: String,
    pub status: TaskNotificationStatus,
    pub summary: String,
    pub result: String,
    pub total_tokens: u64,
    pub tool_uses: u64,
    pub duration_ms: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskNotificationStatus {
    Completed,
    Failed,
    Killed,
}

pub fn format_task_notification(notification: &TaskNotification) -> String {
    let status = match notification.status {
        TaskNotificationStatus::Completed => "completed",
        TaskNotificationStatus::Failed => "failed",
        TaskNotificationStatus::Killed => "killed",
    };
    format!(
        "<task-notification>\n  \
         <task-id>{}</task-id>\n  \
         <status>{}</status>\n  \
         <summary>{}</summary>\n  \
         <result>{}</result>\n  \
         <usage>\n    \
           <total_tokens>{}</total_tokens>\n    \
           <tool_uses>{}</tool_uses>\n    \
           <duration_ms>{}</duration_ms>\n  \
         </usage>\n\
         </task-notification>",
        notification.task_id,
        status,
        notification.summary,
        notification.result,
        notification.total_tokens,
        notification.tool_uses,
        notification.duration_ms,
    )
}
