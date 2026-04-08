export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  enabledByDefault?: boolean;
  main: string;
  dev?: {
    main?: string;
  };
  permissions?: string[];
  requires?: {
    plugins?: Record<string, string>;
    commands?: string[];
    tools?: string[];
  };
  contributes?: {
    commands?: CommandContribution[];
    tools?: ToolContribution[];
    views?: ViewContribution[];
    menus?: MenuContribution[];
    settings?: SettingsContribution[];
    skills?: SkillContribution[];
  };
}

export interface CommandContribution {
  id: string;
  description: string;
  parameters: unknown;
  readOnly?: boolean;
  permissions?: string[];
}

export interface ToolBackedCommandContribution extends CommandContribution {
  tool: string;
}

export interface UiCommandContribution extends CommandContribution {
  implementation: 'ui';
  entry: string;
  handler: string;
}

export interface RuntimeCommandContribution extends CommandContribution {
  implementation: 'node' | 'python';
  entry: string;
  handler: string;
}

export interface ToolContribution {
  id: string;
  description: string;
  parameters: unknown;
  readOnly?: boolean;
  permissions?: string[];
  runtime: 'node' | 'python';
  entry: string;
  handler: string;
}

export interface ViewContribution {
  id: string;
  title: string;
  location: 'leftPanel' | 'workbench';
}

export interface MenuContribution {
  id: string;
  command: string;
  title?: string;
}

export interface SettingsContribution {
  id: string;
  title: string;
}

export interface SkillContribution {
  dir: string;
}

export type AnyCommandContribution =
  | ToolBackedCommandContribution
  | UiCommandContribution
  | RuntimeCommandContribution;
