export const zh = {
    execution: '任务执行', model: '执行模型', noModel: '未设置模型', noStage: '尚未上报阶段', noProgress: '尚未上报进度',
    progress: '执行进度', loading: '读取中', unavailable: '执行服务未就绪', enableRuntime: '请启用 Runtime 插件后查看。',
    queued: '排队中', running: '运行中', cancelling: '取消中', completed: '已完成', failed: '执行失败', cancelled: '已取消', interrupted: '已中断',
    warning: '告警', error: '错误', artifacts: '执行产物', download: '下载', intermediate: '中间产物', details: '查看过程', retry: '重新连接', cancel: '取消',
    starting: '正在提交任务…', receipt: '任务已提交，执行过程见下方卡片。', startFailed: '任务启动失败',
    finalArtifacts: '最终产物', openDirectory: '打开中间产物目录', fileCount: '个文件',
};
export type Key = keyof typeof zh;
export type Translate = (key: Key) => string;
export const en: Record<Key, string> = {
    execution: 'Task execution', model: 'Model', noModel: 'No model configured', noStage: 'No stage reported', noProgress: 'No progress reported',
    progress: 'Execution progress', loading: 'Loading', unavailable: 'Runtime unavailable', enableRuntime: 'Enable the Runtime plugin to view this task.',
    queued: 'Queued', running: 'Running', cancelling: 'Cancelling', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted',
    warning: 'Warning', error: 'Error', artifacts: 'Artifacts', download: 'Download', intermediate: 'Intermediate', details: 'View process', retry: 'Reconnect', cancel: 'Cancel',
    starting: 'Submitting task…', receipt: 'Task submitted. Follow its progress in the card below.', startFailed: 'Failed to start task',
    finalArtifacts: 'Final outputs', openDirectory: 'Open intermediate directory', fileCount: 'files',
};
