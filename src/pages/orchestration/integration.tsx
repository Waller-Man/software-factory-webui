import { useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime, PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots';
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client';
import { TYPERT_REMOTE } from '../../../../orchestration/lib/typert.remote-client.js';
import { SelectionClient, type SelectionRemote } from './api.ts';
import { SelectionConversation, SelectionPage } from './Page.tsx';
import { ReviewCard } from './ReviewCard.tsx';
import { selectionDefinition, SELECTION_KEY, SELECTION_TOOL } from './history.ts';
import { ExecutionModel } from './ExecutionModel.tsx';
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap { 'softwareFactory.orchestrationConversation': { kind: 'single'; scope: 'session' } }
  interface SlotFactoryMap {
    'softwareFactory.orchestrationPage': { scope: 'root'; props: Record<string, never>; children: { 'softwareFactory.orchestrationConversation': { kind: 'single'; scope: 'session' } } };
    'softwareFactory.executionModel': { scope: 'root'; props: { runtimeSessionId: string; locked: boolean; onReady: (ready: boolean) => void } };
  }
}
const panel = 'software-factory-orchestration' as MainPanelId;
function SelectionIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="6" height="5" rx="1"/><rect x="2" y="16" width="6" height="5" rx="1"/><rect x="16" y="9" width="6" height="6" rx="1"/><path d="M8 5.5h4v13H8m4-6.5h4"/></svg>; }
function Entry({ renderFactorySlot }: PropsRenderFactories) { return renderFactorySlot('softwareFactory.orchestrationPage', {}); }
function Tail(props: PropsRuntime<'conversation.chat.turnTail'> & PropsRenderFactories & { client: SelectionClient }) {
  const source = props.turn.data.source(SELECTION_KEY), ids = useSyncExternalStore(source.subscribe, source.getSnapshot);
  return ids?.length ? <div>{ids.map(id => <ReviewCard key={id} selectionId={id} client={props.client} renderFactorySlot={props.renderFactorySlot}/>)}</div> : null;
}
export function mountSelection(ctx: Context) {
  const client = new SelectionClient();
  // Native services trace calls through the caller's context. Keep the model
  // control in the scope that declares the session Remote it indirectly uses.
  ctx.inject(['sessions', 'modelDirectories', 'remote.session'], scope => {
    scope.slots.registerFactory({ name: 'softwareFactory.executionModel', scope: 'root' }, props => <ExecutionModel {...props} ctx={scope}/>);
  });
  ctx.slots.registerFactory({ name: 'softwareFactory.orchestrationPage', scope: 'root', children: { 'softwareFactory.orchestrationConversation': { kind: 'single', scope: 'session' } } }, props => <SelectionPage {...props} client={client} ctx={ctx}/>);
  ctx.slots.inject('softwareFactory.orchestrationConversation', () => ctx.slots.register({ name: 'softwareFactory.orchestrationConversation' }, SelectionConversation));
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: panel }, Entry));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: panel, order: 7, locale: 'softwareFactory', label: () => ctx.locale.bind('softwareFactory')('orchestration') }, SelectionIcon));
  const gateway = ctx.get('remote');
  if (typeof gateway?.$mount === 'function') ctx.effect(async () => { const remove = await gateway.$mount(TYPERT_REMOTE); return () => remove(); });
  ctx.inject(['remote.sfOrchestration'], scope => {
    const remote = (scope.get('remote') as unknown as { sfOrchestration: SelectionRemote }).sfOrchestration;
    client.setRemote(remote);
    scope.effect(() => () => { if (client.getSnapshot() === remote) client.setRemote(undefined); });
  });
  ctx.inject(['uiConversation'], scope => {
    const conversation = scope.get('uiConversation');
    if (!conversation) return;
    conversation.events.register(selectionDefinition);
    scope.slots.inject('conversation.chat.turnTail', () => scope.slots.register({ name: 'conversation.chat.turnTail', id: SELECTION_KEY }, props => <Tail {...props} client={client}/>));
    scope.slots.inject('tool.call.toolview', () => scope.slots.register({ name: 'tool.call.toolview', key: SELECTION_TOOL }, props => <p>{props.phase === 'result' ? '选择结果见本轮审核卡片' : '正在提交选择依据…'}</p>));
  });
  ctx.effect(() => () => { client.setRemote(undefined); if (ctx.layout.panelInfo.getSnapshot().activePanelId === panel) ctx.layout.selectPanel(null); });
}

