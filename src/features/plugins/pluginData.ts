export interface PluginRecord {
  id: string;
  name: string;
  version: string;
  description: string;
  enabled: boolean;
  defaultEnabled: boolean;
  installPath: string;
  skills: Array<{ id: string; name: string; description: string }>;
  hooks: Array<{
    id: string;
    stage: 'pre_tool_use' | 'post_tool_use' | 'session_start' | 'session_end';
    type: 'command' | 'http';
    matcher: string;
    timeout: number;
    blockOnFailure: boolean;
  }>;
  mcpServers: Array<{
    id: string;
    name: string;
    endpoint: string;
    transport: 'stdio' | 'http';
  }>;
}

export const pluginCatalog: PluginRecord[] = [
  {
    id: 'runtime-tools',
    name: 'Runtime Tools',
    version: '0.1.0',
    description: '提供运行时工具扩展、结果预览和工作台桥接。',
    enabled: true,
    defaultEnabled: true,
    installPath: 'C:\\Users\\Administrator\\.codex\\plugins\\runtime-tools',
    skills: [
      { id: 'skill-shell', name: 'Shell Helpers', description: '为 shell 输出提供结构化展示和摘要。' },
      { id: 'skill-web', name: 'Web Preview', description: '检测本地服务地址并在 Workbench 中打开。' },
      { id: 'skill-diff', name: 'Diff Summary', description: '为 edit/write 工具生成更易读的结果摘要。' },
    ],
    hooks: [
      { id: 'h1', stage: 'post_tool_use', type: 'command', matcher: 'shell:*', timeout: 3000, blockOnFailure: false },
    ],
    mcpServers: [
      { id: 'm1', name: 'filesystem', endpoint: 'npx @modelcontextprotocol/server-filesystem', transport: 'stdio' },
    ],
  },
  {
    id: 'ui-helpers',
    name: 'UI Helpers',
    version: '0.2.1',
    description: '收纳前端布局辅助、主题片段和界面实验组件。',
    enabled: false,
    defaultEnabled: false,
    installPath: 'C:\\Users\\Administrator\\.codex\\plugins\\ui-helpers',
    skills: [
      { id: 'skill-theme', name: 'Theme Tokens', description: '统一主题 token 与界面变量生成。' },
    ],
    hooks: [
      { id: 'h2', stage: 'session_start', type: 'http', matcher: 'session:*', timeout: 5000, blockOnFailure: false },
    ],
    mcpServers: [],
  },
];
