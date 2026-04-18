module.exports.run = async function run(host, descriptor) {
  const profile = (await host.readPluginStorage('novel.lastProfile')) || descriptor.defaultSkill || 'default';
  const context = await host.restoreNovelContext();
  const instruction = host.loadSkillText(profile, 'discuss-setting.md');
  const rounds = Number(host.yamlValue(context.project, 'setting_rounds') || 4);
  const log = [];

  await host.emitTasks([
    { id: 'setting-restore', text: '恢复小说项目上下文', status: 'completed' },
    { id: 'setting-discuss', text: '执行多轮设定探讨并记录结论', status: 'running' },
  ]);

  for (let index = 0; index < rounds; index += 1) {
    const result = await host.askUser(`设定探讨 第 ${index + 1} 轮`, [
      { id: `setting-focus-${index}`, question: '这一轮先确定什么？', options: ['题材与基调', '世界观规则', '主角与关系', '主线目标'], selectionType: 'multiple_with_input' },
      { id: `setting-style-${index}`, question: '希望这一轮提问更偏哪种风格？', options: ['保守推进', '大胆差异化', '偏市场化', '偏文学化'], selectionType: 'single_with_input' },
    ]);
    log.push(`## 第 ${index + 1} 轮`);
    log.push(JSON.stringify(result, null, 2));
    log.push('');
  }

  await host.writeWorkspaceText(`${context.root}\\discovery\\setting-discussion.md`, [
    '# novel:setting-discussion',
    '',
    instruction,
    '',
    host.renderContextSnapshot(context),
    '',
    log.join('\n'),
  ].join('\n'));
  await host.writeWorkspaceText(`${context.root}\\discovery\\setting-brief.md`, [
    '# novel:setting-brief',
    '',
    `profile: ${profile}`,
    '',
    log.join('\n'),
  ].join('\n'));
  await host.writePluginStorage('novel.lastWorkflow', { handler: 'discuss-setting', profile });

  await host.emitTasks([
    { id: 'setting-restore', text: '恢复小说项目上下文', status: 'completed' },
    { id: 'setting-discuss', text: '执行多轮设定探讨并记录结论', status: 'completed' },
  ]);
  return { status: 'handled' };
};
