# DSH 对话执行小卡片

用户已确认并批准实施：在DSH原生聊天区，编排Agent调用业务时显示单次执行小卡片。运行管理页、侧栏入口和双列任务列表方案作废。现已实现原生聊天挂载与可嵌入Factory，保留原有概览、入库页面。

## 展示

每次调用绑定一个runId，在对应聊天轮次中展示一张紧凑卡片：

- 标题：业务名称；没有可靠名称时显示真实toolId。
- 状态：运行中、完成、失败、取消中等实际状态。
- 模型：本次固定模型；缺省显示未设置模型。它与主聊天使用的模型可能不同。
- 当前阶段、进度条、已上报百分比；没有百分比时显示“—”，不补造阶段清单或进度。
- 最近消息与取消按钮；不提供暂停。完成后显示最终文本及文件下载按钮，失败、取消、中断也保留已登记产物下载入口。
- 错误显示阶段和原因，最新告警及时显示；日志和完整错误、告警记录折叠在“查看过程”中。

默认不展示任务管理列表、工作区选择表单、runId、JSON、输入文件路径或大段日志。卡片在同一位置更新，不随每次进度新增一条聊天消息。无需新建Page.tsx或独立导航入口。

## 调用与数据

编排通过sf_runtime_run_tool正常启动任务。history.ts只匹配该工具的原生tool/call，并按callId配对tool/result，校验成功回执中的runId。一个聊天轮次支持多次调用，按runId去重。根据持久化调用记录重建引用，不把任意工具返回的JSON当作Run。缺少调用证据的截断历史暂不生成卡片，继续保留宿主工具回执。

integration.tsx通过原生tool.call.toolview显示简短提交回执，在conversation.chat.turnTail展示卡片，卡片位于可折叠执行过程之外。只读取本次任务：getRun取得快照，waitRun每次最多等待15秒，有新报告时刷新快照；cancelRun取消；getArtifact取得服务端授权下载地址，按钮通过同源GET下载。卸载、切换任务或Remote撤销时中止请求。终态停止等待；网络失败提供“重新连接”，不自动重试取消操作。无需listRuns或新的后端接口。

RunCard.tsx负责展示及操作，useRun.ts负责快照和有界等待，api.ts适配生成的Remote并检查下载路由，history.ts恢复聊天引用，integration.tsx登记Factory及聊天Slot。样式仅作用于sf-run命名空间并使用宿主主题变量。

## 编排插件嵌入接口

公开入口为@software-factory/webui/runtime，导出RunCardProps、RunCardFinished及RUN_CARD_FACTORY常量。Factory名为softwareFactory.runCard。

| 输入 | 含义 |
| --- | --- |
| runId | Runtime真实返回的任务ID |
| runtimeSessionId | 实际启动该Run的DSH会话ID；独立执行会话与当前聊天会话不同时，传独立会话ID |
| title? | 可读业务名称；缺省使用实际toolId |
| onFinished? | 终态通知：runId、status、text?、files及error?；包含失败、取消、中断 |

onFinished在同一组件挂载期间每个会话／任务只通知一次。重开聊天读取到终态也会通知；不是服务端可靠队列，编排应以Runtime真实状态决定后续步骤。嵌入示例见本包README。

自动聊天挂载覆盖主会话直接调用sf_runtime_run_tool的原生调用记录。编排通过Remote或隔离子会话启动时，应在自己的聊天卡片／视图中显式嵌入Factory，并传实际runtimeSessionId；不靠扫描其他会话或解析模型正文。

编排Agent自己调用模型做报告，也应包装成使用Runtime SDK的业务Tool并上报阶段、进度、错误和产物，再经Runtime启动。卡片展示本次任务启动时固定的模型，不猜测任意模型调用的内部阶段或跟随主聊天后续模型切换。

## input/request.json 是什么

这是Runtime在启动时自动保存的后端参数快照，路径为发起任务的真实DSH工作区下outputs/runs/<runId>/input/request.json，包含toolId、实际input，以及提供时的model／timeoutMs。它不在插件安装目录，不会因插件升级覆盖。用户不用手工填写，卡片不展示该路径；业务算法仍从execute的input参数取得输入。

## 预览与验证

类型检查、构建和14项WebUI验证通过。真实Cordis／SlotRegistry验证聊天Slot激活、停用及再次启用；构建后的React卡片经过真实DSH Client Gateway和生成的Runtime编解码验证进度、失败原因、产物下载地址、取消、终态回调及卸载中止，数据与连接为合成。保留12项原有回归并增加2项关键测试。

未安装实际profile，未调用真实模型；实际DSH浏览器视觉及登录后的文件下载尚待部署验收。JSDOM验证不等于真实浏览器验收。实时cordis_inspect／plugin_manager未提供，未声称调用。
