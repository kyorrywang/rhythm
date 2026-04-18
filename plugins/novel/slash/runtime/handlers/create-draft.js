module.exports.run = async function run(host, descriptor) {
  const profile = (await host.readPluginStorage('novel.lastProfile')) || descriptor.defaultSkill || 'default';
  const context = await host.restoreNovelContext();
  const skill = host.loadSkillText(profile, 'create-draft.md');

  await host.emitTasks([
    { id: 'draft-restore', text: '恢复小说项目上下文', status: 'completed' },
    { id: 'draft-delegate', text: '整理任务封包并委派子 agent', status: 'running' },
  ]);

  await host.spawnSubagent([
    '你正在执行 novel 插件的 create-draft 工作流。',
    '',
    '## workflow skill',
    skill,
    '',
    host.renderContextSnapshot(context),
    '',
    '## 本次直接输入',
    host.call.input.userInput || '(无额外输入)',
    '',
    '## 本次 brief',
    context.arcBrief || '(暂无 arc brief)',
    '',
    '请使用工作区写文件能力创建或更新 .novel/chapters/ 下的章节文件。若需多章，请优先串行规划，确保连续性。',
  ].join('\n'), '创作正文');
  await host.writePluginStorage('novel.lastWorkflow', { handler: 'create-draft', profile });

  await host.emitTasks([
    { id: 'draft-restore', text: '恢复小说项目上下文', status: 'completed' },
    { id: 'draft-delegate', text: '整理任务封包并委派子 agent', status: 'completed' },
  ]);
  return { status: 'handled' };
};
