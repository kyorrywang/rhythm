export const APP_NAME = 'Rhythm';
export const APP_VERSION = '0.1.0';

export const DEFAULT_MAX_TOKENS = 16384;
export const DEFAULT_MAX_TURNS = 100;

export const PERMISSION_MODES = {
  default: { label: '默认', desc: '只读允许，写操作需确认' },
  plan: { label: '计划', desc: '仅分析，阻止所有写操作' },
  full_auto: { label: '全自动', desc: '允许所有操作' },
} as const;

export const DOCK_PLACEHOLDERS = {
  none: '随便问点什么...',
  append: '发送引导消息，插队到当前对话中...',
  ask: '请输入...',
} as const;
