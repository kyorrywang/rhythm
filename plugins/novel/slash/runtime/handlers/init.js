function answerFor(result, questionId) {
  return (result.answers || []).find((item) => item.questionId === questionId) || { selected: [], text: '' };
}

module.exports.run = async function run(host, descriptor) {
  await host.emitTasks([
    { id: 'init-config', text: '收集小说项目初始化选项', status: 'running' },
    { id: 'init-write', text: '写入 .novel/project.yaml', status: 'pending' },
  ]);

  const result = await host.askUser('初始化小说项目', [
    { id: 'title', question: '作品标题怎么处理？', options: ['使用当前输入概括', '手动输入', '稍后再改'], selectionType: 'single_with_input' },
    { id: 'profile', question: '默认创作 profile？', options: ['default', 'xuanhuan'], selectionType: 'single_with_input' },
    { id: 'setting-rounds', question: '设定探讨轮次？', options: ['3 轮', '4 轮', '5 轮'], selectionType: 'single_with_input' },
    { id: 'chapter-mode', question: '章节生成方式？', options: ['serial', 'parallel if independent'], selectionType: 'single_with_input' },
  ]);

  const titleAnswer = answerFor(result, 'title');
  const profileAnswer = answerFor(result, 'profile');
  const roundsAnswer = answerFor(result, 'setting-rounds');
  const chapterModeAnswer = answerFor(result, 'chapter-mode');

  const title = titleAnswer.text || host.call.input.userInput || '暂定书名';
  const profile = profileAnswer.selected[0] || descriptor.defaultSkill || 'default';
  const settingRounds = roundsAnswer.selected[0] === '3 轮' ? 3 : roundsAnswer.selected[0] === '5 轮' ? 5 : 4;
  const chapterMode = chapterModeAnswer.selected[0] === 'parallel if independent' ? 'parallel_if_independent' : 'serial';

  await host.emitTasks([
    { id: 'init-config', text: '收集小说项目初始化选项', status: 'completed' },
    { id: 'init-write', text: '写入 .novel/project.yaml', status: 'running' },
  ]);

  await host.writeWorkspaceText(`${host.workspaceRoot()}\\.novel\\project.yaml`, host.buildProjectYaml(title, profile, '.novel', {
    settingRounds,
    arcRounds: 4,
    chapterMode,
  }));
  await host.writePluginStorage('novel.lastProfile', profile);

  await host.emitTasks([
    { id: 'init-config', text: '收集小说项目初始化选项', status: 'completed' },
    { id: 'init-write', text: '写入 .novel/project.yaml', status: 'completed' },
  ]);
  return { status: 'handled' };
};
