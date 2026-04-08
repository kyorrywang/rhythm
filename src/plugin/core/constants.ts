export const settingItems = [
  { id: 'model', name: '模型', description: '管理 provider、模型和默认选择。' },
  { id: 'session', name: '会话', description: '调整 max turns、system prompt 等。' },
  { id: 'permission', name: '权限', description: '配置工具权限与路径规则。' },
  { id: 'memory', name: '记忆', description: '控制 memory 入口与采样规模。' },
  { id: 'hooks', name: 'Hooks', description: '查看 hook 阶段、匹配器与失败策略。' },
  { id: 'mcp', name: 'MCP', description: '管理 MCP server 列表与连接方式。' },
  { id: 'auto_compact', name: '自动压缩', description: '控制上下文压缩阈值与 micro compact。' },
  { id: 'plugin', name: '插件配置', description: '查看全局插件启用配置与边界说明。' },
  { id: 'cron', name: '定时任务', description: '查看 cron job、工作目录与启用状态。' },
  { id: 'frontend', name: '前端显示', description: '管理主题、消息显示和本地偏好。' },
] as const;
