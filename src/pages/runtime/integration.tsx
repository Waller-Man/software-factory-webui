import { useSyncExternalStore } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime, PropsRenderFactories } from '@deepseek-ai/dsh-client-ui-slots';
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type {} from '@deepseek-ai/dsh-client-ui-chat/client';
import { TYPERT_REMOTE } from '../../../../runtime/lib/typert.remote-client.js';
import { RUN_CARD_FACTORY, type RunCardProps } from '../../runtime.ts';
import { RuntimeClient, type RuntimeRemote, type SessionRemote } from './api.ts';
import { RunCard } from './RunCard.tsx';
import { acceptedRun, RUN_TOOL, RUN_TURN_KEY, runDefinition } from './history.ts';
import { zh, en, type Key, type Translate } from './i18n.ts';
import type { ModelCatalog } from '@deepseek-ai/dsh-api-session-controller/types';

declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap { softwareFactoryRun: Key }
}
function Receipt(props: ToolCallViewProps & { t: Translate }) {
    if (props.phase !== 'result') return <p className="sf-run-receipt">{props.t('starting')}</p>;
    if (!props.block.isError && acceptedRun(props.block.content)) return <p className="sf-run-receipt">{props.t('receipt')}</p>;
    const message = props.block.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
    let reason = message;
    try { reason = JSON.parse(message)?.error?.message ?? message; } catch { /* Host error text. */ }
    return <p className="sf-run-error" role="alert">{props.t('startFailed')}{reason && `：${reason}`}</p>;
}
function ChatRuns({ turn, sessionId, renderFactorySlot }: PropsRuntime<'conversation.chat.turnTail'> & PropsRenderFactories) {
    const source = turn.data.source(RUN_TURN_KEY);
    const runs = useSyncExternalStore(source.subscribe, source.getSnapshot);
    return runs?.length ? <div className="sf-run-stack">{runs.map(run => <div key={run.runId}>{renderFactorySlot(RUN_CARD_FACTORY, { runId: run.runId, runtimeSessionId: sessionId, title: run.title })}</div>)}</div> : null;
}
/** Optional services are scoped: disabling Runtime must not break the other pages. */
export function mountRuntimeCards(ctx: Context): void {
    const client = new RuntimeClient();
    ctx.effect(() => ctx.locale.register('softwareFactoryRun', { zh, en }));
    const t = ctx.locale.bind('softwareFactoryRun');
    let catalog: Promise<ModelCatalog | undefined> | undefined;
    const modelNameFor = async (provider: string, model: string) => {
        catalog ??= client.getSessionSnapshot()?.modelCatalog().then(result => result.ok ? result.value : undefined);
        return (await catalog)?.groups.find(group => group.id === provider)?.models.find(item => item.id === model)?.name;
    };
    ctx.slots.registerFactory({ name: RUN_CARD_FACTORY, scope: 'root' }, (props: RunCardProps) => <RunCard {...props} client={client} t={t} modelNameFor={modelNameFor} />);
    ctx.effect(() => () => { client.setRemote(undefined); client.setSession(undefined); });
    ctx.inject(['remote.session'], scope => {
        const session = scope.get('remote')?.session as SessionRemote | undefined;
        if (!session) return;
        client.setSession(session); catalog = undefined;
        scope.effect(() => () => { if (client.getSessionSnapshot() === session) { client.setSession(undefined); catalog = undefined; } });
    });
    // Mount the backend-generated descriptor, not a handwritten endpoint map.
    const gateway = ctx.get('remote') as Context['remote'] | undefined;
    if (typeof gateway?.$mount === 'function') ctx.effect(async () => {
        const dispose = await gateway.$mount(TYPERT_REMOTE);
        return () => dispose();
    });
    ctx.inject(['remote.sfRuntime'], scope => {
        const remote = (scope.get('remote') as unknown as { sfRuntime?: RuntimeRemote })?.sfRuntime;
        if (!remote) return;
        client.setRemote(remote);
        scope.effect(() => () => { if (client.getSnapshot() === remote) client.setRemote(undefined); });
    });
    ctx.inject(['uiConversation'], scope => {
        const conversation = scope.get('uiConversation') as Context['uiConversation'] | undefined;
        if (!conversation) return;
        conversation.events.register(runDefinition);
        scope.slots.inject('tool.call.toolview', () => scope.slots.register({ name: 'tool.call.toolview', key: RUN_TOOL, locale: 'softwareFactoryRun', inject: () => ({ t }) }, Receipt));
        scope.slots.inject('conversation.chat.turnTail', () => scope.slots.register({ name: 'conversation.chat.turnTail', id: RUN_TURN_KEY }, ChatRuns));
    });
}
