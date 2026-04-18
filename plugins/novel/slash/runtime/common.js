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

  function normalizeWorkspacePath(target) {
    return path.relative(workspaceRoot(), target).replace(/\\/g, '/');
  }

  function slashRoot() {
    return path.join(__dirname, '..');
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

  async function askUser(title, questions) {
    return rpc('askUser', { title, questions });
  }

  async function spawnSubagent(message, title) {
    return rpc('spawnSubagent', { message, title, agent_id: 'dynamic' });
  }

  async function emitTasks(tasks) {
    return rpc('task.update', { tasks });
  }

  async function readPluginStorage(key) {
    return rpc('pluginStorage.get', { key });
  }

  async function writePluginStorage(key, value) {
    return rpc('pluginStorage.set', { key, value });
  }

  function loadSkillText(profile, fileName) {
    const preferred = path.join(slashRoot(), 'skills', profile, fileName);
    const fallback = path.join(slashRoot(), 'skills', 'default', fileName);
    return fs.readFileSync(fs.existsSync(preferred) ? preferred : fallback, 'utf8');
  }

  function yamlValue(text, key) {
    const match = String(text || '').match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
    return match ? match[1].trim() : null;
  }

  function defaultNovelRoot(projectText) {
    return yamlValue(projectText, 'root') || '.novel';
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

  function buildProjectYaml(title, profile, root, options = {}) {
    const settingRounds = options.settingRounds || 4;
    const arcRounds = options.arcRounds || 4;
    const chapterMode = options.chapterMode || 'serial';
    return [
      `title: ${title}`,
      `profile: ${profile}`,
      '',
      'skills:',
      `  discuss_setting: ${profile}`,
      `  create_bible: ${profile}`,
      `  discuss_arc: ${profile}`,
      `  create_draft: ${profile}`,
      `  archive_state: ${profile}`,
      '',
      'paths:',
      `  root: ${root}`,
      `  bible: ${root}/setting/bible.md`,
      `  outline: ${root}/outline/master-outline.md`,
      `  chapters: ${root}/chapters`,
      `  archive: ${root}/archive`,
      '',
      'discussion:',
      `  setting_rounds: ${settingRounds}`,
      '  setting_questions_per_round: 8',
      `  arc_rounds: ${arcRounds}`,
      '  arc_questions_per_round: 8',
      '  arc_span_chapters: 4',
      '',
      'generation:',
      `  chapter_mode: ${chapterMode}`,
      '',
      'archive:',
      '  track_characters: true',
      '  track_inventory: true',
      '  track_skills: true',
      '  check_foreshadowing: true',
      '',
    ].join('\n');
  }

  return {
    call,
    workspaceRoot,
    normalizeWorkspacePath,
    readWorkspaceText,
    writeWorkspaceText,
    listWorkspaceDir,
    readIfExists,
    listFilesIfExists,
    askUser,
    spawnSubagent,
    emitTasks,
    readPluginStorage,
    writePluginStorage,
    loadSkillText,
    yamlValue,
    restoreNovelContext,
    renderContextSnapshot,
    buildProjectYaml,
  };
}

module.exports = { createRuntimeHost };
