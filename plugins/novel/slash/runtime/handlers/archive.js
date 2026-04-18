module.exports.run = async function run(host, descriptor) {
  const profile = (await host.readPluginStorage('novel.lastProfile')) || descriptor.defaultSkill || 'default';
  const context = await host.restoreNovelContext();
  const archiveSkill = host.loadSkillText(profile, 'archive.md');
  const archiveStateSkill = host.loadSkillText(profile, 'archive-state.md');
  const archiveRoot = `${context.root}\\archive`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');

  await host.emitTasks([
    { id: 'archive-restore', text: '恢复小说项目上下文', status: 'completed' },
    { id: 'archive-delegate', text: '并行委派对话归档与状态归档', status: 'running' },
  ]);

  const snapshot = host.renderContextSnapshot(context);
  await Promise.all([
    host.spawnSubagent([
      '请归档最近一次创作相关对话，提炼关键决定、用户新增要求、已执行命令以及产出文件。',
      '',
      archiveSkill,
      '',
      snapshot,
      '',
      '请使用工作区写文件能力写入以下文件：',
      `- ${host.normalizeWorkspacePath(`${archiveRoot}\\sessions\\${stamp}-session.md`)}`,
      `- ${host.normalizeWorkspacePath(`${archiveRoot}\\sessions\\latest-session.md`)}`,
      `- ${host.normalizeWorkspacePath(`${archiveRoot}\\summaries\\conversation-summary.md`)}`,
    ].join('\n'), '归档对话'),
    host.spawnSubagent([
      '请归档当前创作状态，更新人物、物品、技能、世界事实与伏笔连续性。',
      '',
      archiveStateSkill,
      '',
      snapshot,
      '',
      '请使用工作区写文件能力写入以下文件：',
      `- ${host.normalizeWorkspacePath(`${archiveRoot}\\summaries\\state-summary.md`)}`,
      `- ${host.normalizeWorkspacePath(`${archiveRoot}\\checkpoints\\${stamp}-state.md`)}`,
    ].join('\n'), '归档状态'),
  ]);

  await host.writePluginStorage('novel.lastArchiveAt', new Date().toISOString());
  await host.emitTasks([
    { id: 'archive-restore', text: '恢复小说项目上下文', status: 'completed' },
    { id: 'archive-delegate', text: '并行委派对话归档与状态归档', status: 'completed' },
  ]);
  return { status: 'handled' };
};
