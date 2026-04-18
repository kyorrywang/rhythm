module.exports.run = async function run(host, descriptor) {
  const profile = (await host.readPluginStorage('novel.lastProfile')) || descriptor.defaultSkill || 'default';
  const context = await host.restoreNovelContext();
  const instruction = host.loadSkillText(profile, 'discuss-arc.md');
  const rounds = Number(host.yamlValue(context.project, 'arc_rounds') || 4);
  const log = [
    '## 小剧情草案',
    `建议接下来 3-5 章围绕以下方向展开：\n- ${host.call.input.userInput || '主角遭遇新的冲突并推进主线'}`,
    '',
  ];

  await host.emitTasks([
    { id: 'arc-restore', text: '恢复小说项目上下文', status: 'completed' },
    { id: 'arc-discuss', text: '执行多轮正文探讨并记录结论', status: 'running' },
  ]);

  for (let index = 0; index < rounds; index += 1) {
    const result = await host.askUser(`正文探讨 第 ${index + 1} 轮`, [
      { id: `arc-focus-${index}`, question: '这段 3-5 章的小剧情要重点解决什么？', options: ['冲突升级', '角色成长', '信息揭示', '结尾钩子'], selectionType: 'multiple_with_input' },
      { id: `arc-style-${index}`, question: '本轮正文探讨更偏什么？', options: ['节奏更快', '冲突更强', '情绪更浓', '细节更多'], selectionType: 'single_with_input' },
    ]);
    log.push(`## 第 ${index + 1} 轮`);
    log.push(JSON.stringify(result, null, 2));
    log.push('');
  }

  await host.writeWorkspaceText(`${context.root}\\discovery\\arc-discussion.md`, [
    '# novel:arc-discussion',
    '',
    instruction,
    '',
    host.renderContextSnapshot(context),
    '',
    log.join('\n'),
  ].join('\n'));
  await host.writeWorkspaceText(`${context.root}\\discovery\\arc-brief.md`, [
    '# novel:arc-brief',
    '',
    `profile: ${profile}`,
    '',
    log.join('\n'),
  ].join('\n'));
  await host.writePluginStorage('novel.lastWorkflow', { handler: 'discuss-arc', profile });

  await host.emitTasks([
    { id: 'arc-restore', text: '恢复小说项目上下文', status: 'completed' },
    { id: 'arc-discuss', text: '执行多轮正文探讨并记录结论', status: 'completed' },
  ]);
  return { status: 'handled' };
};
