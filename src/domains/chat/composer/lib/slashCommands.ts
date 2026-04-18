import type { BackendSlashCommand } from '@/shared/types/api';
import type { ComposerSlashCommand } from '../types';

type SlashQueryParseResult = {
  active: boolean;
  query: string;
};

export function parseSlashQuery(input: string): SlashQueryParseResult {
  const trimmedStart = input.trimStart();
  if (!trimmedStart.startsWith('/')) {
    return { active: false, query: '' };
  }

  return {
    active: true,
    query: trimmedStart.slice(1),
  };
}

export function normalizeSlashCommands(commands: BackendSlashCommand[]): ComposerSlashCommand[] {
  return commands
    .map((command) => ({
      ...command,
      rawQuery: buildSearchText(command),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function filterComposerSlashCommands(
  commands: ComposerSlashCommand[],
  query: string,
): ComposerSlashCommand[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return commands;

  return commands.filter((command) => command.rawQuery.includes(normalizedQuery));
}

export function splitSlashCommandInput(input: string) {
  const trimmedStart = input.trimStart();
  const withoutSlash = trimmedStart.startsWith('/') ? trimmedStart.slice(1) : trimmedStart;
  const firstSpaceIndex = withoutSlash.indexOf(' ');
  if (firstSpaceIndex < 0) {
    return {
      commandName: withoutSlash.trim().toLowerCase(),
      argumentText: '',
    };
  }

  return {
    commandName: withoutSlash.slice(0, firstSpaceIndex).trim().toLowerCase(),
    argumentText: withoutSlash.slice(firstSpaceIndex + 1).trim(),
  };
}

function buildSearchText(command: BackendSlashCommand) {
  return [
    command.name,
    command.description,
    command.source,
    command.sourcePath,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' ')
    .toLowerCase();
}
