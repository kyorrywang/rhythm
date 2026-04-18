const fs = require('fs');
const path = require('path');
const readline = require('readline');

function createRuntimeHost(call) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });
  const pendingResponses = new Map();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const message = JSON.parse(line);
      const pending = pendingResponses.get(String(message.id));
      if (pending) {
        pendingResponses.delete(String(message.id));
        pending(message);
      }
    } catch {
      // Ignore malformed host responses.
    }
  });

  let rpcId = 0;
  function rpc(method, params) {
    rpcId += 1;
    const id = `slash-rpc-${rpcId}`;
    process.stdout.write(`${JSON.stringify({ id, method, params })}\n`);
    return new Promise((resolve, reject) => {
      pendingResponses.set(id, (message) => {
        if (message.ok === false) {
          reject(new Error(message.error?.message || 'rpc failed'));
          return;
        }
        resolve(message.data);
      });
    });
  }

  function workspaceRoot() {
    return call.context.cwd;
  }

  function pluginRoot() {
    return process.cwd();
  }

  function slashConfig() {
    const config = call.slash || call.input?.slash;
    if (!config || !config.commandsDir || !config.skillsDir) {
      throw new Error('Slash runtime requires manifest-declared slash contribution paths');
    }
    return config;
  }

  function normalizeWorkspacePath(target) {
    return path.relative(workspaceRoot(), target).replace(/\\/g, '/');
  }

  function slashCommandsRoot() {
    return path.resolve(pluginRoot(), slashConfig().commandsDir);
  }

  function slashSkillsRoot() {
    return path.resolve(pluginRoot(), slashConfig().skillsDir);
  }

  async function readWorkspaceText(target) {
    return rpc('workspace.readText', { path: normalizeWorkspacePath(target) });
  }

  async function writeWorkspaceText(target, content) {
    await rpc('workspace.writeText', { path: normalizeWorkspacePath(target), content });
  }

  async function listWorkspaceDir(target) {
    return rpc('workspace.listDir', { path: normalizeWorkspacePath(target) });
  }

  async function readIfExists(target) {
    try {
      return await readWorkspaceText(target);
    } catch {
      return null;
    }
  }

  async function listFilesIfExists(target) {
    try {
      return await listWorkspaceDir(target);
    } catch {
      return [];
    }
  }

  function listSkillProfiles() {
    const skillsRoot = slashSkillsRoot();
    return fs.readdirSync(skillsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => {
        if (left === 'default') return -1;
        if (right === 'default') return 1;
        return left.localeCompare(right);
      });
  }

  function loadSkillText(profile, fileName) {
    const skillsRoot = slashSkillsRoot();
    const preferred = path.join(skillsRoot, profile, fileName);
    const fallback = path.join(skillsRoot, 'default', fileName);
    return fs.readFileSync(fs.existsSync(preferred) ? preferred : fallback, 'utf8');
  }

  function normalizeCommandInput(commandName, rawInput) {
    const input = String(rawInput || '');
    const trimmedStart = input.trimStart();
    const prefix = `/${commandName}`;
    if (!trimmedStart.startsWith(prefix)) {
      return input.trim();
    }
    const rest = trimmedStart.slice(prefix.length);
    return rest.trim();
  }

  function yamlValue(text, key) {
    const match = String(text || '').match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
    return match ? match[1].trim() : null;
  }

  function defaultNovelRoot(projectText) {
    return yamlValue(projectText, 'root') || '.novel';
  }

  function resolveActiveProfile(descriptor, context) {
    return yamlValue(context?.project, 'profile')
      || descriptor.defaultSkill
      || 'default';
  }

  async function restoreNovelContext() {
    const projectPath = path.join(workspaceRoot(), '.novel', 'project.yaml');
    const project = await readIfExists(projectPath);
    const root = path.join(workspaceRoot(), defaultNovelRoot(project));
    const archiveSummary = await readIfExists(path.join(root, 'archive', 'summaries', 'conversation-summary.md'));
    const stateSummary = await readIfExists(path.join(root, 'archive', 'summaries', 'state-summary.md'));
    const latestSession = await readIfExists(path.join(root, 'archive', 'sessions', 'latest-session.md'));
    const settingBrief = await readIfExists(path.join(root, 'discovery', 'setting-brief.md'));
    const arcBrief = await readIfExists(path.join(root, 'discovery', 'arc-brief.md'));
    const bible = await readIfExists(path.join(root, 'setting', 'bible.md'));
    const outline = await readIfExists(path.join(root, 'outline', 'master-outline.md'));
    const chapterEntries = (await listFilesIfExists(path.join(root, 'chapters')))
      .filter((entry) => entry.kind === 'file' && /\.md$/i.test(entry.path || entry.name))
      .sort((left, right) => String(left.name).localeCompare(String(right.name)))
      .slice(-3);
    const chapters = [];
    for (const entry of chapterEntries) {
      const absolute = path.join(workspaceRoot(), entry.path.replace(/\//g, path.sep));
      chapters.push({ name: entry.name, content: await readIfExists(absolute) });
    }

    return {
      projectPath,
      root,
      project,
      archiveSummary,
      stateSummary,
      latestSession,
      settingBrief,
      arcBrief,
      bible,
      outline,
      chapters,
    };
  }

  function renderContextSnapshot(context) {
    return [
      '# 恢复上下文',
      '',
      '## 项目配置',
      context.project || '(暂无 .novel/project.yaml)',
      '',
      '## 对话归档摘要',
      context.archiveSummary || '(暂无 conversation summary)',
      '',
      '## 状态归档摘要',
      context.stateSummary || '(暂无 state summary)',
      '',
      '## 最近归档会话',
      context.latestSession || '(暂无 latest session archive)',
      '',
      '## 设定 brief',
      context.settingBrief || '(暂无 setting brief)',
      '',
      '## 剧情 brief',
      context.arcBrief || '(暂无 arc brief)',
      '',
      '## 设定集',
      context.bible || '(暂无 bible)',
      '',
      '## 大纲',
      context.outline || '(暂无 outline)',
      '',
      '## 最近章节',
      context.chapters.length > 0
        ? context.chapters.map((chapter) => `### ${chapter.name}\n${chapter.content || '(空)'}`).join('\n\n')
        : '(暂无章节)',
    ].join('\n');
  }

  function renderSkillBlocks(profile, descriptor) {
    const files = Array.isArray(descriptor.skillFiles) && descriptor.skillFiles.length > 0
      ? descriptor.skillFiles
      : [`${descriptor.entry?.id || 'command'}.md`];
    return files.map((fileName) => ({
      fileName,
      content: loadSkillText(profile, fileName),
    }));
  }

  function renderOutputHints(descriptor) {
    const outputs = Array.isArray(descriptor.outputHints) ? descriptor.outputHints : [];
    if (outputs.length === 0) {
      return '(无强制输出文件，可以直接在对话中推进；若需要落盘，请自行判断并使用工作区文件工具。)';
    }
    return outputs.map((item) => {
      const pathText = item.path || '(未指定路径)';
      const description = item.description || '按命令目标决定是否写入';
      return `- ${pathText}: ${description}`;
    }).join('\n');
  }

  function buildSkillPrompt(descriptor, profile, context) {
    const normalizedInput = normalizeCommandInput(descriptor.name, call.input?.userInput || '');
    const availableProfiles = listSkillProfiles();
    const skillBlocks = renderSkillBlocks(profile, descriptor);
    return [
      `# Novel Slash Command`,
      '',
      `command: ${descriptor.name}`,
      `title: ${descriptor.title || descriptor.name}`,
      `profile: ${profile}`,
      `available_profiles: ${availableProfiles.join(', ') || 'default'}`,
      '',
      '## Command Description',
      descriptor.description || '(无描述)',
      '',
      '## User Input',
      normalizedInput || '(无额外输入)',
      '',
      '## Project Context',
      renderContextSnapshot(context),
      '',
      '## Output Hints',
      renderOutputHints(descriptor),
      '',
      '## Active Skill Instructions',
      ...skillBlocks.flatMap((block) => [
        '',
        `### ${block.fileName}`,
        block.content,
      ]),
      '',
      '## Runtime Rules',
      '- 你正在响应一个 novel 插件 slash 命令。',
      '- 以 skill prompt 为主要行为依据，不要被程序化工作流限制。',
      '- 如果需要继续追问用户，就直接在当前对话里提问。',
      '- 如果需要创建或更新文件，请直接使用工作区文件工具写入目标文件。',
      '- 如果上下文不足，请优先基于 skill 提问或澄清，而不是擅自编造。',
      '- 保持输出贴合当前小说项目，而不是泛化成通用建议。',
    ].join('\n');
  }

  async function runSkillPromptCommand(descriptor) {
    const context = await restoreNovelContext();
    const profile = resolveActiveProfile(descriptor, context);
    const prompt = buildSkillPrompt(descriptor, profile, context);
    return {
      status: 'prompt',
      prompt,
    };
  }

  return {
    call,
    pluginRoot,
    slashConfig,
    slashCommandsRoot,
    slashSkillsRoot,
    workspaceRoot,
    normalizeWorkspacePath,
    readWorkspaceText,
    writeWorkspaceText,
    listWorkspaceDir,
    readIfExists,
    listFilesIfExists,
    listSkillProfiles,
    loadSkillText,
    yamlValue,
    restoreNovelContext,
    renderContextSnapshot,
    normalizeCommandInput,
    resolveActiveProfile,
    buildSkillPrompt,
    runSkillPromptCommand,
  };
}

module.exports = { createRuntimeHost };
