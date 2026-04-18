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

  function slashTemplatesRoot() {
    return path.resolve(pluginRoot(), 'slash', 'templates');
  }

  function novelsRoot() {
    return path.join(workspaceRoot(), '.novels');
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

  function loadTemplateText(fileName) {
    return fs.readFileSync(path.join(slashTemplatesRoot(), fileName), 'utf8');
  }

  function slugifyProjectId(input) {
    return String(input || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48);
  }

  function generateProjectId(seed) {
    const slug = slugifyProjectId(seed);
    const suffix = Math.random().toString(36).slice(2, 8);
    return slug ? `${slug}-${suffix}` : `novel-${suffix}`;
  }

  function yamlString(value) {
    return JSON.stringify(String(value ?? ''));
  }

  function yamlBoolean(value) {
    return value ? 'true' : 'false';
  }

  function pickDefinedObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  function normalizeBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function normalizeString(value, fallback) {
    const text = String(value ?? '').trim();
    return text || fallback;
  }

  function normalizeProfile(profile, availableProfiles) {
    const normalized = normalizeString(profile, '');
    if (!normalized) {
      throw new Error('novel_init_project requires a non-empty profile');
    }
    if (Array.isArray(availableProfiles) && availableProfiles.length > 0 && !availableProfiles.includes(normalized)) {
      throw new Error(`Profile '${normalized}' is not in available_profiles`);
    }
    return normalized;
  }

  function buildProjectYaml(init) {
    const projectId = normalizeString(init.project_id, generateProjectId(init.title || init.genre || 'novel'));
    const profile = normalizeProfile(init.profile, init.available_profiles);
    const title = normalizeString(init.title, `未命名项目 ${projectId}`);
    const genre = normalizeString(init.genre, '');
    const premise = normalizeString(init.premise, '');
    if (!genre) {
      throw new Error('novel_init_project requires a non-empty genre');
    }
    if (!premise) {
      throw new Error('novel_init_project requires a non-empty premise');
    }

    const skillsInput = pickDefinedObject(init.skills);
    const discussionInput = pickDefinedObject(init.discussion);
    const generationInput = pickDefinedObject(init.generation);
    const archiveInput = pickDefinedObject(init.archive);

    const skills = {
      init: normalizeString(skillsInput.init, profile),
      discuss_bible: normalizeString(skillsInput.discuss_bible, profile),
      discuss_arc: normalizeString(skillsInput.discuss_arc, profile),
      create_draft: normalizeString(skillsInput.create_draft, profile),
      archive: normalizeString(skillsInput.archive, profile),
    };

    const discussion = {
      setting_rounds: normalizeString(discussionInput.setting_rounds, '3-5'),
      setting_questions_per_round: normalizeString(discussionInput.setting_questions_per_round, '5-10'),
      arc_rounds: normalizeString(discussionInput.arc_rounds, '3-5'),
      arc_questions_per_round: normalizeString(discussionInput.arc_questions_per_round, '5-10'),
      arc_span_chapters: normalizeString(discussionInput.arc_span_chapters, '3-5'),
    };

    const generation = {
      chapter_mode: normalizeString(generationInput.chapter_mode, 'serial'),
    };

    const archive = {
      track_characters: normalizeBoolean(archiveInput.track_characters, true),
      track_inventory: normalizeBoolean(archiveInput.track_inventory, true),
      track_skills: normalizeBoolean(archiveInput.track_skills, true),
      check_foreshadowing: normalizeBoolean(archiveInput.check_foreshadowing, true),
    };

    const projectRoot = `.novels/${projectId}`;
    const projectYaml = [
      `project_id: ${yamlString(projectId)}`,
      `title: ${yamlString(title)}`,
      `profile: ${yamlString(profile)}`,
      `genre: ${yamlString(genre)}`,
      `premise: ${yamlString(premise)}`,
      '',
      'skills:',
      `  init: ${yamlString(skills.init)}`,
      `  discuss_bible: ${yamlString(skills.discuss_bible)}`,
      `  discuss_arc: ${yamlString(skills.discuss_arc)}`,
      `  create_draft: ${yamlString(skills.create_draft)}`,
      `  archive: ${yamlString(skills.archive)}`,
      '',
      'paths:',
      `  root: ${yamlString(projectRoot)}`,
      `  bible: ${yamlString(`${projectRoot}/setting/bible.md`)}`,
      `  outline: ${yamlString(`${projectRoot}/outline/master-outline.md`)}`,
      `  chapters: ${yamlString(`${projectRoot}/chapters`)}`,
      `  archive: ${yamlString(`${projectRoot}/archive`)}`,
      '',
      'discussion:',
      `  setting_rounds: ${discussion.setting_rounds}`,
      `  setting_questions_per_round: ${discussion.setting_questions_per_round}`,
      `  arc_rounds: ${discussion.arc_rounds}`,
      `  arc_questions_per_round: ${discussion.arc_questions_per_round}`,
      `  arc_span_chapters: ${discussion.arc_span_chapters}`,
      '',
      'generation:',
      `  chapter_mode: ${yamlString(generation.chapter_mode)}`,
      '',
      'archive:',
      `  track_characters: ${yamlBoolean(archive.track_characters)}`,
      `  track_inventory: ${yamlBoolean(archive.track_inventory)}`,
      `  track_skills: ${yamlBoolean(archive.track_skills)}`,
      `  check_foreshadowing: ${yamlBoolean(archive.check_foreshadowing)}`,
      '',
    ].join('\n');

    return {
      projectId,
      title,
      projectRoot,
      projectYaml,
      currentText: `${projectId}\n`,
    };
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

  function yamlNestedValue(text, section, key) {
    const match = String(text || '').match(
      new RegExp(`^\\s*${section}:\\s*$[\\s\\S]*?^\\s{2}${key}:\\s*(.+)$`, 'm'),
    );
    return match ? match[1].trim() : null;
  }

  function readDiscussionConfig(projectText) {
    return {
      setting_rounds: yamlNestedValue(projectText, 'discussion', 'setting_rounds'),
      setting_questions_per_round: yamlNestedValue(projectText, 'discussion', 'setting_questions_per_round'),
      arc_rounds: yamlNestedValue(projectText, 'discussion', 'arc_rounds'),
      arc_questions_per_round: yamlNestedValue(projectText, 'discussion', 'arc_questions_per_round'),
      arc_span_chapters: yamlNestedValue(projectText, 'discussion', 'arc_span_chapters'),
    };
  }

  function defaultNovelRoot(projectText) {
    return yamlValue(projectText, 'root') || '.novel';
  }

  async function readCurrentProjectId() {
    const current = await readIfExists(path.join(novelsRoot(), 'current.txt'));
    return current ? current.trim() || null : null;
  }

  function skillConfigKeyForDescriptor(descriptor) {
    return String(descriptor?.entry?.id || '')
      .trim()
      .replace(/-/g, '_');
  }

  function skillConfigKeyForFile(fileName, descriptor) {
    const baseName = String(fileName || '')
      .replace(/\.md$/i, '')
      .trim()
      .replace(/-/g, '_');
    return baseName || skillConfigKeyForDescriptor(descriptor);
  }

  function resolveActiveProfile(descriptor, context, fileName) {
    const commandSkillKey = fileName
      ? skillConfigKeyForFile(fileName, descriptor)
      : skillConfigKeyForDescriptor(descriptor);
    return yamlNestedValue(context?.project, 'skills', commandSkillKey)
      || yamlValue(context?.project, 'profile')
      || descriptor.defaultSkill
      || 'default';
  }

  async function restoreNovelContext() {
    const currentProjectId = await readCurrentProjectId();
    let root = novelsRoot();
    let projectPath = path.join(root, 'project.yaml');
    let project = null;

    if (currentProjectId) {
      root = path.join(novelsRoot(), currentProjectId);
      projectPath = path.join(root, 'project.yaml');
      project = await readIfExists(projectPath);
    }

    if (!project) {
      const legacyProjectPath = path.join(workspaceRoot(), '.novel', 'project.yaml');
      const legacyProject = await readIfExists(legacyProjectPath);
      if (legacyProject) {
        project = legacyProject;
        projectPath = legacyProjectPath;
        root = path.join(workspaceRoot(), defaultNovelRoot(legacyProject));
      }
    }

    if (project && !currentProjectId) {
      root = path.join(workspaceRoot(), defaultNovelRoot(project));
    }

    const archiveSummary = await readIfExists(path.join(root, 'archive', 'summaries', 'conversation-summary.md'));
    const stateSummary = await readIfExists(path.join(root, 'archive', 'summaries', 'state-summary.md'));
    const latestSession = await readIfExists(path.join(root, 'archive', 'sessions', 'latest-session.md'));
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
      currentProjectId,
      projectPath,
      root,
      project,
      archiveSummary,
      stateSummary,
      latestSession,
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
      '## 当前项目',
      context.currentProjectId || '(暂无 current project id)',
      '',
      '## 项目配置',
      context.project || '(暂无 current project.yaml)',
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

  function renderSkillBlocks(descriptor, context) {
    const files = Array.isArray(descriptor.skillFiles) && descriptor.skillFiles.length > 0
      ? descriptor.skillFiles
      : [`${descriptor.entry?.id || 'command'}.md`];
    return files.map((fileName) => ({
      fileName,
      profile: resolveActiveProfile(descriptor, context, fileName),
      content: loadSkillText(resolveActiveProfile(descriptor, context, fileName), fileName),
    }));
  }

  function renderTemplateBlocks(descriptor) {
    const files = Array.isArray(descriptor.templateFiles) ? descriptor.templateFiles : [];
    return files.map((fileName) => ({
      fileName,
      content: loadTemplateText(fileName),
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

  function renderDiscussionConfig(descriptor, context) {
    const entryId = String(descriptor?.entry?.id || '');
    if (entryId !== 'discuss-bible' && entryId !== 'discuss-arc') {
      return '';
    }
    const config = readDiscussionConfig(context?.project);
    return [
      '## Discussion Config',
      `setting_rounds: ${config.setting_rounds || '(unset)'}`,
      `setting_questions_per_round: ${config.setting_questions_per_round || '(unset)'}`,
      `arc_rounds: ${config.arc_rounds || '(unset)'}`,
      `arc_questions_per_round: ${config.arc_questions_per_round || '(unset)'}`,
      `arc_span_chapters: ${config.arc_span_chapters || '(unset)'}`,
    ].join('\n');
  }

  function buildSkillPrompt(descriptor, profile, context) {
    const normalizedInput = normalizeCommandInput(descriptor.name, call.input?.userInput || '');
    const availableProfiles = listSkillProfiles();
    const skillBlocks = renderSkillBlocks(descriptor, context);
    const templateBlocks = renderTemplateBlocks(descriptor);
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
      ...(renderDiscussionConfig(descriptor, context)
        ? ['', renderDiscussionConfig(descriptor, context)]
        : []),
      '',
      '## Output Hints',
      renderOutputHints(descriptor),
      '',
      '## Active Skill Instructions',
      ...skillBlocks.flatMap((block) => [
        '',
        `### ${block.fileName}`,
        `profile: ${block.profile}`,
        block.content,
      ]),
      ...(templateBlocks.length > 0
        ? [
            '',
            '## Output Templates',
            ...templateBlocks.flatMap((block) => [
              '',
              `### ${block.fileName}`,
              block.content,
            ]),
          ]
        : []),
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

  async function runToolCommand(commandName, input) {
    if (commandName === 'novel_init_project') {
      const project = buildProjectYaml(input || {});
      await writeWorkspaceText(path.join(workspaceRoot(), '.novels', project.projectId, 'project.yaml'), project.projectYaml);
      await writeWorkspaceText(path.join(workspaceRoot(), '.novels', 'current.txt'), project.currentText);
      return {
        ok: true,
        data: {
          project_id: project.projectId,
          title: project.title,
          project_root: project.projectRoot,
          project_yaml_path: `.novels/${project.projectId}/project.yaml`,
          current_path: '.novels/current.txt',
        },
      };
    }
    return {
      ok: false,
      error: {
        message: `Unknown tool command '${commandName}'`,
      },
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
    loadTemplateText,
    yamlValue,
    yamlNestedValue,
    readDiscussionConfig,
    restoreNovelContext,
    renderContextSnapshot,
    renderDiscussionConfig,
    normalizeCommandInput,
    resolveActiveProfile,
    buildSkillPrompt,
    runSkillPromptCommand,
    buildProjectYaml,
    runToolCommand,
  };
}

module.exports = { createRuntimeHost };
