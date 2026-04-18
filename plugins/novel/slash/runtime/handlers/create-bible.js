module.exports.run = async function run(host, descriptor) {
  const profile = (await host.readPluginStorage('novel.lastProfile')) || descriptor.defaultSkill || 'default';
  const context = await host.restoreNovelContext();
  const skill = host.loadSkillText(profile, 'create-bible.md');

  await host.emitTasks([
    { id: 'bible-restore', text: '恢复小说项目上下文', status: 'completed' },
    { id: 'bible-delegate', text: '整理任务封包并委派子 agent', status: 'running' },
  ]);

  await host.spawnSubagent([
    '你正在执行 novel 插件的 create-bible 工作流。',
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
    context.settingBrief || '(暂无 setting brief)',
    '',
    '请使用工作区写文件能力创建或更新 .novel/setting/bible.md；如有必要，可补充人物、势力、体系等相关设定文件。',
  ].join('\n'), '创建设定集');
  await host.writePluginStorage('novel.lastWorkflow', { handler: 'create-bible', profile });

  await host.emitTasks([
    { id: 'bible-restore', text: '恢复小说项目上下文', status: 'completed' },
    { id: 'bible-delegate', text: '整理任务封包并委派子 agent', status: 'completed' },
  ]);
  return { status: 'handled' };
};
